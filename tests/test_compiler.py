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

    def test_preview_owners_follow_objects_even_with_same_colour_and_repeated_holes(self):
        p = objects_project({"id": "a", "kind": "bean", "rings": [[[20,20],[25,20],[20,20]]]},
                            {"id": "b", "kind": "bean", "rings": [[[60,60],[65,60],[60,60]]]},
                            {"id": "a-border", "kind": "running", "rings": [[[20,20],[25,20],[20,20]]]})
        result = compile_project(p)
        owners = [c["objectIndex"] for c in result["commands"] if c["type"] == "stitch"]
        self.assertEqual(sorted(set(owners)), [0, 1, 2])
        self.assertEqual(owners, sorted(owners))
        for i, obj in enumerate(p["objects"]):
            expected = compile_project({**p, "objects": [obj]})
            stitches = [c for c in result["commands"] if c["type"] == "stitch" and c["objectIndex"] == i]
            self.assertEqual([(c["x"], c["y"]) for c in stitches], [(c["x"], c["y"]) for c in expected["commands"] if c["type"] == "stitch"])
            self.assertTrue(all(c["objectId"] == obj["id"] for c in stitches))
        jumps = [c for c in result["commands"] if c["type"] == "jump"]
        self.assertEqual([c["objectId"] for c in jumps], ["a", "b", "a-border"])
        self.assertEqual([c["fromObjectId"] for c in jumps[1:]], ["a", "b"])
        hidden = copy.deepcopy(p)
        hidden["objects"][0]["hidden"] = True
        other = compile_project(hidden)
        self.assertEqual(result["pes"], other["pes"])
        self.assertEqual(result["commands"], other["commands"])

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
        # Keep the committed reference stable: elapsed time is deliberately not a fixture.
        expected = json.loads(Path("tests/stitch-library.json").read_text())
        self.assertEqual(result["pes"], expected["pes"])
        self.assertEqual([{k:v for k,v in c.items() if k != "tie"} for c in result["commands"]], expected["commands"])
        self.assertEqual({k:v for k,v in result["stats"].items() if k != "durationMs"},
                         {k:v for k,v in expected["stats"].items() if k != "durationMs"})
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


class DesignCheckTests(unittest.TestCase):
    def codes(self, p):
        result = compile_project(p)
        for w in result["warnings"]:
            self.assertEqual(set(w), {"code", "objectId", "bounds", "severity", "values"} | ({"fromId"} if w["code"] == "long-jump" else set()))
            self.assertIn(w["severity"], ("fail", "check"))
            self.assertTrue(w["bounds"][0] <= w["bounds"][2] and w["bounds"][1] <= w["bounds"][3])
        return {w["code"]: w for w in result["warnings"]}

    def lines(self, *rings, trim_jump=3, colours=None):
        p = objects_project(*({"id": f"o{i}", "kind": "running", "rings": [r], "color": (colours or ["#c99d72"]*len(rings))[i]} for i, r in enumerate(rings)))
        p["trimJump"] = trim_jump
        return p

    def test_clean_projects_have_no_warnings(self):
        self.assertEqual(self.codes(project()), {})
        self.assertEqual(self.codes(self.lines([[20,20],[40,20]], [[20,24],[40,24]])), {})

    def test_short_stitches(self):
        p = project("manual", [[[20+i*.15, 30] for i in range(40)]])
        w = self.codes(p)["short-stitches"]
        self.assertEqual(w["severity"], "fail")
        self.assertLess(w["values"]["shortest"], .3)
        self.assertLessEqual(w["bounds"][0], 20.5)

    def test_long_stitches_exclude_satin_bites(self):
        w = self.codes(self.lines([[20,20],[40,20]], [[48,20],[60,20]], trim_jump=10))["long-stitches"]
        self.assertEqual((w["objectId"], w["severity"]), ("o1", "check"))
        self.assertAlmostEqual(w["values"]["longest"], 8, delta=.15)
        self.assertNotIn("long-stitches", self.codes(project("satin", [[[20,40],[60,40]]], satinWidth=10, splitLength=12)))

    def test_dense_stacked_fills(self):
        square = [[[30,30],[60,30],[60,60],[30,60]]]
        stack = lambda n, u="tatami": objects_project(*({"id": f"f{i}", "kind": "fill", "rings": square, "angle": i*45, "underlay": u} for i in range(n)))
        self.assertNotIn("dense", self.codes(stack(2, "edge-tatami")))
        self.assertEqual(self.codes(stack(3))["dense"]["severity"], "check")
        w = self.codes(stack(3, "edge-tatami"))["dense"]
        self.assertEqual((w["severity"], w["values"]["objects"]), ("fail", 3))
        self.assertGreaterEqual(w["values"]["layers"], 5)
        self.assertEqual(self.codes(stack(4))["dense"]["severity"], "fail")

    def test_long_jump_between_objects_of_one_colour(self):
        w = self.codes(self.lines([[10,10],[20,10]], [[60,60],[70,60]]))["long-jump"]
        self.assertEqual((w["objectId"], w["fromId"]), ("o1", "o0"))
        self.assertGreater(w["values"]["length"], 30)
        self.assertNotIn("long-jump", self.codes(self.lines([[10,10],[20,10]], [[60,60],[70,60]], colours=("#c99d72", "#526b57"))))

    def test_many_trims(self):
        rings = [[[10+(i % 6)*15, 10+(i//6)*15], [14+(i % 6)*15, 10+(i//6)*15]] for i in range(30)]
        w = self.codes(project("running", rings))["many-trims"]
        self.assertGreater(w["values"]["count"], 25)
        self.assertNotIn("many-trims", self.codes(project("running", rings[:10])))

    def test_preview_marks_trims_and_travel(self):
        result = compile_project(self.lines([[20,20],[40,20]], [[42,20],[60,20]], [[20,60],[40,60]]))
        self.assertEqual(sum(c["trim"] for c in result["commands"]), result["stats"]["trims"])
        self.assertTrue(all(c["type"] == "jump" for c in result["commands"] if c["trim"]))
        travel = [c for c in result["commands"] if c["travel"]]
        self.assertEqual(len(travel), 1)
        self.assertAlmostEqual(math.dist((travel[0]["fromX"], travel[0]["fromY"]), (travel[0]["x"], travel[0]["y"])), 2, delta=.15)

    def test_bear_and_library_on_woven_have_no_likely_failures(self):
        bear = compile_project(node("demo", None))["warnings"]
        self.assertEqual([w for w in bear if w["severity"] == "fail"], [])
        library = compile_project(resolved(json.loads(Path("tests/stitch-library.project.json").read_text())))["warnings"]
        self.assertEqual([w for w in library if w["severity"] == "fail"], [])


class RunToleranceTests(unittest.TestCase):
    def test_corners_curves_lengths_and_repeat_runs(self):
        corner = [[20,20],[30,20],[30,30]]
        self.assertIn([30,20], C.tolerant_path(corner, 2.5, 1))
        arc = [[40+8*math.cos(i*math.pi/80), 40+8*math.sin(i*math.pi/80)] for i in range(41)]
        low, high = [C.tolerant_path(arc, 3, t) for t in (.1, 1)]
        self.assertLessEqual(len(high), len(low))
        for path in (low, high):
            self.assertTrue(all(math.dist(a,b) <= 3+1e-8 for a,b in zip(path,path[1:])))
            self.assertEqual(path[0], arc[0])
            self.assertAlmostEqual(math.dist(path[-1], arc[-1]), 0)
        for kind in ("running", "bean", "backstitch"):
            o = project(kind, [arc], tolerance=.2)["objects"][0]
            path, limit = C.line_passes(o, arc)[0]
            self.assertEqual(limit, 2.5)
            self.assertGreaterEqual(len(path), len(C.tolerant_path(arc, 2.5, .2)))
            compile_project(project(kind, [arc], tolerance=.2))
        for value in (None, True, "0.2", 0, 1.1, math.nan):
            with self.assertRaises(ValueError):
                compile_project(project("running", [corner], tolerance=value))


class FillPatternTests(unittest.TestCase):
    def test_cycles_alignment_skip_last_and_lengths(self):
        rows = [(30+i*.5, 20, 60) for i in range(12)]
        for pattern in (id for id,p in C.FILL_PATTERNS.items() if p["mode"] != "engine"):
            piece = C.Rows(rows, 0, pattern, [40,30], .5)
            paths = piece.paths((False, 0), 4)
            self.assertEqual(paths, piece.paths((False, 0), 4), pattern)
            for i,path in enumerate(paths):
                self.assertTrue(all(20 <= x <= 60 for x,y in path), pattern)
                self.assertEqual(path[0][0],20 if i % 2 == 0 else 60)
                if pattern == "even" or i == len(paths)-1:
                    self.assertEqual(path[-1][0],60 if i % 2 == 0 else 20)
            if pattern == "tatami":
                self.assertEqual(paths[0][1:], [[p[0],30] for p in paths[4][1:]])
        piece = C.Rows(rows[:2],0,"original",[40,30],.5)
        self.assertEqual(piece.paths((False,0),4)[0][-1],[56,30])
        piece.skip_last = False
        self.assertEqual(piece.paths((False,0),4)[0][-1],[60,30])
        self.assertEqual(C.pattern_offset("offset-columns", 6, 4), 6)
        self.assertEqual(C.pattern_offset("waves", 3, 4, {"steps":12,"amplitude":3}), 3)

    def test_even_is_identical_and_patterns_survive_exit_split(self):
        p = project(angle=35, underlay="tatami", exit=[60,45])
        self.assertEqual(compile_project(p)["pes"], compile_project(project(angle=35, underlay="tatami", exit=[60,45], fillPattern="even"))["pes"])
        for pattern in (id for id,p in C.FILL_PATTERNS.items() if p["mode"] != "engine"):
            result = compile_project(project(angle=0, fillPattern=pattern, exit=[60,45]))
            self.assertNotIn("short-stitches", [w["code"] for w in result["warnings"]], pattern)
        for settings in ({"fillPattern":"unknown"}, {"fillPattern":[]}, {"patternParams":None}, {"patternParams":{"steps":1.1}}, {"patternParams":{"steps":101}}, {"patternParams":{"amplitude":-1}}, {"patternParams":{"extra":1}}):
            with self.assertRaises(ValueError):
                compile_project(project(**settings))

    def test_parts_have_independent_centroids_near_edge_indices_and_holes(self):
        from unittest.mock import patch
        rings = [[[10,10],[30,10],[30,25],[10,25]],[[61,11],[81,11],[81,26],[61,26]]]
        seen, original = [], C.Rows.paths
        def paths(piece, variant, length):
            if piece.pattern:
                seen.append((piece.anchor,dict(piece.lanes),piece.rows))
            return original(piece,variant,length)
        with patch.object(C.Rows,"paths",paths):
            compile_project(project(rings=rings,fillPattern="partitionTwill",angle=0,spacing=.5))
        self.assertEqual(sorted({tuple(anchor) for anchor,_,_ in seen}),[(20,17.5),(71,18.5)])
        for anchor,lanes,rows in seen:
            self.assertEqual(lanes[round(rows[0][0],9)],0)
            self.assertEqual(list(lanes.values()),list(range(len(lanes))))
        hole = [[15,14],[25,14],[25,21],[15,21]]
        seen.clear()
        with patch.object(C.Rows,"paths",paths):
            compile_project(project(rings=[rings[0],hole],fillPattern="tatami",angle=0))
        self.assertEqual(len({tuple(anchor) for anchor,_,_ in seen}),1)
        self.assertEqual(seen[0][0],[20,17.5])

    def test_exact_cycles_examples_and_shear(self):
        cycle = lambda id: C.pattern_cycle(id,4,.2)[0]
        for id,n in {"smallHearts":20,"mediumHearts":40,"largeHearts":60,"smallDiamond":10,"mediumDiamond":30,"largeDiamond":60,"smallCircles":18,"mediumCircles":38,"largeCircles":58,"hexweave":36,"partitionChain":40,"partitionStars":40,"zigzag":40,"heartbeat":21,"spiral":40,"staircase":40,"rainfall":30,"tornado":75,"partitionWaveWalk":21}.items():
            self.assertEqual(len(cycle(id)),n,id)
        for id,index,offset,lengths in [("smallHearts",0,.693,[.149,2.316,.149,1.387]),("smallHearts",10,.407,[3.187,.813]),("smallDiamond",1,.8,[.4,1.6]),("smallCircles",1,1.128,[1.744,2.256]),("rainfall",1,1.591,[4.716]),("partitionChain",0,1.715,[.571,3.429,.571,3.429]),("partitionStars",15,0,[.058,7.884,.058])]:
            o,ls = cycle(id)[index]
            self.assertAlmostEqual(o,offset,delta=.002,msg=id)
            self.assertEqual(len(ls),len(lengths),id)
            for a,b in zip(ls,lengths):
                self.assertAlmostEqual(a,b,delta=.002,msg=id)
        self.assertEqual(cycle("partitionBands"),[(0,[4])]*4+[(.5,[4])]*4)
        self.assertEqual(cycle("partitionInterlocked")[4],(.5,[4/3]*3))
        self.assertEqual(cycle("partitionRails")[4],(.5,[3.12,.88]))
        self.assertEqual(cycle("partitionHoundstooth"),[(0,[1,1,2]),(2,[2,1,1])])
        self.assertAlmostEqual(C.pattern_cycle("partitionTwill",4,.2)[1],.2)
        rows = [(10+i*.2,0,40) for i in range(6)]
        piece = C.Rows(rows,0,"partitionTwill",[20,10],.2)
        for k,path in enumerate(piece.paths((False,0),4)[:5]):
            base = 20-(k % 4)-.2*k
            for x,y in path[1:]:
                self.assertLess(min(abs((x-base) % 4),abs((x-base+1) % 4),abs((x-base) % 4-4),abs((x-base+1) % 4-4)),1e-8)
        # Ember's falsy-amplitude quirk is intentional.
        self.assertEqual(C.pattern_cycle("waves",4,.2,{"amplitude":0}),C.pattern_cycle("waves",4,.2))

    def test_square_penetration_fixtures_machine_limit_and_unbroken_tile_floats(self):
        import hashlib
        expected = json.loads(Path("tests/fill-pattern-penetrations.json").read_text())
        for id in (id for id,p in C.FILL_PATTERNS.items() if p["mode"] != "engine"):
            p = project(fillPattern=id,fillLength=4,angle=0,spacing=.4,tieIn="none",tieOff="none")
            result = compile_project(p)
            digest = hashlib.sha256(json.dumps(result["commands"],separators=(",",":")).encode()).hexdigest()
            self.assertEqual(digest,expected[id],id)
            self.assertLessEqual(result["stats"]["maxStitch"],12.7,id)
            # Exercise maximum L, maximum pattern params, diagonal quantisation and jitter.
            params = {f["key"]:f["max"] for f in C.FILL_PATTERNS[id].get("params",[])}
            result = compile_project(project(fillPattern=id,patternParams=params,fillLength=6,angle=37,spacing=.3,handStitch=5))
            self.assertLessEqual(result["stats"]["maxStitch"],12.7,id)
        for id in ("largeHearts","largeDiamond","largeCircles","partitionStars"):
            r = compile_project(project(fillPattern=id,fillLength=4,angle=0,spacing=.3))
            self.assertGreater(r["stats"]["maxStitch"],7,id)
            self.assertNotIn("long-stitches",[w["code"] for w in r["warnings"]],id)

    def test_pattern_specific_parameter_validation(self):
        for id,p in C.FILL_PATTERNS.items():
            for f in p.get("params",[]):
                for value in (f["min"],f["default"],f["max"],float(f["default"])):
                    C.validate(project(fillPattern=id,patternParams={f["key"]:value}))
                    C.pattern_cycle(id,4,.2,{f["key"]:value}) if p["mode"] != "engine" else None
                for value in (None,True,"3",math.nan,math.inf,f["min"]-f["step"],f["max"]+f["step"],f["min"]+f["step"]*.5):
                    with self.assertRaises(ValueError,msg=(id,f["key"],value)):
                        C.validate(project(fillPattern=id,patternParams={f["key"]:value}))
            with self.assertRaises(ValueError,msg=id):
                C.validate(project(fillPattern=id,patternParams={"wrong":1}))
        with self.assertRaises(ValueError):
            C.validate(project(fillPattern="heartbeat",patternParams={"tightness":3}))

    def test_pattern_long_stitch_check_preserves_connector_and_float_safety(self):
        objects = project(fillPattern="largeHearts")["objects"]
        for role,length,warn,limit in [("pattern",12,False,0),("pattern",12.8,True,12.7),("bite",12.8,True,12.7),("connect",8,True,7),("run",8,True,7)]:
            result = C.design_check([(20,20,0,"land"),(20+length,20,0,role)],[],objects)
            found = [w for w in result if w["code"] == "long-stitches"]
            self.assertEqual(bool(found),warn,(role,length))
            if warn:
                self.assertEqual(found[0]["values"]["limit"],limit)


class FillSettingsTests(unittest.TestCase):
    def test_underlay_preset_is_byte_identical_and_list_order_is_preserved(self):
        for mode in ("none", "edge", "tatami", "edge-tatami"):
            preset = [{"angle":90,"spacing":2,"length":2.5,"inset":.4}] if "tatami" in mode else []
            legacy = compile_project(project(underlay=mode))
            explicit = compile_project(project(underlay=mode, fillUnderlays=preset))
            self.assertEqual(explicit["pes"], legacy["pes"], mode)
            self.assertEqual(explicit["commands"], legacy["commands"], mode)
        from unittest.mock import patch
        passes = [{"angle":90,"spacing":2,"length":4,"inset":.4}, {"angle":45,"spacing":3,"length":5,"inset":1}]
        # Record the sections as they are sewn, before travel and PES quantisation.
        seen, original = [], C.Rows.paths
        def paths(piece, variant, length):
            seen.append((piece.angle,length))
            return original(piece,variant,length)
        with patch.object(C.Rows, "paths", paths):
            compile_project(project(angle=0, fillUnderlays=passes, fillLength=3.5))
        self.assertEqual(seen, [(90,4),(45,5),(0,3.5)])
        self.assertEqual(compile_project(project(fillUnderlays=[]))["pes"], compile_project(project())["pes"])
        for settings in (None, {}, [None], [{}], passes*2, [{**passes[0],"spacing":.9}], [{**passes[0],"length":5.1}], [{**passes[0],"angle":181}], [{**passes[0],"inset":-1}]):
            with self.assertRaises(ValueError):
                compile_project(project(fillUnderlays=settings))

    def test_hand_stitch_is_seeded_perpendicular_bounded_and_keeps_ends(self):
        path = [[20+i*4,30] for i in range(12)]
        for intensity in range(6):
            changed = C.hand_stitch(path,0,4,intensity,"shape")
            self.assertEqual(changed,C.hand_stitch(path,0,4,intensity,"shape"))
            self.assertEqual(changed[0],path[0])
            self.assertEqual(changed[-1],path[-1])
            bound = .1*(.5**1.5*16+.02*intensity)*(intensity/5)**1.2
            self.assertTrue(all(abs(p[1]-q[1]) <= bound+1e-9 and p[0] == q[0] for p,q in zip(changed,path)))
        self.assertNotEqual(C.hand_stitch(path,0,4,5,"shape"),C.hand_stitch(path,0,4,5,"other"))
        self.assertEqual(C.hand_stitch(path,0,4,0,"shape"),path)
        p = project(id="stable", handStitch=5, fillPattern="tatami", fillLength=4, underlay="tatami")
        self.assertEqual(compile_project(p)["pes"],compile_project(p)["pes"])
        self.assertEqual(compile_project(project(handStitch=0))["pes"],compile_project(project())["pes"])
        underlay = {**p["objects"][0], "kind":"fill"}
        quiet = {**underlay,"handStitch":0}
        self.assertEqual(C.route_fill(underlay,None,None,None,True),C.route_fill(quiet,None,None,None,True))

    def test_fill_length_changes_only_cover_rows_and_does_not_change_runs(self):
        from unittest.mock import patch
        seen, original = [], C.Rows.paths
        def paths(piece, variant, length):
            seen.append((piece.angle,length))
            return original(piece,variant,length)
        with patch.object(C.Rows, "paths", paths):
            compile_project(project(angle=0, underlay="tatami", fillLength=6))
        self.assertEqual(seen,[(90,2.5),(0,6)])
        for kind in ("running","bean","backstitch","cross"):
            rings = [[[20,20],[60,20]]] if kind != "cross" else None
            self.assertEqual(compile_project(project(kind,rings,fillLength=6))["pes"],compile_project(project(kind,rings))["pes"])
        self.assertEqual(compile_project(project(fillLength=2.5))["pes"],compile_project(project())["pes"])
        long = compile_project(project(angle=0,fillLength=6,tieIn="none",tieOff="none"))
        self.assertGreater(long["stats"]["maxStitch"],5)
        self.assertLessEqual(long["stats"]["maxStitch"],6.15)

    def test_gradient_spacing_ramp_reverse_and_plateau(self):
        ramp = {"mode":"ramp","start":.2,"end":.8,"endSpacing":2}
        samples = [C.gradient_spacing(ramp,i/10,.4) for i in range(11)]
        self.assertEqual(samples,sorted(samples))
        self.assertEqual(samples[0],.4)
        self.assertEqual(samples[-1],2)
        reverse = {**ramp,"start":.8,"end":.2}
        for a,b in zip([C.gradient_spacing(reverse,i/10,.4) for i in range(11)],sorted(samples,reverse=True)):
            self.assertAlmostEqual(a,b)
        plateau = {"mode":"plateau","center":.5,"width":.2,"endSpacing":2}
        for i in range(11):
            self.assertAlmostEqual(C.gradient_spacing(plateau,i/10,.4),C.gradient_spacing(plateau,1-i/10,.4))
        self.assertEqual(C.gradient_spacing(plateau,.5,.4),.4)
        rings = project()["objects"][0]["rings"]
        rows = C.fill_sections(rings,.4,"evenodd",gradient=ramp)[0]
        gaps = [b[0]-a[0] for a,b in zip(rows,rows[1:])]
        self.assertTrue(all(a <= b+1e-9 for a,b in zip(gaps,gaps[1:])))
        for g in (ramp,reverse,plateau,{**ramp,"start":.5,"end":.5}):
            result = compile_project(project(gradient=g,fillPattern="tatami",exit=[60,45]))
            self.assertTrue(result["commands"])
            self.assertLess(result["stats"]["trims"],3)
        for patch in ({"fillLength":None},{"fillLength":.9},{"fillLength":6.1},{"handStitch":True},{"handStitch":2.5},{"handStitch":6},{"gradient":None},{"gradient":{}},{"gradient":{**ramp,"start":-1}},{"gradient":{**ramp,"endSpacing":4.1}},{"gradient":{**plateau,"width":math.nan}}):
            with self.assertRaises(ValueError):
                compile_project(project(**patch))

    def test_unset_settings_preserve_baseline_bear_and_quiet_patterns(self):
        import hashlib
        bear = node("demo",None)
        self.assertEqual(hashlib.sha256(compile_project(bear)["pes"].encode()).hexdigest(),"ed5cb6963af3c5e265158a214cda92f09787818a163805888bb7aca0a18debab")
        for pattern in (id for id,p in C.FILL_PATTERNS.items() if p["mode"] != "engine"):
            p = copy.deepcopy(bear)
            for o in p["objects"]:
                if o["kind"] == "fill":
                    o["fillPattern"] = pattern
            self.assertEqual(compile_project(p)["warnings"],[],pattern)


class NonRowFillTests(unittest.TestCase):
    def test_satin_splits_columns_and_uses_satin_settings(self):
        from embroidery.engines import satin_columns
        shell = [[20,20],[70,20],[70,60],[20,60]]
        hole = [[35,30],[55,30],[55,50],[35,50]]
        p = project(rings=[shell,hole],fillPattern="sweepSatin",angle=0,spacing=.32,underlay="center")
        columns = satin_columns(p["objects"][0])
        self.assertGreaterEqual(len(columns),4)
        for rows in columns:
            for y,a,b in rows:
                self.assertTrue(all(inside(q,[shell,hole]) for q in C.interpolate([a,y],[b,y],.1)))
        result = compile_project(p)
        self.assertEqual(result["pes"],compile_project(p)["pes"])
        self.assertLessEqual(result["stats"]["maxStitch"],7.15)
        self.assertNotIn("long-stitches",[w["code"] for w in result["warnings"]])
        for key,value in (("spacing",.19),("spacing",1.01),("splitLength",13),("shortStitches",None)):
            with self.assertRaises(ValueError):
                compile_project(project(fillPattern="sweepSatin",**{key:value}))

    def test_satin_demo_is_quiet(self):
        p = node("demo",None)
        for o in p["objects"]:
            if o["kind"] == "fill":
                o.update(fillPattern="sweepSatin",spacing=.32,underlay="center",pullCompensation=.4,splitLength=7,shortStitches=True)
        self.assertEqual(compile_project(p)["warnings"],[])

    def test_circular_true_spacing_center_clipping_and_determinism(self):
        from embroidery.engines import circular_arms,clip_lines
        arms = circular_arms([50,50],20,.5,4)
        self.assertEqual(arms[0][0],[49.5,50])
        self.assertAlmostEqual(math.dist(arms[0][0],arms[1][0]),1)
        shell,hole = [[20,20],[80,20],[80,80],[20,80]],[[40,40],[60,40],[60,60],[40,60]]
        for line in clip_lines(arms,[shell,hole],'evenodd'):
            self.assertTrue(all(inside(p,[shell,hole],tolerance=.01) for a,b in zip(line,line[1:]) for p in C.interpolate(a,b,.1)))
        p = project(fillPattern='circular',spacing=.5)
        result = compile_project(p)
        self.assertEqual(result['pes'],compile_project(p)['pes'])
        self.assertEqual(result['pes'],compile_project(project(fillPattern='circular',spacing=.5,center=[45,45]))['pes'])
        self.assertNotEqual(result['pes'],compile_project(project(fillPattern='circular',spacing=.5,center=[42,46]))['pes'])
        self.assertLessEqual(result['stats']['maxStitch'],4.15)
        for center in ([],[1],[1,2,3],[math.nan,40],[-1,40],[101,40]):
            with self.assertRaises(ValueError):
                compile_project(project(fillPattern='circular',center=center))

    def test_circular_demo_is_quiet(self):
        p = node('demo',None)
        for o in p['objects']:
            if o['kind']=='fill':
                o.update(fillPattern='circular')
        self.assertEqual(compile_project(p)['warnings'],[])

    def test_cross_styles_cycles_coverage_dense_repeats_and_legacy(self):
        from embroidery.cross import cells,cross_cycle
        self.assertEqual(cross_cycle(0,0,'cross',1),[(2,0),(1,1),(0,0),(2,2),(1,1),(0,2),(2,0)])
        self.assertEqual(cross_cycle(0,0,'upright',1),[(1,0),(1,1),(0,1),(2,1),(1,1),(1,2),(1,0)])
        seen = set()
        for style in ('cross','upright','double','smyrna','half'):
            p = project('cross',crossStyle=style,crossSize=3,threadCount=2,coverage=50)
            r = compile_project(p)
            self.assertEqual(r['pes'],compile_project(p)['pes'])
            self.assertLessEqual(r['stats']['maxStitch'],4.15)
            seen.add(r['pes'])
            dense = compile_project(project('cross',crossStyle=style,crossSize=3,dense=True))
            repeat = compile_project(project('cross',crossStyle=style,crossSize=3,threadCount=8))
            self.assertGreater(dense['stats']['stitches'],r['stats']['stitches'])
            self.assertGreater(repeat['stats']['stitches'],r['stats']['stitches'])
        self.assertEqual(len(seen),5)
        p = project('cross',crossStyle='cross',rings=[[[30,30],[37.5,30],[37.5,39],[30,39]]])['objects'][0]
        low = cells(p)[0]
        high = cells({**p,'coverage':100})[0]
        self.assertGreater(len(low),len(high))
        self.assertNotEqual(compile_project(project('cross',crossStyle='half',flipped=True))['pes'],compile_project(project('cross',crossStyle='half'))['pes'])
        for key,value in [('crossStyle','rows'),('crossSize',.5),('crossSize',3.2),('threadCount',1.5),('threadCount',9),('coverage',0),('dense',1),('flipped',None)]:
            with self.assertRaises(ValueError):
                compile_project(project('cross',**{key:value}))

    def test_cross_demo_is_quiet(self):
        for style in ('cross','upright','double','smyrna','half'):
            p = node('demo',None)
            for o in p['objects']:
                if o['kind']=='fill':
                    o.update(fillPattern='crossStitchFill',crossStyle=style)
            self.assertEqual(compile_project(p)['warnings'],[],style)

    def test_streamlines_field_separation_clipping_and_determinism(self):
        from embroidery.streamlines import generate,rk4,flow_field
        shell = [[30,30],[60,30],[60,60],[30,60]]
        lines = generate([shell],0,3)
        self.assertEqual(lines,generate([shell],0,3))
        self.assertGreater(len(lines),4)
        self.assertNotEqual(lines,generate([shell],60,3))
        self.assertLess(len(generate([shell],0,6)),len(lines))
        self.assertAlmostEqual(math.dist([45,45],rk4([45,45],.1,flow_field(0,[45,45]))),.1,places=5)
        # Accepted curves cannot collide closer than the dTest separation guard.
        for i,line in enumerate(lines):
            for other in lines[:i]:
                self.assertGreaterEqual(min(math.dist(a,b) for a in line[::10] for b in other[::10]),1.49)
        p = project(fillPattern='streamlines',angle=20)
        r = compile_project(p)
        self.assertEqual(r['pes'],compile_project(p)['pes'])
        self.assertLessEqual(r['stats']['maxStitch'],4.15)
        self.assertEqual(r['pes'],compile_project(project(fillPattern='streamlines',angle=20,underlay='tatami',pullCompensation=.8))['pes'])
        for separation in (.4,1.2,20.5):
            with self.assertRaises(ValueError):
                compile_project(project(fillPattern='streamlines',patternParams={'separation':separation}))

    def test_streamlines_demo_is_quiet(self):
        p = node('demo',None)
        for o in p['objects']:
            if o['kind']=='fill':
                o.update(fillPattern='streamlines')
        self.assertEqual(compile_project(p)['warnings'],[])


    def test_legacy_pes_remains_byte_identical_to_original_compiler(self):
        import hashlib
        fixtures = [(node('demo',None),'ed5cb6963af3c5e265158a214cda92f09787818a163805888bb7aca0a18debab'),
                    (resolved(json.loads(Path('tests/stitch-library.project.json').read_text())),'9eec449e41875b5dc3669d05f727f12bba6b8def0937e178c9a278d497bb0a89')]
        for p,expected in fixtures:
            self.assertEqual(hashlib.sha256(compile_project(p)['pes'].encode()).hexdigest(),expected)

    def test_cross_coverage_respects_holes_overlaps_and_nonzero(self):
        from embroidery.cross import box_area
        a,b = [[0,0],[2,0],[2,2],[0,2]],[[1,0],[3,0],[3,2],[1,2]]
        self.assertAlmostEqual(box_area([a,b],0,0,3,'evenodd'),4)
        self.assertAlmostEqual(box_area([a,b],0,0,3,'nonzero'),6)
        shell,hole = [[0,0],[4,0],[4,4],[0,4]],[[1,1],[3,1],[3,3],[1,3]]
        self.assertAlmostEqual(box_area([shell,hole],0,0,4),12)
        self.assertAlmostEqual(box_area([shell,hole[::-1]],0,0,4,'nonzero'),12)
        self.assertAlmostEqual(box_area([[[0,0],[4,0],[0,4]]],0,0,4),8)

    def test_non_row_pes_keeps_holes_and_forces_near_disconnected_trims(self):
        shell = [[20,20],[80,20],[80,80],[20,80]]
        hole = [[35,35],[65,35],[65,65],[35,65]]
        for pattern in ('sweepSatin','circular','streamlines'):
            p = project(rings=[shell,hole],fillPattern=pattern,angle=35,tieIn='none',tieOff='none',spacing=.32 if pattern=='sweepSatin' else .45)
            r = compile_project(p)
            for c in r['commands']:
                if c['type']=='stitch':
                    self.assertTrue(all(inside(q,[shell,hole],tolerance=.15) for q in C.interpolate([c['fromX'],c['fromY']],[c['x'],c['y']],.1)),pattern)
            pieces = [[[30,30],[35,30],[35,45],[30,45]],[[36,30],[41,30],[41,45],[36,45]]]
            r = compile_project(project(rings=pieces,fillPattern=pattern,spacing=.32 if pattern=='sweepSatin' else .45,tieIn='none',tieOff='none'))
            self.assertGreaterEqual(r['stats']['trims'],1,pattern)

    def test_satin_settings_and_explicit_non_row_ends(self):
        triangle = [[[30,30],[60,30],[30,40]]]
        settings = dict(rings=triangle,fillPattern='sweepSatin',spacing=.32,angle=0)
        short = compile_project(project(**settings,shortStitches=True))
        full = compile_project(project(**settings,shortStitches=False))
        self.assertNotEqual(short['pes'],full['pes'])
        self.assertNotEqual(full['pes'],compile_project(project(**settings,pullCompensation=.4,shortStitches=False))['pes'])
        self.assertGreater(full['stats']['stitches'],compile_project(project(**settings,splitLength=12,shortStitches=False))['stats']['stitches'])
        for pattern in ('sweepSatin','circular','crossStitchFill','streamlines'):
            r = compile_project(project(fillPattern=pattern,entry=[30,45],exit=[60,45],spacing=.32 if pattern=='sweepSatin' else .45))
            sewn = [c for c in r['commands'] if c['type']=='stitch']
            self.assertEqual([sewn[0]['x'],sewn[0]['y']],[30,45],pattern)
            self.assertEqual([sewn[-1]['x'],sewn[-1]['y']],[60,45],pattern)


class EmberRopeAndBlockTests(unittest.TestCase):
    path = [[20,30],[40,36],[60,30],[75,45]]

    @staticmethod
    def block(left, right, **settings):
        centre = [[(a[0]+b[0])/2, (a[1]+b[1])/2] for a, b in zip(left, right)]
        return project("satin-block", [centre], railPaths=[left, right], **settings)

    @staticmethod
    def stitches(result):
        return [((c['fromX'], c['fromY']), (c['x'], c['y'])) for c in result['commands'] if c['type'] == 'stitch']

    def test_rope_runs_sew_a_hidden_double_run_then_alternating_offsets(self):
        rope = C.tolerant_path(self.path, 1.5, 1)
        for kind, count in (("double-rope", 3), ("triple-rope", 5)):
            passes = C.line_passes(project(kind, [self.path], length=1.5)["objects"][0], self.path)
            self.assertEqual(len(passes), count, kind)
            out, back, first = passes[0][0], passes[1][0], passes[2][0]
            self.assertEqual((out[0], out[-1], back), (self.path[0], self.path[-1], out[::-1]))
            self.assertTrue(all(math.dist(a, b) <= 3+1e-9 for a, b in zip(out, out[1:])))
            self.assertEqual(len(first), len(rope))
            sides = []
            for i, (p, q) in enumerate(zip(rope, first)):
                self.assertAlmostEqual(math.dist(p, q), .4)
                a, b = rope[max(0, i-1)], rope[min(len(rope)-1, i+1)]
                sides.append((b[0]-a[0])*(q[1]-p[1])-(b[1]-a[1])*(q[0]-p[0]) > 0)
            self.assertEqual(sides, [i % 2 == 0 for i in range(len(rope))], "even points +w, odd points -w")
            if kind == "triple-rope":
                mirrored = passes[3][0][::-1]
                for p, q, m in zip(rope, first, mirrored):
                    self.assertAlmostEqual(m[0], 2*p[0]-q[0])
                    self.assertAlmostEqual(m[1], 2*p[1]-q[1])
                self.assertEqual(passes[4][0], out)
        wide = C.line_passes(project("double-rope", [self.path], length=1.5, ropeWidth=1)["objects"][0], self.path)[2][0]
        self.assertAlmostEqual(math.dist(wide[3], rope[3]), 1)

    def test_rope_runs_compile_deterministically_within_machine_limits(self):
        square = [[30,30],[60,30],[60,60],[30,60],[30,30]]
        counts = {}
        for kind in ("double-rope", "triple-rope"):
            for rings in ([self.path], [square]):
                p = project(kind, rings, length=1.5)
                r = compile_project(p)
                self.assertEqual(r['pes'], compile_project(copy.deepcopy(p))['pes'])
                self.assertLessEqual(r['stats']['maxStitch'], C.SATIN_MAX)
                self.assertLessEqual(max(math.dist(a, b) for a, b in self.stitches(r)), 3.1)  # 3 mm base run; rope stitches <= L+2w
                self.assertEqual(r['warnings'], [])
                counts[kind, len(rings[0])] = r['stats']['stitches']
            self.assertNotEqual(compile_project(project(kind, [self.path], ropeWidth=.8))['pes'], compile_project(project(kind, [self.path]))['pes'])
            sewn = [c for c in compile_project(project(kind, [self.path], tieIn="none", tieOff="none"))['commands'] if c['type'] == 'stitch']
            self.assertEqual([sewn[0]['x'], sewn[0]['y']], self.path[0])
        self.assertGreater(counts["triple-rope", 4], counts["double-rope", 4])
        for width in (.1, 2.5, "1"):
            with self.assertRaises(ValueError):
                compile_project(project("double-rope", [self.path], ropeWidth=width))

    def test_e_stitch_flip_moves_the_stem_and_unset_keeps_todays_output(self):
        line = [[[20,40],[60,40]]]
        base = compile_project(project("e-stitch", line, satinWidth=3, spacing=1.5))['pes']
        self.assertEqual(base, compile_project(project("e-stitch", line, satinWidth=3, spacing=1.5, eFlipped=False))['pes'])
        self.assertNotEqual(base, compile_project(project("e-stitch", line, satinWidth=3, spacing=1.5, eFlipped=True))['pes'])
        plain, flipped = satin_path(line[0], 1.5, 3, "e-stitch"), satin_path(line[0], 1.5, 3, "e-stitch", flip=True)
        self.assertEqual({round(p[1], 6) for p in plain[::3]}, {38.5})
        self.assertEqual({round(p[1], 6) for p in flipped[::3]}, {41.5})
        self.assertEqual({round(p[1], 6) for p in flipped[1::3]}, {38.5})
        with self.assertRaises(ValueError):
            compile_project(project("e-stitch", line, eFlipped="yes"))

    def test_straight_block_equals_constant_width_satin(self):
        left, right = [[30,39],[60,39]], [[30,41],[60,41]]
        block = compile_project(self.block(left, right, spacing=.4))
        satin = compile_project(project("satin", [[[30,40],[60,40]]], satinWidth=2, spacing=.4))
        self.assertEqual(block['pes'], satin['pes'])
        pulled = C.block_path(left, right, .4, .4)
        self.assertEqual({round(p[1], 6) for p in pulled}, {38.8, 41.2})

    def test_tapered_block_rungs_interpolate_width_and_follow_spacing(self):
        left, right = [[20,40],[60,40]], [[20,41],[60,45]]
        rungs = C.block_rungs(left, right, .4)
        l, r = 40, math.dist(*right)
        self.assertEqual(len(rungs), round((r*2/3+l/3)/.4)+1)
        for a, b in rungs:
            self.assertAlmostEqual(a[0], b[0])
            self.assertAlmostEqual(math.dist(a, b), 1+4*(a[0]-20)/40)
        # Rungs pair by sample index, so a skewed rung pairing is followed rather than straightened.
        skew = C.block_rungs([[20,40],[40,40],[60,40]], [[20,44],[30,44],[60,44]], .4)
        mid = len(skew)//2
        self.assertLess(skew[mid][1][0], skew[mid][0][0])
        path = C.block_path(left, right, .4, 0, 7, False)
        self.assertTrue(all(abs(p[1]-40) < 1e-9 for p in path[::2]))

    def test_block_compiles_from_editor_rails_with_satin_settings_and_underlays(self):
        rails = {"points": [[[20,40],[40,35],[60,40]], [[20,44],[40,45],[60,52]]]}
        editor = {"version": 1, "name": "Blocks", "machine": "brother-pr1x", "hoop": "100x100", "fabric": "woven", **EDITOR,
                  "objects": [{"id": "b", "name": "Block", "kind": "satin-block", "color": "#c99d72", "rings": [[[20,42],[60,46]]],
                               "length": 2.5, "angle": 0, "satinWidth": 2, "rails": rails}]}
        p = resolved(editor)
        obj = p["objects"][0]
        self.assertEqual((obj["spacing"], obj["underlay"], obj["splitLength"], obj["shortStitches"]), (.4, "center", 7, True))
        self.assertEqual(len(obj["railPaths"][0]), len(obj["railPaths"][1]))
        r = compile_project(p)
        self.assertEqual(r['pes'], compile_project(copy.deepcopy(p))['pes'])
        self.assertLessEqual(r['stats']['maxStitch'], 7.2)
        self.assertFalse([w for w in r['warnings'] if w['code'] == 'long-stitches'])
        self.assertAlmostEqual(r['stats']['height'], 17.2, delta=.3)
        for underlay, count in (("none", 1), ("center", 2), ("edge", 3), ("zigzag", 2), ("edge-zigzag", 4)):
            o = {**obj, "underlay": underlay}
            passes = C.line_passes(o, o["rings"][0])
            self.assertEqual(len(passes), count, underlay)
            for (a, _), (b, _) in zip(passes, passes[1:]):
                self.assertLess(math.dist(a[-1], b[0]), 12.5, underlay)
            compile_project({**p, "objects": [o]})
        self.assertGreater(compile_project({**p, "objects": [{**obj, "splitLength": 12}]})['stats']['maxStitch'], 7.2)
        # A tight arc compresses the inner rail, so short stitches change it.
        arc = lambda radius: [[50+radius*math.cos(math.radians(a)), 50+radius*math.sin(math.radians(a))] for a in range(0, 91, 10)]
        bend = self.block(arc(2), arc(8), spacing=.4)
        self.assertNotEqual(compile_project(bend)['pes'], compile_project(self.block(arc(2), arc(8), spacing=.4, shortStitches=False))['pes'])
        self.assertNotEqual(r['pes'], compile_project({**p, "objects": [{**obj, "pullCompensation": .6}]})['pes'])
        # Narrow blocks get a centre walk at most, as satin does.
        thin = self.block([[20,40],[60,40]], [[20,41],[60,41]], underlay="edge-zigzag")["objects"][0]
        self.assertEqual(len(C.line_passes(thin, thin["rings"][0])), 2)
        # An entry at the far end sews the block from its last rung.
        far = compile_project({**p, "objects": [{**obj, "underlay": "none", "tieIn": "none", "entry": obj["rings"][0][-1]}]})
        first = next(c for c in far['commands'] if c['type'] == 'stitch')
        self.assertLess(math.dist([first['x'], first['y']], [60, 40]), .5)

    def test_block_rails_are_validated(self):
        left, right = [[30,39],[60,39]], [[30,41],[60,41]]
        for rails in (None, [left], [left, right[:1]], [left[:1], right[:1]], [left, [[30,41],[160,41]]], [left, [[30,41],[60]]]):
            p = self.block(left, right)
            p["objects"][0]["railPaths"] = rails
            with self.assertRaises(ValueError):
                compile_project(p)
        with self.assertRaises(ValueError):
            compile_project(self.block(left, right, underlay="tatami"))
        p = self.block(left, right)
        del p["objects"][0]["splitLength"]
        with self.assertRaises(ValueError):
            compile_project(p)


class ShapeOperationTests(unittest.TestCase):
    """Fills produced by the editor's Cut holes and Flatten overlaps compile and respect their holes."""
    @staticmethod
    def editor(*objects):
        return {"version": 1, "name": "Shapes", "machine": "brother-pr1x", "hoop": "100x100", "fabric": "woven", **EDITOR,
                "objects": [{"id": i, "name": i, "kind": "fill", "color": c, "length": 2.5, "angle": a, "satinWidth": 2, **o} for i, c, a, o in objects]}

    @staticmethod
    def sampled(result, owner):
        for c in result["commands"]:
            if c["type"] == "stitch" and c.get("objectId") == owner:
                for t in (0, .25, .5, .75, 1):
                    yield c["fromX"]+(c["x"]-c["fromX"])*t, c["fromY"]+(c["y"]-c["fromY"])*t

    def test_cut_holes_from_a_curve_shape(self):
        circle = [[50+12*math.cos(i/12*math.tau), 50+12*math.sin(i/12*math.tau)] for i in range(12)]
        p = self.editor(("base", "#c99d72", 35, {"rings": [[[20,20],[80,20],[80,80],[20,80]]]}),
                        ("hole", "#f4e5cc", 0, {"rings": [circle], "curve": {"points": circle, "closed": True, "spline": "levien"}}))
        payload = node("cut-holes", {"project": p, "ids": ["base", "hole"]})
        self.assertEqual([o["id"] for o in payload["objects"]], ["base"])
        self.assertEqual(len(payload["objects"][0]["rings"]), 2)
        result = compile_project(payload)
        points = list(self.sampled(result, "base"))
        self.assertGreater(len(points), 200)
        self.assertFalse([q for q in points if math.dist(q, (50, 50)) < 11.6])

    def test_flatten_keeps_a_small_overlap_under_the_later_fill(self):
        p = self.editor(("lower", "#c99d72", 0, {"rings": [[[20,20],[60,20],[60,60],[20,60]]]}),
                        ("upper", "#664538", 90, {"rings": [[[40,40],[80,40],[80,80],[40,80]]]}))
        payload = node("flatten", {"project": p, "ids": ["lower", "upper"]})
        result = compile_project(payload)
        lower = list(self.sampled(result, "lower"))
        self.assertFalse([q for q in lower if q[0] > 40.75 and q[1] > 40.75])
        self.assertTrue([q for q in lower if 40.05 < q[0] < 40.5 and q[1] > 45])

class OverlayMetadataTests(unittest.TestCase):
    def test_compiled_ties_describe_actual_locks(self):
        p = objects_project({"id":"overlay", "kind":"running", "rings":[[[20,20],[30,20]]], "tieIn":"tack", "tieOff":"triangle", "lockSize":1})
        commands = compile_project(p)['commands']
        self.assertEqual({c['tie'] for c in commands if c.get('tie')}, {'in','off'})
        self.assertTrue(all(c['type']=='stitch' and c['objectId']=='overlay' for c in commands if c.get('tie')))
        p['objects'][0].update(tieIn='none',tieOff='none')
        self.assertFalse(any(c.get('tie') for c in compile_project(p)['commands']))
