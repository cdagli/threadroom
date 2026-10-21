import base64
import io
import json
from email.message import Message
import unittest
from api.export import handler


class ApiTests(unittest.TestCase):
    def invoke(self, body=b"{}", content_type="application/json", length=None, method="POST"):
        instance=handler.__new__(handler)
        instance.rfile=io.BytesIO(body)
        instance.headers=Message()
        instance.headers["Content-Length"]=str(len(body) if length is None else length)
        instance.headers["Content-Type"]=content_type
        response=[]
        instance.respond=lambda status,payload:response.extend([status,payload])
        getattr(instance,"do_"+method)()
        return response

    def test_health_check(self):
        status, data=self.invoke(method="GET")
        self.assertEqual(status,200)
        self.assertTrue(data["python"])

    def test_request_errors_are_actionable_json(self):
        for body,mime,length,status in ((b"{}","text/plain",None,415), (b"bad json","application/json",None,422),
                                        (b"{}","application/json",3_000_000,413), (b"","application/json",0,413),
                                        (b"{}","application/json",None,422)):
            actual,data=self.invoke(body,mime,length)
            self.assertEqual(actual,status)
            self.assertIsInstance(data["error"],str)

    def test_post_returns_pes_and_preview_from_same_file(self):
        p={"version":1,"machine":"brother-pr1x","hoop":"100x100","trimJump":3,"objects":[
            {"kind":"running","color":"#849984","rings":[[[30,30],[40,40]]],"spacing":.45,"underlay":"none","pullCompensation":0,"tieIn":"tack","tieOff":"tack","lockSize":1}]}
        status,data=self.invoke(json.dumps(p).encode())
        self.assertEqual(status,200)
        self.assertEqual(base64.b64decode(data["pes"])[:8],b"#PES0060")
        self.assertGreater(data["stats"]["stitches"],0)
        self.assertEqual(data["threads"][0]["color"],"#849984")

    def test_fill_settings_cross_the_api_boundary_and_invalid_values_return_422(self):
        obj={"id":"api-fill","kind":"fill","color":"#849984","rings":[[[20,20],[60,20],[60,60],[20,60]]],"spacing":.45,"underlay":"tatami","pullCompensation":.2,"tieIn":"tack","tieOff":"tack","lockSize":1,
             "fillPattern":"waves","patternParams":{"steps":12,"amplitude":1},"fillLength":4,"handStitch":3,
             "fillUnderlays":[{"angle":90,"spacing":2,"length":3,"inset":.4}],
             "gradient":{"mode":"plateau","center":.5,"width":.2,"endSpacing":2}}
        p={"version":1,"machine":"brother-pr1x","hoop":"100x100","trimJump":3,"objects":[obj]}
        status,data=self.invoke(json.dumps(p).encode())
        self.assertEqual(status,200)
        self.assertEqual(base64.b64decode(data["pes"])[:8],b"#PES0060")
        for patch in ({"fillPattern":"unknown"},{"fillLength":7},{"fillUnderlays":[{}]},{"handStitch":1.5},{"gradient":{"mode":"ramp"}},{"patternParams":{"steps":True}},{"tolerance":0}):
            bad={**p,"objects":[{**obj,**patch}]}
            status,data=self.invoke(json.dumps(bad).encode())
            self.assertEqual(status,422,patch)
            self.assertIsInstance(data["error"],str)


if __name__ == "__main__":unittest.main()
