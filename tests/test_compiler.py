import base64
import copy
import io
import json
import math
from pathlib import Path
import subprocess
import unittest

from pystitch import read_pes
from embroidery.compiler import compile_project, inside, satin_path


def project(kind="fill", rings=None, **settings):
    return {"version": 1, "name": "Compiler test", "machine": "brother-pr1x", "hoop": "100x100",
            "objects": [{"name": "Region", "kind": kind, "color": "#c99d72",
                         "rings": rings or [[[30,30],[60,30],[60,60],[30,60]]],
                         "spacing": .45, "underlay": "none", "pullCompensation": 0, **settings}]}


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
        for result in results.values():
            self.assertGreater(result["stats"]["stitches"],0)
            self.assertLessEqual(result["stats"]["maxStitch"],3.15)
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
        p.update(name="Stitch sampler",fabric="woven")
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
        import embroidery.compiler as C
        rings = [[[20,30],[35,30],[35,60],[20,60]], [[50,30],[65,30],[65,60],[50,60]]]
        paths = list(C.fill_paths(rings, 0.45, 0, 2.5, "nonzero"))
        sides = [p[0][0] < 42 for p in paths]
        switches = sum(1 for a, b in zip(sides, sides[1:]) if a != b)
        self.assertEqual(switches, 1)



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
        return {"version": 1, "name": "Fabric", "machine": "brother-pr1x", "hoop": "100x100", "fabric": fabric,
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
            self.assertLessEqual(result["stats"]["maxStitch"], 3.15, fabric)
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
