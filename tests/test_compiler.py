import base64
import copy
import io
import json
import math
from pathlib import Path
import unittest

from pystitch import read_pes
from embroidery.compiler import compile_project, inside, satin_path


def project(kind="fill", rings=None, **settings):
    return {"version": 1, "name": "Compiler test", "machine": "brother-pr1x", "hoop": "100x100",
            "objects": [{"name": "Region", "kind": kind, "color": "#c99d72",
                         "rings": rings or [[[30,30],[60,30],[60,60],[30,60]]], **settings}]}


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
            result = compile_project(project(rings=rings, angle=angle, underlay=True))
            for c in result["commands"]:
                if c["type"] != "stitch":
                    continue
                for t in (0.2, 0.5, 0.8):
                    x=c["fromX"]+(c["x"]-c["fromX"])*t
                    y=c["fromY"]+(c["y"]-c["fromY"])*t
                    self.assertFalse(40.12<x<59.88 and 40.12<y<59.88, (angle,c))

    def test_separate_paths_jump_and_colours_follow_object_order(self):
        p=project("running", [[[20,20],[30,20]],[[70,70],[80,70]]])
        p["objects"].append({"kind":"running","color":"#d8949b","rings":[[[50,50],[55,50]]]})
        result=compile_project(p)
        self.assertEqual(result["stats"]["colorChanges"],1)
        self.assertEqual([t["color"] for t in result["threads"]],["#c99d72","#d8949b"])
        self.assertGreaterEqual(result["stats"]["jumps"],3)
        self.assertLessEqual(result["stats"]["maxStitch"],3.1)

    def test_bean_and_satin_generate_real_stitches(self):
        line=[[[30,40],[40,45],[60,40]]]
        running=compile_project(project("running",line))
        bean=compile_project(project("bean",line))
        satin=compile_project(project("satin",line,satinWidth=3,underlay=True))
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
        for mode in ("center","edge","zigzag"):
            result=compile_project(project("satin",line,satinWidth=3,underlay=True,underlayType=mode))
            self.assertGreater(result["stats"]["stitches"],base["stats"]["stitches"])
            variants.append(result["commands"])
        self.assertNotEqual(variants[0],variants[1])
        self.assertNotEqual(variants[1],variants[2])
        for mode in ("edge","tatami"):
            result=compile_project(project(underlay=True,underlayType=mode))
            self.assertGreater(result["stats"]["stitches"],compile_project(project())["stats"]["stitches"])
        for kind,mode in (("fill","zigzag"),("satin","tatami"),("running","edge"),("satin","unknown")):
            with self.assertRaises(ValueError):compile_project(project(kind,underlay=True,underlayType=mode))

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
        for patch in ({"spacing":0},{"spacing":math.nan},{"length":math.inf},{"color":"red"},{"kind":"unknown"},{"rings":[[[30,30],[30,30]]]}):
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
        p["objects"]=[]
        for i,kind in enumerate(("running","bean","backstitch","satin","zigzag","e-stitch","underlay","manual")):
            p["objects"].append({"id":kind,"name":kind,"kind":kind,"color":"#c99d72","rings":[[[12,12+i*8],[27,14+i*8],[42,12+i*8]]],"spacing":1.5 if kind in ("zigzag","e-stitch") else .45,"length":2.5,"angle":0,"satinWidth":2,"underlay":False})
        for kind,y in (("fill",20),("cross",52)):
            p["objects"].append({"id":kind,"name":kind,"kind":kind,"color":"#849984","rings":[[[58,y],[84,y],[84,y+20],[58,y+20]]],"spacing":1.5 if kind=="cross" else .45,"length":2.5,"angle":0,"satinWidth":2,"underlay":True,"underlayType":"edge"})
        result=compile_project(p)
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
        result = compile_project(project(rings=[[[25,25],[75,25],[75,75],[25,75]], hole], angle=0, fillRule="nonzero", underlay=True, underlayType="edge"))
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

