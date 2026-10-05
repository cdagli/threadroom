"""POC stitch generation. All geometry is in mm; Pystitch uses 0.1 mm.

Deliberately independent of Inkscape and GUI/native dependencies. Fill uses
even-odd scan lines (including holes), with jumps across disconnected spans.
Fill rows are grouped into sections (e.g. one per letter) and each section
is sewn before the next. Text fills use the nonzero rule so overlapping glyph
contours merge.
This is an experimental digitizer, not Ink/Stitch's production fill engine.
"""
import base64
import io
import math
import re
import time

from pystitch import (EmbPattern, EmbThread, STITCH, JUMP, TRIM,
                      COLOR_CHANGE, END, COMMAND_MASK, read_pes, write_pes)

HOOPS = {"100x100": (100, 100), "180x130": (180, 130), "300x200": (300, 200), "60x40": (60, 40)}
MAX_STITCHES = 100_000
CONNECT_TOLERANCE = 0.1
FILL_KINDS = ("fill", "cross")
KINDS = (*FILL_KINDS, "running", "bean", "backstitch", "satin", "zigzag", "e-stitch", "underlay", "manual")


def number(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number.")
    if not minimum <= value <= maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}.")
    return float(value)


def validate(project):
    if not isinstance(project, dict) or project.get("version") != 1:
        raise ValueError("Choose a supported Threadroom project (version 1).")
    if project.get("machine") != "brother-pr1x":
        raise ValueError("This prototype supports the Brother PR1X.")
    hoop = project.get("hoop")
    if hoop not in HOOPS:
        raise ValueError("Choose a supported PR1X hoop.")
    width, height = HOOPS[hoop]
    objects = project.get("objects")
    if not isinstance(objects, list) or not 1 <= len(objects) <= 80:
        raise ValueError("Add between 1 and 80 embroidery objects.")
    count = 0
    for obj in objects:
        if not isinstance(obj, dict) or obj.get("kind") not in KINDS:
            raise ValueError("Unknown stitch type.")
        if not isinstance(obj.get("color"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", obj["color"]):
            raise ValueError("Thread colours must use six-digit hex values.")
        rings = obj.get("rings")
        if not isinstance(rings, list) or not 1 <= len(rings) <= 500:
            raise ValueError("An object needs at least one path.")
        for ring in rings:
            if not isinstance(ring, list) or len(ring) < (3 if obj["kind"] in FILL_KINDS else 2):
                raise ValueError("A fill needs three points; a line needs two.")
            count += len(ring)
            if count > 12_000:
                raise ValueError("Simplify this design to fewer than 12,000 control points.")
            for point in ring:
                if not isinstance(point, list) or len(point) != 2:
                    raise ValueError("Invalid path coordinate.")
                number(point[0], 0, width, "X position")
                number(point[1], 0, height, "Y position")
        number(obj.get("spacing", 0.45), 0.3, 2, "Stitch spacing")
        number(obj.get("length", 2.5), 0.5, 3, "Stitch length")
        number(obj.get("angle", 0), -180, 180, "Fill angle")
        number(obj.get("satinWidth", 2), 0.5, 6, "Satin width")
        if not isinstance(obj.get("underlay", False), bool):
            raise ValueError("Underlay must be true or false.")
        mode = obj.get("underlayType", "auto")
        if mode not in ("auto", "center", "edge", "zigzag", "tatami"):
            raise ValueError("Unknown underlay type.")
        allowed = ("auto", "edge", "tatami") if obj["kind"] in FILL_KINDS else ("auto", "center", "edge", "zigzag") if obj["kind"] == "satin" else ("auto",)
        if obj.get("underlay") and mode not in allowed:
            raise ValueError("Choose an underlay suited to this stitch style.")
        if obj.get("fillRule", "evenodd") not in ("evenodd", "nonzero"):
            raise ValueError("Unknown fill rule.")
    return width, height, objects


def inside(point, rings, rule="evenodd", tolerance=0.001):
    x, y = point
    winding = 0
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            # A connector along the region boundary is allowed. Without this,
            # alternating rows of a rectangle would trim at every right edge.
            length_sq = (b[0]-a[0])**2 + (b[1]-a[1])**2
            if length_sq:
                t = max(0, min(1, ((x-a[0])*(b[0]-a[0])+(y-a[1])*(b[1]-a[1]))/length_sq))
                if math.hypot(x-a[0]-t*(b[0]-a[0]), y-a[1]-t*(b[1]-a[1])) < tolerance:
                    return True
            if (a[1] > y) != (b[1] > y):
                crossing = a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1])
                if x < crossing:
                    winding += 1 if b[1] > a[1] else -1
    return winding != 0 if rule == "nonzero" else winding % 2 == 1


def interpolate(a, b, max_length):
    count = max(1, math.ceil(math.dist(a, b) / max_length))
    return [[a[0]+(b[0]-a[0])*i/count, a[1]+(b[1]-a[1])*i/count] for i in range(1, count+1)]


def line_path(ring, length):
    result = [ring[0]]
    for a, b in zip(ring, ring[1:]):
        result.extend(interpolate(a, b, length))
    return result


def sample_path(ring, spacing):
    """Sample by arc distance, independent of curve display tessellation."""
    result = [ring[0]]
    remaining = spacing
    for a, b in zip(ring, ring[1:]):
        distance = math.dist(a, b)
        while distance >= remaining and distance > 1e-9:
            t = remaining/distance
            a = [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]
            result.append(a)
            distance = math.dist(a, b)
            remaining = spacing
        remaining -= distance
    if math.dist(result[-1], ring[-1]) > 1e-6:
        result.append(ring[-1])
    return result


def scan_spans(rings, y, rule):
    crossings = []
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                crossings.append((a[0] + (y-a[1]) * (b[0]-a[0])/(b[1]-a[1]), 1 if b[1] > a[1] else -1))
    crossings.sort()
    if rule != "nonzero":
        xs = [x for x, _ in crossings]
        return list(zip(xs[::2], xs[1::2]))
    spans, winding, start = [], 0, 0
    for x, direction in crossings:
        if winding == 0:
            start = x
        winding += direction
        if winding == 0:
            spans.append((start, x))
    return spans


def fill_sections(rotated, spacing, rule):
    """Groups scan-line spans into sections that can be sewn back and forth
    without leaving the shape: a span continues a section only when the two
    overlap exclusively. Letters, and parts split by holes, become sections."""
    ys = [p[1] for r in rotated for p in r]
    y = min(ys) + spacing/2
    sections, active = [], []
    while y < max(ys):
        spans = [span for span in scan_spans(rotated, y, rule) if span[1]-span[0] >= 0.15]
        overlaps = lambda a, b: a[0] < b[1] and b[0] < a[1]
        following = []
        for span in spans:
            matches = [section for section in active if overlaps(section[-1][1:], span)]
            if len(matches) == 1 and sum(overlaps(matches[0][-1][1:], other) for other in spans) == 1:
                matches[0].append((y, *span))
                following.append(matches[0])
            else:
                section = [(y, *span)]
                sections.append(section)
                following.append(section)
        active = following
        y += spacing
    return sections


def fill_paths(rings, spacing, angle, length, rule="evenodd"):
    theta = math.radians(angle)
    c, s = math.cos(theta), math.sin(theta)
    rotated = [[[x*c+y*s, -x*s+y*c] for x, y in r] for r in rings]
    remaining = fill_sections(rotated, spacing, rule)
    at = None
    while remaining:
        # Sew the nearest section next to keep jumps and trims short.
        section = min(remaining, key=lambda sec: 0 if at is None else math.dist(at, [sec[0][1], sec[0][0]]))
        remaining.remove(section)
        for row, (y, left, right) in enumerate(section):
            a, b = ([right, y], [left, y]) if row % 2 else ([left, y], [right, y])
            path = [a] + interpolate(a, b, length)
            at = path[-1]
            yield [[x*c-y*s, x*s+y*c] for x, y in path]


def satin_path(ring, spacing, width, style="satin"):
    # Constant-width satin along a user-drawn centre line.
    points = sample_path(ring, spacing)
    closed = len(ring) > 2 and math.dist(ring[0], ring[-1]) < 1e-6
    # Direction from neighbours ~0.8 mm away keeps columns from fanning into
    # spikes at sharp corners; closed outlines wrap around their seam.
    k = max(1, round(0.8/spacing))
    n = len(points)-1 if closed else len(points)
    result = []
    for i, point in enumerate(points):
        if closed:
            a, b = points[(i-k) % n], points[(i+k) % n]
        else:
            a, b = points[max(0, i-k)], points[min(len(points)-1, i+k)]
        distance = math.dist(a, b)
        if distance < 0.001:
            continue
        def side_point(side):
            return [point[0]-(b[1]-a[1])/distance*width/2*side,
                    point[1]+(b[0]-a[0])/distance*width/2*side]
        if style == "e-stitch":
            # Walk one rail; each bite goes across and back to that rail.
            result.extend([side_point(-1), side_point(1), side_point(-1)])
        else:
            result.append(side_point(1 if i % 2 else -1))
    return result


def rail_paths(ring, width, length):
    points = sample_path(ring, length)
    rails = [[], []]
    for i, p in enumerate(points):
        a, b = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        d = math.dist(a, b)
        if d < 0.001:
            continue
        for rail, side in zip(rails, (-1, 1)):
            rail.append([p[0]-(b[1]-a[1])/d*width/2*side, p[1]+(b[0]-a[0])/d*width/2*side])
    return rails


def cross_paths(rings, cell, angle, rule="evenodd"):
    theta = math.radians(angle)
    c, s = math.cos(theta), math.sin(theta)
    rotated = [[[x*c+y*s, -x*s+y*c] for x, y in r] for r in rings]
    points = [p for ring in rotated for p in ring]
    min_x, max_x = min(p[0] for p in points), max(p[0] for p in points)
    min_y, max_y = min(p[1] for p in points), max(p[1] for p in points)
    if (max_x-min_x)*(max_y-min_y)/cell**2 > MAX_STITCHES/8:
        raise ValueError("This cross-stitch grid is too dense. Increase the cross size or reduce the design size.")
    # Keep complete crosses inside the region, including concavities and holes.
    y = min_y+cell/2
    while y+cell/2 <= max_y:
        x = min_x+cell/2
        while x+cell/2 <= max_x:
            corners = [[x-cell/2,y-cell/2],[x+cell/2,y+cell/2], [x+cell/2,y-cell/2],[x-cell/2,y+cell/2]]
            if all(inside(p, rotated, rule) for p in corners) and all(inside(p, rotated, rule) for a,b in ((corners[0],corners[1]),(corners[2],corners[3])) for p in interpolate(a,b,0.1)):
                for a,b in ((corners[0],corners[1]),(corners[2],corners[3])):
                    yield [[p[0]*c-p[1]*s,p[0]*s+p[1]*c] for p in (a,b)]
            x += cell
        y += cell


def compile_project(project):
    started = time.perf_counter()
    width, height, objects = validate(project)
    pattern = EmbPattern()
    # PES short strings are byte-length fields; keep metadata ASCII here.
    name = re.sub(r"[^a-zA-Z0-9 _-]", "", str(project.get("name", "Threadroom")))[:40] or "Threadroom"
    pattern.metadata("name", name)
    pattern.metadata("author", "Threadroom")
    total = 0
    previous_color = None
    previous = None

    def move(command, point):
        nonlocal total, previous
        x, y = point
        if not math.isfinite(x+y) or not (-0.001 <= x <= width+0.001 and -0.001 <= y <= height+0.001):
            raise ValueError("Some generated stitches extend outside the selected hoop. Move the object inward or reduce its satin width.")
        total += 1
        if total > MAX_STITCHES:
            raise ValueError("This prototype supports up to 100,000 stitch commands. Reduce the size or increase spacing.")
        pattern.add_stitch_absolute(command, round((x-width/2)*10), round((y-height/2)*10))
        previous = point

    def sew_to(point):
        if previous is None:
            move(JUMP, point)
        else:
            for p in interpolate(previous, point, 3):
                move(STITCH, p)

    def tie(a, b):
        d = math.dist(a, b)
        if d > 0.05:
            p = [a[0]+(b[0]-a[0])*min(0.4, d)/d, a[1]+(b[1]-a[1])*min(0.4, d)/d]
            sew_to(p)
            sew_to(a)

    for obj in objects:
        color = obj["color"].lower()
        if previous_color != color:
            if previous_color is not None:
                pattern.add_command(TRIM)
                pattern.add_command(COLOR_CHANGE)
            thread = EmbThread()
            thread.set_hex_color(color)
            thread.description = str(obj.get("name", "Thread"))[:40].encode("ascii", "ignore").decode()
            thread.brand = "Threadroom"
            pattern.add_thread(thread)
            previous_color = color
        elif previous is not None:
            pattern.add_command(TRIM)
        rings = obj["rings"]
        spacing = obj.get("spacing", 0.45)
        length = obj.get("length", 2.5)
        kind = obj["kind"]
        rule = obj.get("fillRule", "evenodd")
        paths = []
        if kind in FILL_KINDS:
            if obj.get("underlay"):
                if obj.get("underlayType") == "edge":
                    paths.extend(line_path(ring+[ring[0]], length) for ring in rings)
                else:
                    paths.extend(fill_paths(rings, 2, obj.get("angle", 0)+90, length, rule))
            paths.extend(cross_paths(rings, spacing, obj.get("angle", 0), rule) if kind == "cross" else fill_paths(rings, spacing, obj.get("angle", 0), length, rule))
        else:
            for ring in rings:
                if obj.get("underlay") and kind == "satin":
                    mode = obj.get("underlayType", "auto")
                    if mode == "edge":
                        paths.extend(rail_paths(ring, max(0.1, obj.get("satinWidth", 2)-0.5), length))
                    elif mode == "zigzag":
                        paths.append(satin_path(ring, 2, max(0.1, obj.get("satinWidth", 2)-0.5)))
                    else:
                        paths.append(line_path(ring, length))
                path = (satin_path(ring, spacing, obj.get("satinWidth", 2), kind) if kind in ("satin", "zigzag", "e-stitch")
                        else ring if kind == "manual" else line_path(ring, length))
                if kind == "bean":
                    triple = [path[0]]
                    for a, b in zip(path, path[1:]):
                        triple.extend([b, a, b])
                    path = triple
                elif kind == "backstitch":
                    # Sew back one interval, then move forward two intervals.
                    reverse = [path[1], path[0]] if len(path) > 1 else path
                    for i in range(1, len(path)-1):
                        reverse.extend([path[i+1], path[i]])
                    if len(path) > 1:
                        reverse.append(path[-1])
                    path = reverse
                paths.append(path)
        # Never connect disconnected spans with a sewn line through a hole.
        object_previous = None
        for path in paths:
            if len(path) < 2:
                continue
            connect = kind == "fill" and object_previous is not None and math.dist(object_previous, path[0]) <= 3
            if connect:
                # Connectors may graze a concave edge by a hidden fraction of a millimetre.
                connect = all(inside(p, rings, rule, CONNECT_TOLERANCE) for p in interpolate(object_previous, path[0], 0.1))
            if connect:
                sew_to(path[0])
            else:
                if object_previous is not None:
                    pattern.add_command(TRIM)
                move(JUMP, path[0])
                tie(path[0], path[1])
            for point in path[1:]:
                sew_to(point)
            tie(path[-1], path[-2])
            object_previous = path[-1]
    pattern.add_command(TRIM)
    pattern.add_command(END)
    output = io.BytesIO()
    write_pes(pattern, output, {"version": 6, "max_stitch": 30, "max_jump": 2047, "full_jump": True})
    data = output.getvalue()
    # Preview the file that was actually written, including quantisation and
    # format normalisation. This also detects writer/reader disagreement.
    decoded = read_pes(io.BytesIO(data))
    commands, threads = [], []
    for thread in decoded.threadlist:
        threads.append({"color": thread.hex_color(), "name": thread.description or "Thread"})
    block = 0
    last = [width/2, height/2]
    sewn = []
    max_length = 0
    counts = {"stitches": 0, "jumps": 0, "trims": 0, "colorChanges": 0}
    for x, y, command in decoded.stitches:
        flag = command & COMMAND_MASK
        p = [x/10+width/2, y/10+height/2]
        if flag == END:
            break
        if flag == COLOR_CHANGE:
            block += 1
            counts["colorChanges"] += 1
            continue
        if flag == TRIM:
            counts["trims"] += 1
            continue
        if flag not in (STITCH, JUMP):
            continue
        kind = "stitch" if flag == STITCH else "jump"
        commands.append({"x": p[0], "y": p[1], "fromX": last[0], "fromY": last[1], "type": kind, "block": block})
        counts["stitches" if flag == STITCH else "jumps"] += 1
        if flag == STITCH:
            sewn.extend([last, p])
            max_length = max(max_length, math.dist(last, p))
        last = p
    if not sewn:
        raise ValueError("This design produced no stitches. Enlarge the regions or use a running stitch.")
    xs, ys = [p[0] for p in sewn], [p[1] for p in sewn]
    return {"pes": base64.b64encode(data).decode(), "filename": name.replace(" ", "-").lower()+".pes",
            "commands": commands, "threads": threads, "stats": {**counts,
            "width": round(max(xs)-min(xs), 1), "height": round(max(ys)-min(ys), 1),
            "maxStitch": round(max_length, 2), "bytes": len(data),
            "durationMs": round((time.perf_counter()-started)*1000)},
            "engine": "threadroom-poc+pystitch", "pesVersion": "6"}
