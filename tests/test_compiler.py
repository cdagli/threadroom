import base64
import copy
import io
import json
import math
from pathlib import Path
import subprocess
import unittest

from pystitch import read_pes
import embroidery.compiler as C
from embroidery.compiler import compile_project, inside, satin_path


def project(kind="fill", rings=None, **settings):
    return {"version": 1, "name": "Compiler test", "machine": "brother-pr1x", "hoop": "100x100", "trimJump": 3,
            "objects": [{"name": "Region", "kind": kind, "color": "#c99d72", **LOCKS,
                         "rings": rings or [[[30,30],[60,30],[60,60],[30,60]]],
                         "spacing": .45, "underlay": "none", "pullCompensation": 0, "splitLength": 7, "shortStitches": True, **settings}]}


LOCKS = {"tieIn": "tack", "tieOff": "tack", "lockSize": 1}
EDITOR = {"locks": LOCKS, "trimJump": 3}


def node(script, value):
    """Runs editor code (tests/editor.mjs) so the tests use the one fabric table."""
    out = subprocess.run(["node", "tests/editor.mjs", script], input=json.dumps(value), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def resolved(project):
    """The compile payload the editor sends: fabric defaults resolved per object."""
    return node("payload", project)


class CompilerTests(unittest.TestCase):
    def test_pes_roundtrip_preserves_physical_size_colour_and_limits(self):
        result = compile_project(project())
        data = base64.b64decode(result["pes"])
        self.assertEqual(data[:8], b"#PES0060")
        parsed = read_pes(io.BytesIO(data))
        self.assertEqual(parsed.threadlist[0].hex_color(), "#c99d72")
        self.assertAlmostEqual(result["stats"]["width"], 30, delta=0.1)
        self.assertAlmostEqual(result["stats"]["height"], 30, delta=0.5)
        self.assertLessEqual(result["stats"]["maxStitch"], 3.15)
        self.assertGreater(result["stats"]["stitches"], 500)
        # Adjacent square fill rows must join instead of trimming each row.
        self.assertLess(result["stats"]["trims"], 5)
        self.assertTrue(all(c["x"]>=29.9 and c["y"]>=29.9 for c in result["commands"] if c["type"]=="stitch"))

    def test_hole_is_never_crossed_by_sewn_fill_or_underlay(self):
        rings = [[[25,25],[75,25],[75,75],[25,75]],[[40,40],[60,40],[60,60],[40,60]]]
        for angle in (0, 35, 90):
            result = compile_project(project(rings=rings, angle=angle, underlay="tatami"))
            for c in result["commands"]:
                if c["type"] != "stitch":
                    continue
                for t in (0.2, 0.5, 0.8):
                    x=c["fromX"]+(c["x"]-c["fromX"])*t
                    y=c["fromY"]+(c["y"]-c["fromY"])*t
                    self.assertFalse(40.12<x<59.88 and 40.12<y<59.88, (angle,c))

    def test_separate_paths_jump_and_colours_follow_object_order(self):
        p=project("running", [[[20,20],[30,20]],[[70,70],[80,70]]])
        p["objects"].append({**p["objects"][0],"color":"#d8949b","rings":[[[50,50],[55,50]]]})
        result=compile_project(p)
        self.assertEqual(result["stats"]["colorChanges"],1)
        self.assertEqual([t["color"] for t in result["threads"]],["#c99d72","#d8949b"])
        self.assertGreaterEqual(result["stats"]["jumps"],3)
        self.assertLessEqual(result["stats"]["maxStitch"],3.1)

    def test_bean_and_satin_generate_real_stitches(self):
        line=[[[30,40],[40,45],[60,40]]]
        running=compile_project(project("running",line))
        bean=compile_project(project("bean",line))
        satin=compile_project(project("satin",line,satinWidth=3,underlay="center"))
        self.assertGreater(bean["stats"]["stitches"],running["stats"]["stitches"]*2)
        self.assertGreater(satin["stats"]["stitches"],running["stats"]["stitches"])
        self.assertLessEqual(satin["stats"]["maxStitch"],3.15)

    def test_outline_styles_export_distinct_patterns_and_readable_pes(self):
        line=[[[30,40],[60,40]]]
        results={kind:compile_project(project(kind,line,spacing=1.5 if kind in ("zigzag","e-stitch") else .45,satinWidth=3))
                 for kind in ("running","bean","backstitch","satin","zigzag","e-stitch","underlay","manual")}
        self.assertGreater(results["backstitch"]["stats"]["stitches"],results["running"]["stats"]["stitches"])
        self.assertGreater(results["satin"]["stats"]["stitches"],results["zigzag"]["stats"]["stitches"]*2)
        self.assertGreater(results["e-stitch"]["stats"]["stitches"],results["zigzag"]["stats"]["stitches"])
        for kind,result in results.items():
            self.assertGreater(result["stats"]["stitches"],0)
            # Wide bites are single stitches up to the split length (default 7 mm).
            self.assertLessEqual(result["stats"]["maxStitch"],3.4 if kind in ("satin","zigzag","e-stitch") else 3.15)
            parsed=read_pes(io.BytesIO(base64.b64decode(result["pes"])))
            self.assertEqual(parsed.threadlist[0].hex_color(),"#c99d72")
        # E-stitch bites cross from the edge and return to the same edge.
        path=satin_path(line[0],1.5,3,"e-stitch")
        self.assertEqual(path[0],path[2])
        self.assertAlmostEqual(math.dist(path[0],path[1]),3)

    def test_crosses_do_not_sew_across_holes_or_between_diagonals(self):
        rings=[[[25,25],[55,25],[55,55],[25,55]],[[35,35],[45,35],[45,45],[35,45]]]
        for angle in (0,35):
            result=compile_project(project("cross",rings,spacing=2,angle=angle))
            self.assertGreater(result["stats"]["stitches"],100)
            self.assertLessEqual(result["stats"]["maxStitch"],3.15)
            for command in result["commands"]:
                if command["type"]=="stitch":
                    for t in (.2,.5,.8):
                        x=command["fromX"]+(command["x"]-command["fromX"])*t
                        y=command["fromY"]+(command["y"]-command["fromY"])*t
                        self.assertFalse(35.12<x<44.88 and 35.12<y<44.88,command)
        with self.assertRaisesRegex(ValueError,"too dense"):
            compile_project(project("cross",[[[1,1],[99,1],[99,99],[1,99]]],spacing=.3))

    def test_underlay_modes_are_real_foundation_paths_and_validate_settings(self):
        line=[[[30,40],[60,40]]]
        base=compile_project(project("satin",line,satinWidth=3))
        variants=[]
        for mode in ("center","edge","zigzag","edge-zigzag"):
            result=compile_project(project("satin",line,satinWidth=3,underlay=mode))
            self.assertGreater(result["stats"]["stitches"],base["stats"]["stitches"])
            variants.append(result["commands"])
        self.assertNotEqual(variants[0],variants[1])
        self.assertNotEqual(variants[1],variants[2])
        self.assertGreater(len(variants[3]),max(len(variants[1]),len(variants[2])))
        counts={mode:compile_project(project(underlay=mode))["stats"]["stitches"] for mode in ("none","edge","tatami","edge-tatami")}
        self.assertLess(counts["none"],min(counts["edge"],counts["tatami"]))
        self.assertGreater(counts["edge-tatami"],max(counts["edge"],counts["tatami"]))
        for kind,mode in (("fill","zigzag"),("satin","tatami"),("running","edge"),("zigzag","center"),("satin","unknown"),("satin",True),("fill",None)):
            with self.assertRaises(ValueError):compile_project(project(kind,underlay=mode))

    def test_satin_density_does_not_depend_on_image_curve_resolution(self):
        coarse=[[30,40],[60,40]]
        fine=[[30+i/10,40] for i in range(301)]
        self.assertEqual(satin_path(coarse,.5,2),satin_path(fine,.5,2))

    def test_outside_hoop_and_satin_expansion_are_rejected(self):
        p=project();p["objects"][0]["rings"][0][0]=[-1,20]
        with self.assertRaises(ValueError):compile_project(p)
        with self.assertRaises(ValueError):compile_project(project("satin",[[[0,10],[0,80]]],satinWidth=6))

    def test_bad_projects_are_rejected_before_generation(self):
        for value in (None, [], {}, {"version":1,"machine":"other"}):
            with self.assertRaises(ValueError):compile_project(value)
        for patch in ({"spacing":0},{"spacing":None},{"pullCompensation":None},{"spacing":math.nan},{"length":math.inf},{"color":"red"},{"kind":"unknown"},{"rings":[[[30,30],[30,30]]]}):
            p=project();p["objects"][0].update(patch)
            with self.assertRaises(ValueError):compile_project(p)
        p=project();p["objects"]*=81
        with self.assertRaises(ValueError):compile_project(p)

    def test_generation_budget_and_empty_fill(self):
        p=project(rings=[[[10,10],[10.01,10],[10.01,10.01]]])
        with self.assertRaises(ValueError):compile_project(p)
        p=project("bean", [[[1,1],[99,99]]]*100, length=0.5)
        p["objects"] = p["objects"] * 2
        with self.assertRaises(ValueError):compile_project(p)

    def test_fixture_is_readable_by_browser_parser(self):
        result=compile_project(project())
        Path("tests/generated.pes").write_bytes(base64.b64decode(result["pes"]))
        Path("tests/generated.json").write_text(json.dumps(result))

    def test_stitch_library_fixture_for_independent_parser(self):
        p=project("running",[[[12,12],[42,12]]])
        p.update(name="Stitch sampler",fabric="woven",**EDITOR)
        # Saved projects: fabric-driven values are inherited except where set.
        p["objects"]=[]
        for i,kind in enumerate(("running","bean","backstitch","satin","zigzag","e-stitch","underlay","manual")):
            p["objects"].append({"id":kind,"name":kind,"kind":kind,"color":"#c99d72","rings":[[[12,12+i*8],[27,14+i*8],[42,12+i*8]]],"length":2.5,"angle":0,"satinWidth":2})
        for kind,y in (("fill",20),("cross",52)):
            p["objects"].append({"id":kind,"name":kind,"kind":kind,"color":"#849984","rings":[[[58,y],[84,y],[84,y+20],[58,y+20]]],"length":2.5,"angle":0,"satinWidth":2,"underlay":"edge"})
        p["objects"][3]["pullCompensation"]=.3
        result=compile_project(resolved(p))
        Path("tests/stitch-library.pes").write_bytes(base64.b64decode(result["pes"]))
        Path("tests/stitch-library.json").write_text(json.dumps(result))
        Path("tests/stitch-library.project.json").write_text(json.dumps(p))


if __name__ == "__main__":unittest.main()


class FillRuleTests(unittest.TestCase):
    a = [[20,20],[60,20],[60,60],[20,60]]
    b = [[40,40],[80,40],[80,80],[40,80]]

    def sewn_in_overlap(self, result):
        return sum(1 for c in result["commands"] if c["type"] == "stitch" and 42 < c["x"] < 58 and 42 < c["y"] < 58)

    def test_nonzero_merges_overlapping_glyph_contours(self):
        evenodd = compile_project(project(rings=[self.a, self.b], angle=0))
        nonzero = compile_project(project(rings=[self.a, self.b], angle=0, fillRule="nonzero"))
        self.assertEqual(self.sewn_in_overlap(evenodd), 0)
        self.assertGreater(self.sewn_in_overlap(nonzero), 50)

    def test_nonzero_keeps_counter_wound_holes(self):
        hole = list(reversed([[40,40],[60,40],[60,60],[40,60]]))
        result = compile_project(project(rings=[[[25,25],[75,25],[75,75],[25,75]], hole], angle=0, fillRule="nonzero", underlay="edge"))
        self.assertEqual(self.sewn_in_overlap(result), 0)
        self.assertTrue(inside([30, 30], [self.a], "nonzero"))
        self.assertFalse(inside([50, 50], [[[25,25],[75,25],[75,75],[25,75]], hole], "nonzero"))

    def test_rejects_unknown_fill_rule(self):
        with self.assertRaises(ValueError):
            compile_project(project(fillRule="winding"))

    def test_separate_letters_are_filled_one_after_another(self):
        rings = [[[20,30],[35,30],[35,60],[20,60]], [[50,30],[65,30],[65,60],[50,60]]]
        for underlay in ("none", "edge-tatami"):
            result = compile_project(project(rings=rings, angle=0, fillRule="nonzero", underlay=underlay))
            sides = [c["x"] < 42 for c in result["commands"] if c["type"] == "stitch"]
            self.assertEqual(sum(1 for a, b in zip(sides, sides[1:]) if a != b), 1, underlay)



class PullCompensationTests(unittest.TestCase):
    def extent(self, result):
        """Sewn extent read back from the written PES, in mm."""
        parsed = read_pes(io.BytesIO(base64.b64decode(result["pes"])))
        points = [(x/10, y/10) for x, y, c in parsed.stitches if c & 0xFF == 0]
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        return max(xs)-min(xs), max(ys)-min(ys)

    def test_satin_styles_widen_by_the_compensation(self):
        line = [[[30,40],[60,40]]]
        for kind, spacing in (("satin", .45), ("zigzag", 1.5), ("e-stitch", 1.5)):
            base = self.extent(compile_project(project(kind, line, satinWidth=3, spacing=spacing)))
            wide = self.extent(compile_project(project(kind, line, satinWidth=3, spacing=spacing, pullCompensation=.4)))
            self.assertAlmostEqual(base[1], 3, delta=.11)
            self.assertAlmostEqual(wide[1]-base[1], .4, delta=.11, msg=kind)
            self.assertAlmostEqual(wide[0], base[0], delta=.11, msg=kind)

    def test_satin_underlay_stays_inset(self):
        line = [[[30,40],[60,40]]]
        base = compile_project(project("satin", line, satinWidth=3, underlay="edge"))
        wide = compile_project(project("satin", line, satinWidth=3, underlay="edge", pullCompensation=.4))
        rail = lambda r: sorted({round(c["y"], 2) for c in r["commands"][:20] if c["type"] == "stitch"})
        self.assertEqual(rail(base), rail(wide))

    def test_fills_lengthen_rows_by_the_compensation(self):
        for angle in (0, 90):
            base = self.extent(compile_project(project(angle=angle)))
            wide = self.extent(compile_project(project(angle=angle, pullCompensation=.5)))
            along = 0 if angle == 0 else 1
            self.assertAlmostEqual(wide[along]-base[along], .5, delta=.11, msg=angle)
            self.assertAlmostEqual(wide[1-along], base[1-along], delta=.11, msg=angle)
        cross = [self.extent(compile_project(project("cross", spacing=2, angle=0, pullCompensation=v)))[0] for v in (0, .6)]
        self.assertAlmostEqual(cross[1]-cross[0], .6/math.sqrt(2), delta=.11)

    def test_fill_holes_shrink_only_by_half_the_compensation(self):
        rings = [[[25,25],[75,25],[75,75],[25,75]],[[40,40],[60,40],[60,60],[40,60]]]
        for rule, hole in (("evenodd", rings[1]), ("nonzero", list(reversed(rings[1])))):
            result = compile_project(project(rings=[rings[0], hole], angle=0, pullCompensation=.6, fillRule=rule))
            for c in result["commands"]:
                if c["type"] == "stitch":
                    for t in (.2, .5, .8):
                        x = c["fromX"]+(c["x"]-c["fromX"])*t
                        y = c["fromY"]+(c["y"]-c["fromY"])*t
                        self.assertFalse(40.42 < x < 59.58 and 40.12 < y < 59.88, (rule, c))
            self.assertLess(result["stats"]["trims"], 10)

    def test_running_styles_are_unaffected(self):
        line = [[[30,40],[40,45],[60,40]]]
        for kind in ("running", "bean", "backstitch", "underlay", "manual"):
            base = compile_project(project(kind, line))
            self.assertEqual(base["commands"], compile_project(project(kind, line, pullCompensation=1))["commands"], kind)

    def test_fill_touching_the_hoop_edge_stays_inside(self):
        result = compile_project(project(rings=[[[0,0],[40,0],[40,40],[0,40]]], angle=0, pullCompensation=1))
        self.assertTrue(all(0 <= c["x"] <= 100 for c in result["commands"]))

    def test_rejects_out_of_range_compensation(self):
        for value in (-.1, 1.5, math.nan, "0.2", True, None):
            with self.assertRaises(ValueError):
                compile_project(project(pullCompensation=value))


class FabricProfileTests(unittest.TestCase):
    square = [[30,30],[60,30],[60,60],[30,60]]
    line = [[30,40],[60,40]]

    @classmethod
    def setUpClass(cls):
        cls.fabrics = node("profiles", None)

    def editor(self, fabric, *objects):
        return {"version": 1, "name": "Fabric", "machine": "brother-pr1x", "hoop": "100x100", "fabric": fabric, **EDITOR,
                "objects": [{"id": str(i), "name": "Region", "color": "#c99d72", "length": 2.5, "angle": 0, "satinWidth": 3, **o}
                            for i, o in enumerate(objects)]}

    def compile(self, fabric, *objects):
        return compile_project(resolved(self.editor(fabric, *objects)))

    def test_every_profile_compiles_with_its_values(self):
        self.assertGreaterEqual(len(self.fabrics), 6)
        for fabric, f in self.fabrics.items():
            p = self.editor(fabric, {"kind": "fill", "rings": [self.square]}, {"kind": "satin", "rings": [[[30,70],[60,70]]]},
                            {"kind": "zigzag", "rings": [[[30,80],[60,80]]]}, {"kind": "running", "rings": [[[30,90],[60,90]]]})
            fill, satin, zigzag, running = resolved(p)["objects"]
            self.assertEqual((fill["spacing"], fill["underlay"], fill["pullCompensation"]), (f["fill"], f["fillUnderlay"], f["pull"]), fabric)
            self.assertEqual((satin["spacing"], satin["underlay"], satin["pullCompensation"]), (f["satin"], f["satinUnderlay"], f["pull"]), fabric)
            self.assertEqual((zigzag["spacing"], zigzag["underlay"], running["underlay"], running["pullCompensation"]), (1.5, "none", "none", 0), fabric)
            self.assertTrue(f["stabilizer"] and f["topping"])
            result = compile_project(resolved(p))
            self.assertGreater(result["stats"]["stitches"], 500, fabric)
            self.assertLessEqual(result["stats"]["maxStitch"], 7.15, fabric)
            self.assertEqual(base64.b64decode(result["pes"])[:8], b"#PES0060")

    def test_profile_sets_fill_density(self):
        fill = {"kind": "fill", "rings": [self.square], "underlay": "none", "pullCompensation": 0}
        counts = {f: self.compile(f, fill)["stats"]["stitches"] for f in ("woven", "jersey", "terry")}
        ratio = self.fabrics["jersey"]["fill"]/self.fabrics["woven"]["fill"]
        self.assertAlmostEqual(counts["woven"]/counts["jersey"], ratio, delta=.05)
        self.assertGreater(counts["terry"], counts["woven"])

    def test_profile_sets_underlay(self):
        fill = {"kind": "fill", "rings": [self.square], "spacing": .45, "pullCompensation": 0}
        for fabric in ("woven", "jersey"):
            mode = self.fabrics[fabric]["fillUnderlay"]
            self.assertEqual(self.compile(fabric, fill)["commands"], self.compile(fabric, {**fill, "underlay": mode})["commands"])
        self.assertGreater(self.compile("jersey", fill)["stats"]["stitches"], self.compile("woven", fill)["stats"]["stitches"])
        satin = {"kind": "satin", "rings": [self.line], "spacing": .4, "pullCompensation": 0}
        self.assertGreater(self.compile("fleece", satin)["stats"]["stitches"], self.compile("woven", satin)["stats"]["stitches"])

    def test_profile_sets_pull_compensation(self):
        satin = {"kind": "satin", "rings": [self.line], "spacing": .4, "underlay": "none"}
        height = {f: PullCompensationTests.extent(None, self.compile(f, satin))[1] for f in ("denim", "rib")}
        self.assertAlmostEqual(height["rib"]-height["denim"], self.fabrics["rib"]["pull"]-self.fabrics["denim"]["pull"], delta=.11)

    def test_explicit_object_values_win(self):
        objects = ({"kind": "fill", "rings": [self.square], "spacing": .6, "underlay": "edge", "pullCompensation": .1},
                   {"kind": "satin", "rings": [[[30,70],[60,70]]], "spacing": .5, "underlay": "none", "pullCompensation": 0})
        results = [self.compile(f, *objects)["commands"] for f in self.fabrics]
        self.assertTrue(all(r == results[0] for r in results))


class ShortStitchAndSplitTests(unittest.TestCase):
    centre = (50, 50)
    arc = [[50+6*math.cos(t/100*math.pi), 50+6*math.sin(t/100*math.pi)] for t in range(101)]

    def sewn(self, result):
        """Sewn segments read back from the written PES, in mm."""
        parsed = read_pes(io.BytesIO(base64.b64decode(result["pes"])))
        points = [(x/10, y/10, c & 0xFF) for x, y, c in parsed.stitches]
        # A stitch at a jump target is the needle going down, not a sewn stitch.
        return [(a[:2], b[:2]) for a, b in zip(points, points[1:]) if a[2] == b[2] == 0]

    def test_tight_arc_shortens_alternate_inner_bites_and_keeps_the_outer_edge(self):
        width = 4
        plain, short = (satin_path(self.arc, .4, width, "satin", 0, s) for s in (False, True))
        straight = satin_path([[30,40],[60,40]], .4, width, "satin", 0, True)
        radius = lambda p: math.dist(p, self.centre)
        self.assertEqual([p for p in short if radius(p) > 6], [p for p in plain if radius(p) > 6])
        inner = [radius(p) for p in short if radius(p) < 6]
        self.assertTrue(any(r > 4.5 for r in inner) and any(abs(r-4) < .01 for r in inner))
        # Alternate inner hits stay on the edge, so it looks continuous.
        self.assertGreaterEqual(sum(abs(r-4) < .01 for r in inner), len(inner)//2)
        bite = lambda path: [math.dist(a, b) for a, b in zip(path, path[1:])]
        self.assertLess(min(bite(short)), width-.5)
        self.assertGreaterEqual(min(bite(short)), width*.75-.01)
        self.assertTrue(all(abs(b-math.hypot(width, .4)) < .01 for b in bite(straight)))
        self.assertTrue(all(abs(b-width) < .05 for b in bite(plain)))
        on, off = (compile_project(project("satin", [self.arc], satinWidth=width, spacing=.4, shortStitches=s)) for s in (True, False))
        self.assertLess(sum(math.dist(a, b) for a, b in self.sewn(on)), sum(math.dist(a, b) for a, b in self.sewn(off)))

    def test_wide_satin_is_split_with_staggered_penetrations(self):
        line = [[[30,40],[60,40]]]
        whole = compile_project(project("satin", line, satinWidth=10, spacing=.4, splitLength=12))
        self.assertAlmostEqual(whole["stats"]["maxStitch"], 10, delta=.15)
        for kind, spacing in (("satin", .4), ("zigzag", 1.5), ("e-stitch", 1.5)):
            for split in (3, 5, 7):
                result = compile_project(project(kind, line, satinWidth=10, spacing=spacing, splitLength=split, pullCompensation=.5))
                self.assertLessEqual(result["stats"]["maxStitch"], split+.15, (kind, split))
                self.assertGreaterEqual(min(math.dist(a, b) for a, b in self.sewn(result)), .29, (kind, split))
        path = satin_path(line[0], .4, 10, "satin", 7)
        inner = [round(p[1], 1) for p in path if 35.1 < p[1] < 44.9]
        self.assertGreater(len(set(inner)), 10)
        # Neighbouring bites never put their split points on the same line.
        splits = [[p[1] for p in path[i:i+3] if 35.1 < p[1] < 44.9] for i in range(1, 60, 3)]
        for a, b in zip(splits, splits[1:]):
            self.assertGreater(min(abs(x-y) for x in a for y in b), .2)

    def test_split_keeps_pull_compensation(self):
        line = [[[30,40],[60,40]]]
        extent = lambda r: PullCompensationTests.extent(None, r)[1]
        base = compile_project(project("satin", line, satinWidth=9, spacing=.4))
        wide = compile_project(project("satin", line, satinWidth=9, spacing=.4, pullCompensation=.6))
        self.assertAlmostEqual(extent(base), 9, delta=.11)
        self.assertAlmostEqual(extent(wide)-extent(base), .6, delta=.11)
        self.assertLessEqual(wide["stats"]["maxStitch"], 7.15)

    def test_max_stitch_length_is_respected_everywhere(self):
        square = [[30,30],[60,30],[60,60],[30,60]]
        for kind in ("fill", "cross", "running", "bean", "backstitch", "underlay", "manual"):
            rings = [square] if kind in ("fill", "cross") else [self.arc]
            result = compile_project(project(kind, rings, spacing=2 if kind == "cross" else .45, satinWidth=10, splitLength=3))
            self.assertLessEqual(result["stats"]["maxStitch"], 3.15, kind)
        for kind in ("satin", "zigzag", "e-stitch"):
            for underlay in (("none", "center", "edge", "zigzag", "edge-zigzag") if kind == "satin" else ("none",)):
                result = compile_project(project(kind, [self.arc], satinWidth=10, spacing=.4 if kind == "satin" else 1.5, underlay=underlay, pullCompensation=1))
                self.assertLessEqual(result["stats"]["maxStitch"], 7.15, (kind, underlay))

    def test_text_border_satin_is_split(self):
        from embroidery.compiler import split_bites
        self.assertEqual(split_bites([[0,0],[0,5]], 7), [[0,0],[0,5]])
        payload = resolved({"version": 1, "name": "Text", "machine": "brother-pr1x", "hoop": "100x100", "fabric": "woven", **EDITOR, "objects": [
            {"id": "t", "name": "Text", "kind": "fill", "color": "#c99d72", "length": 2.5, "angle": 0, "satinWidth": 2,
             "rings": [[[30,30],[60,30],[60,60],[30,60]]], "text": {"border": {"kind": "satin", "color": "#664538", "width": 4}}}]})
        border = payload["objects"][1]
        self.assertEqual((border["kind"], border["splitLength"], border["shortStitches"]), ("satin", 7, True))
        border.update(splitLength=3)
        result = compile_project({**payload, "objects": [border]})
        self.assertLessEqual(result["stats"]["maxStitch"], 3.15)

    def test_rejects_out_of_range_split_and_short_settings(self):
        for patch in ({"splitLength": 2.9}, {"splitLength": 12.1}, {"splitLength": None}, {"splitLength": True},
                      {"shortStitches": 1}, {"shortStitches": None}, {"satinWidth": 10.5}):
            with self.assertRaises(ValueError, msg=patch):
                compile_project(project("satin", [[[30,40],[60,40]]], **patch))
        compile_project(project("running", [[[30,40],[60,40]]], splitLength=None, shortStitches=None))


def objects_project(*objects):
    colours = ("#c99d72", "#849984", "#d8949b", "#664538", "#a6bdca", "#f4e5cc")
    return {"version": 1, "name": "Ends", "machine": "brother-pr1x", "hoop": "100x100", "trimJump": 3,
            "objects": [{"name": "Region", "kind": "fill", "color": colours[i], **LOCKS, "spacing": .45, "underlay": "none",
                         "pullCompensation": 0, "splitLength": 7, "shortStitches": True, "angle": 0, **o} for i, o in enumerate(objects)]}


def ends(result):
    """(first, last) needle position of each thread block, read from the written PES."""
    blocks = {}
    for c in result["commands"]:
        blocks.setdefault(c["block"], []).append(c)
    return [((b[0]["x"], b[0]["y"]), next((c["x"], c["y"]) for c in reversed(b) if c["type"] == "stitch")) for _, b in sorted(blocks.items())]


def sewn_samples(result, block=None):
    for c in result["commands"]:
        if c["type"] == "stitch" and block in (None, c["block"]):
            for t in (.1, .3, .5, .7, .9):
                yield [c["fromX"]+(c["x"]-c["fromX"])*t, c["fromY"]+(c["y"]-c["fromY"])*t]


class EntryExitTests(unittest.TestCase):
    square = [[30,30],[60,30],[60,60],[30,60]]

    def test_automatic_entry_is_nearest_the_previous_exit(self):
        loop = [[20,65],[40,65],[40,85],[20,85],[20,65]]
        lines = ({"kind": "running", "rings": [[[10,10],[30,10]]]}, {"kind": "running", "rings": [[[80,12],[35,12]]]})
        result = compile_project(objects_project(*lines, {"rings": [[[50,30],[70,30],[70,50],[50,50]]]}))
        (_, a_end), (b_start, b_end), (c_start, c_end) = ends(result)
        self.assertEqual((a_end, b_start, b_end), ((30, 10), (35, 12), (80, 12)))
        # The fill starts at the row end nearest the previous exit; its underlay
        # (inset, 2 mm rows) starts within an underlay row of it.
        self.assertLess(math.dist(c_start, (70, 30)), .3)
        for mode in ("edge", "tatami"):
            under = ends(compile_project(objects_project({"kind": "running", "rings": [[[80,12],[90,12]]]}, {"rings": [[[50,30],[70,30],[70,50],[50,50]]], "underlay": mode})))
            self.assertLess(math.dist(under[1][0], (70, 30)), 1.5, mode)
        result = compile_project(objects_project({"kind": "running", "rings": [[[60,60],[30,60]]]}, {"kind": "bean", "rings": [loop]}))
        (_, c_end), (d_start, d_end) = ends(result)
        # The closed outline starts at its nearest point, not at its first vertex.
        self.assertLess(math.dist(d_start, C.nearest_on([loop], list(c_end), False)[2]), .11)
        self.assertLess(math.dist(d_end, d_start), .11)
        self.assertNotEqual(d_start, (20, 65))

    def test_fill_ends_near_the_next_object(self):
        # Rows end on the outline where they cross it, so the end is the row end nearest the next start.
        for angle in (0, 35, 90):
            for line, corner in (([[62,62],[80,80]], (60, 60)), ([[80,10],[62,28]], (60, 30))):
                result = compile_project(objects_project({"rings": [self.square], "angle": angle, "underlay": "edge-tatami"},
                                                         {"kind": "running", "rings": [line]}))
                (_, end), (start, _) = ends(result)
                self.assertLess(math.dist(end, corner), 1.0, (angle, line))
                self.assertEqual(start, min(map(tuple, line), key=lambda p: math.dist(p, corner)))

    def test_explicit_fill_entry_and_exit_are_respected_with_hidden_travel(self):
        rings = [[[25,25],[75,25],[75,75],[25,75]], [[40,40],[60,40],[60,60],[40,60]]]
        region = C.Region(rings, "evenodd")
        for underlay in ("none", "edge-tatami"):
            # Exits lie where rows meet the outline (an exit on an edge parallel to the
            # rows ends at the nearest row end instead).
            for angle, entry, exit in ((0, [25,50], [75,52]), (35, [50,75], [40,47]), (90, [60,25], [50,60]), (35, [60,25], [60,50])):
                result = compile_project(objects_project({"rings": rings, "angle": angle, "underlay": underlay, "entry": entry, "exit": exit}))
                (start, end), = ends(result)
                self.assertLess(math.dist(start, entry), .11, (underlay, angle))
                self.assertLess(math.dist(end, exit), .8, (underlay, angle))
                self.assertTrue(all(region.contains(p, .15) for p in sewn_samples(result)), (underlay, angle))
                # Every top row is still sewn: entry/exit routing only reorders.
                plain = compile_project(objects_project({"rings": rings, "angle": angle, "underlay": underlay}))
                self.assertAlmostEqual(result["stats"]["stitches"], plain["stats"]["stitches"], delta=plain["stats"]["stitches"]*.08)

    def test_explicit_closed_outline_entry_and_exit(self):
        loop = self.square+[self.square[0]]
        for kind in ("running", "bean"):
            result = compile_project(objects_project({"kind": kind, "rings": [loop], "entry": [45,30], "exit": [60,50]}))
            (start, end), = ends(result)
            self.assertLess(math.dist(start, (45, 30)), .11, kind)
            self.assertLess(math.dist(end, (60, 50)), .11, kind)
        satin = compile_project(objects_project({"kind": "satin", "rings": [loop], "satinWidth": 2, "spacing": .4, "underlay": "center", "entry": [30,40]}))
        (start, end), = ends(satin)
        self.assertLess(math.dist(start, (30, 40)), 1.1)
        self.assertLess(math.dist(end, (30, 40)), 1.1)

    def test_explicit_open_path_ends_only_reverse_direction(self):
        line = [[30,40],[45,44],[60,40]]
        for kind, extra in (("running", {}), ("bean", {}), ("backstitch", {}), ("satin", {"satinWidth": 2, "spacing": .4, "underlay": "edge"})):
            forward, = ends(compile_project(objects_project({"kind": kind, "rings": [line], **extra})))
            entry, = ends(compile_project(objects_project({"kind": kind, "rings": [line], "entry": [60,40], **extra})))
            exit, = ends(compile_project(objects_project({"kind": kind, "rings": [line], "exit": [30,40], **extra})))
            # Backstitch begins one stitch in and sews back to the end.
            start = 2.6 if kind == "backstitch" else 1.1
            self.assertLess(math.dist(forward[0], (30, 40)), start, kind)
            self.assertLess(math.dist(entry[0], (60, 40)), start, kind)
            self.assertLess(math.dist(entry[1], (30, 40)), 1.1, kind)
            self.assertLess(math.dist(exit[1], (30, 40)), 1.1, kind)
        # Satin underlay passes alternate, so an even number of passes returns to the start.
        for mode in ("center", "zigzag", "edge-zigzag"):
            satin, = ends(compile_project(objects_project({"kind": "satin", "rings": [line], "satinWidth": 2, "spacing": .4, "underlay": mode, "entry": [60,40]})))
            self.assertLess(math.dist(satin[0], (60, 40)), 1.1, mode)
            self.assertLess(math.dist(satin[1], (60, 40)), 1.1, mode)

    def test_satin_underlay_passes_connect_without_trims(self):
        line = [[[30,40],[60,40]]]
        for mode in ("none", "center", "edge", "zigzag", "edge-zigzag"):
            result = compile_project(project("satin", line, satinWidth=3, underlay=mode))
            self.assertEqual(result["stats"]["trims"], 0, mode)

    def test_multi_ring_entry_and_exit_pick_rings(self):
        rings = [[[20,20],[30,20]], [[50,20],[60,20]], [[80,20],[90,20]]]
        (start, end), = ends(compile_project(objects_project({"kind": "running", "rings": rings, "entry": [50,20], "exit": [90,20]})))
        self.assertEqual((start, end), ((50, 20), (90, 20)))

    def test_entry_and_exit_validation(self):
        for value in ([1], [1, 2, 3], [math.nan, 1], [-1, 5], [5, 101], "1,2", {"x": 1}):
            with self.assertRaises(ValueError, msg=value):
                compile_project(objects_project({"rings": [self.square], "entry": value}))
        compile_project(objects_project({"rings": [self.square], "entry": None, "exit": None}))


class UnderlayInsetTests(unittest.TestCase):
    rings = [[[25,25],[75,25],[75,75],[25,75]], [[40,40],[60,40],[60,60],[40,60]]]

    def clearance(self, plan, rings):
        samples = [q for path in plan for a, b in zip(path, path[1:]) for q in C.interpolate(a, b, .1)]
        return min(C.segment_distance(p, a, b) for p in samples for r in rings for a, b in zip(r, r[1:]+r[:1]))

    def test_edge_walk_and_tatami_underlay_stay_inside_with_holes_and_nonzero(self):
        for rule, rings in (("evenodd", self.rings), ("nonzero", [self.rings[0], self.rings[1][::-1]])):
            region = C.Region(rings, rule)
            for mode, minimum in (("edge", C.EDGE_INSET-.01), ("tatami", .3), ("edge-tatami", .3)):
                o = {"kind": "fill", "rings": rings, "fillRule": rule, "spacing": .45, "pullCompensation": 0, "angle": 35, "underlay": mode}
                plan = C.route_fill(o, None, None, None, True)
                self.assertTrue(plan, (rule, mode))
                self.assertGreaterEqual(self.clearance(plan, rings), minimum, (rule, mode))
                self.assertTrue(all(region.contains(p, 0) for path in plan for p in path), (rule, mode))
        # The edge walk follows the hole too: its inset ring surrounds the hole.
        loops = C.inset_rings(self.rings, C.Region(self.rings, "evenodd"), C.EDGE_INSET)
        self.assertEqual(len(loops), 2)
        xs = [p[0] for p in loops[1]]
        self.assertAlmostEqual(min(xs), 40-C.EDGE_INSET, places=6)
        self.assertAlmostEqual(max(xs), 60+C.EDGE_INSET, places=6)

    def test_nonzero_text_underlay_merges_overlapping_letters(self):
        a, b = [[20,20],[60,20],[60,60],[20,60]], [[40,40],[80,40],[80,80],[40,80]]
        o = {"kind": "fill", "rings": [a, b], "fillRule": "nonzero", "spacing": .45, "pullCompensation": 0, "angle": 0, "underlay": "edge"}
        plan = C.route_fill(o, None, None, None, True)
        # The overlap is filled, so no edge walk runs through it.
        self.assertFalse(any(41 < p[0] < 59 and 41 < p[1] < 59 for path in plan for p in path))
        self.assertTrue(plan)

    def test_bear_underlay_and_travel_stay_inside(self):
        bear = node("demo", None)
        body = bear["objects"][0]
        plan = C.route_fill(body, None, None, None, True)
        self.assertEqual(len(plan), 1)  # one connected underlay run, no trims
        self.assertGreaterEqual(self.clearance(plan, body["rings"]), .2)
        result = compile_project({**bear, "objects": [body]})
        region = C.Region(body["rings"], "evenodd")
        self.assertTrue(all(region.contains(p, body["pullCompensation"]/2+.15) for p in sewn_samples(result)))


class TinyUnderlayTests(unittest.TestCase):
    def test_narrow_fills_skip_underlay(self):
        narrow = [[[30,30],[60,30],[60,31.6],[30,31.6]]]
        wide = [[[30,30],[60,30],[60,33],[30,33]]]
        for mode in ("edge", "tatami", "edge-tatami"):
            self.assertEqual(compile_project(project(rings=narrow, underlay=mode))["commands"], compile_project(project(rings=narrow))["commands"], mode)
            self.assertGreater(compile_project(project(rings=wide, underlay=mode))["stats"]["stitches"], compile_project(project(rings=wide))["stats"]["stitches"], mode)
        # Only the narrow part of a fill loses its underlay.
        both = compile_project(project(rings=narrow+[[[30,50],[60,50],[60,60],[30,60]]], underlay="edge"))
        self.assertTrue(any(c["type"] == "stitch" and 50.3 < c["y"] < 50.5 for c in both["commands"]))

    def test_narrow_satin_underlay_becomes_a_centre_walk(self):
        line = [[[30,40],[60,40]]]
        for mode in ("edge", "zigzag", "edge-zigzag"):
            self.assertEqual(compile_project(project("satin", line, satinWidth=1.2, underlay=mode))["commands"],
                             compile_project(project("satin", line, satinWidth=1.2, underlay="center"))["commands"], mode)
            self.assertNotEqual(compile_project(project("satin", line, satinWidth=2, underlay=mode))["commands"],
                                compile_project(project("satin", line, satinWidth=2, underlay="center"))["commands"], mode)
        self.assertNotEqual(compile_project(project("satin", line, satinWidth=1.2, underlay="none"))["commands"],
                            compile_project(project("satin", line, satinWidth=1.2, underlay="center"))["commands"])


class BearRoutingTests(unittest.TestCase):
    def test_bear_sample_trims_and_travel(self):
        result = compile_project(node("demo", None))
        self.assertLessEqual(result["stats"]["trims"], 25)  # default 3 mm threshold
        self.assertEqual(pec_trims(result), result["stats"]["trims"])
        self.assertLess(result["stats"]["jumpLength"], 500)
        self.assertGreater(result["stats"]["stitches"], 3000)


def pec_trims(result):
    """Independent PEC decode: long-form moves carrying the trim flag (0x20)."""
    data = base64.b64decode(result["pes"])
    i, trims = int.from_bytes(data[8:12], "little")+532, 0
    while data[i] != 0xFF:
        if data[i] == 0xFE and data[i+1] == 0xB0:
            i += 3
            continue
        flags = 0
        for _ in range(2):
            flags |= data[i] & 0x30 if data[i] & 0x80 else 0
            i += 2 if data[i] & 0x80 else 1
        trims += bool(flags & 0x20)
    return trims


def runs(result):
    """Needle positions of each run that starts after a jump (the landing first)."""
    out = []
    for c in result["commands"]:
        if c["type"] == "jump":
            out.append([])
        elif out and (not out[-1] or math.dist(out[-1][-1], (c["x"], c["y"])) > 1e-9):
            out[-1].append((c["x"], c["y"]))
    return out


def near(a, b, tolerance=.08):
    return math.dist(a, b) <= tolerance


class LockAndTrimTests(unittest.TestCase):
    def lines(self, gap, trim_jump=3, colours=("#c99d72", "#c99d72"), **locks):
        p = project("running", [[[20,40],[50,40]]], **locks)
        p["trimJump"] = trim_jump
        second = {**p["objects"][0], "rings": [[[50+gap,40],[80,40]]], "color": colours[1]}
        p["objects"].append(second)
        return compile_project(p)

    def test_lock_types_and_sizes_around_trims(self):
        for size in (.5, 1, 1.5):
            tack = runs(self.lines(10, tieIn="tack", tieOff="tack", lockSize=size))
            self.assertEqual(len(tack), 2)
            for run, start, ahead, end, back in ((tack[0], (20,40), (20+size,40), (50,40), (50-size,40)), (tack[1], (60,40), (60+size,40), (80,40), (80-size,40))):
                # Tie-in: land, along the path size mm and back, twice; tie-off mirrors it before the trim.
                self.assertTrue(all(near(a, b) for a, b in zip(run[:5], (start, ahead, start, ahead, start))), (size, run[:5]))
                self.assertTrue(all(near(a, b) for a, b in zip(run[-5:], (end, back, end, back, end))), (size, run[-5:]))
            arrow = runs(self.lines(10, tieIn="triangle", tieOff="triangle", lockSize=size))
            for run in arrow:
                (x, y) = run[0]
                self.assertTrue(near(run[1], (x+size, y+size/2)) and near(run[2], (x+size, y-size/2)) and near(run[3], (x, y)), (size, run[:4]))
                (x, y) = run[-1]
                self.assertTrue(near(run[-2], (x-size, y+size/2)) or near(run[-2], (x-size, y-size/2)), (size, run[-4:]))
        plain = runs(self.lines(10, tieIn="none", tieOff="none"))
        self.assertTrue(near(plain[0][1], (22.5, 40)) and near(plain[0][-2], (47.5, 40)), plain[0][:3])
        mixed = runs(self.lines(10, tieIn="none", tieOff="triangle", lockSize=1))
        self.assertTrue(near(mixed[1][1], (62.5, 40)))
        self.assertTrue(near(mixed[0][-2], (49, 39.5)) or near(mixed[0][-2], (49, 40.5)), mixed[0][-4:])

    def test_jumps_below_the_threshold_sew_one_stitch_without_trim_or_ties(self):
        for gap, trim_jump, trims in ((2, 3, 0), (5, 3, 1), (5, 6, 0), (9.5, 10, 0), (2, 1, 1)):
            result = self.lines(gap, trim_jump)
            self.assertEqual(result["stats"]["trims"], trims, (gap, trim_jump))
            self.assertEqual(pec_trims(result), trims)
            self.assertEqual(len(runs(result)), trims+1)
            if not trims:
                # One connecting stitch, and no lock stitches on either side of it.
                stitches = [c for c in result["commands"] if c["type"] == "stitch"]
                joint = next(c for c in stitches if near((c["fromX"], c["fromY"]), (50,40)) and c["x"] > 50.5)
                self.assertTrue(near((joint["x"], joint["y"]), (50+gap, 40)))
                self.assertEqual(sum(near((c["x"], c["y"]), (50,40)) for c in stitches), 1)
                self.assertEqual(sum(near((c["x"], c["y"]), (50+gap,40)) for c in stitches), 1)
        # A colour change always trims, with ties on both sides.
        result = self.lines(1, 10, ("#c99d72", "#849984"))
        self.assertEqual((result["stats"]["trims"], result["stats"]["colorChanges"]), (1, 1))
        first, second = runs(result)
        self.assertTrue(near(first[-2], (49,40)) and near(second[1], (52,40)))

    def test_readback_trims_match_the_compiler(self):
        p = json.loads(Path("tests/stitch-library.project.json").read_text())
        for trim_jump in (1, 3, 7, 10):
            for payload in ({**node("demo", None), "trimJump": trim_jump}, resolved({**p, "trimJump": trim_jump})):
                result = compile_project(payload)
                decoded = read_pes(io.BytesIO(base64.b64decode(result["pes"])))
                self.assertEqual(sum(1 for *_, c in decoded.stitches if c & 0xFF == 2), result["stats"]["trims"])
                self.assertEqual(pec_trims(result), result["stats"]["trims"])
                self.assertEqual(result["stats"]["jumps"], result["stats"]["trims"]+1)  # only the first move is a plain jump

    def test_settings_are_validated(self):
        for key, value in (("trimJump", .9), ("trimJump", 10.5), ("trimJump", None), ("trimJump", True)):
            p = project()
            p[key] = value
            with self.assertRaisesRegex(ValueError, "Trim jump"):
                compile_project(p)
        for settings in ({"tieIn": "knot"}, {"tieOff": None}, {"lockSize": .4}, {"lockSize": 1.6}, {"lockSize": "1"}):
            with self.assertRaises(ValueError):
                compile_project(project(**settings))
        missing = project()
        del missing["objects"][0]["tieIn"]
        with self.assertRaises(ValueError):
            compile_project(missing)


class CrossStitchTests(unittest.TestCase):
    def test_crosses_sew_rows_of_half_crosses_with_few_trims(self):
        square = [[[58,52],[84,52],[84,72],[58,72]]]
        for spacing, angle in ((1.5, 0), (2, 0), (1.5, 30)):
            result = compile_project(project("cross", square, spacing=spacing, angle=angle))
            self.assertEqual(result["stats"]["trims"], 0, (spacing, angle))
            cells, (x0, y0) = C.cross_cells(square, spacing, angle)
            legs = {}
            for c in result["commands"]:
                if c["type"] != "stitch":
                    continue
                a, b = C.rotate([[c["fromX"], c["fromY"]], [c["x"], c["y"]]], angle)
                if math.dist(a, b) < spacing*1.3:
                    continue
                i, j = math.floor((a[0]+b[0])/2/spacing-x0/spacing), math.floor((a[1]+b[1])/2/spacing-y0/spacing)
                slash = (b[0]-a[0])*(b[1]-a[1]) < 0
                legs.setdefault((i, j), []).append(slash)
            self.assertEqual(set(legs), cells)
            # Each cell: its "/" leg, then the "\\" leg on top.
            self.assertTrue(all(v == [True, False] for v in legs.values()), [v for v in legs.values() if v != [True, False]][:3])
            # Travel stays on the cross legs (through cell centres), never across a cell edge.
            for c in result["commands"]:
                if c["type"] == "stitch" and math.dist((c["fromX"], c["fromY"]), (c["x"], c["y"])) > .05:
                    a, b = C.rotate([[c["fromX"], c["fromY"]], [c["x"], c["y"]]], angle)
                    self.assertAlmostEqual(abs(b[0]-a[0]), abs(b[1]-a[1]), delta=.2, msg=(a, b))  # 0.1 mm PES rounding

    def test_stitch_library_crosses_trim_far_less(self):
        p = json.loads(Path("tests/stitch-library.project.json").read_text())
        cross = resolved({**p, "objects": [o for o in p["objects"] if o["kind"] == "cross"]})
        self.assertLessEqual(compile_project(cross)["stats"]["trims"], 2)
        self.assertLessEqual(compile_project(resolved(p))["stats"]["trims"], 15)  # was 905
