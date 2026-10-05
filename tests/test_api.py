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
        p={"version":1,"machine":"brother-pr1x","hoop":"100x100","objects":[
            {"kind":"running","color":"#849984","rings":[[[30,30],[40,40]]],"spacing":.45,"underlay":"none","pullCompensation":0}]}
        status,data=self.invoke(json.dumps(p).encode())
        self.assertEqual(status,200)
        self.assertTrue(data["pes"].startswith("I1BFUzAwNjA"))
        self.assertGreater(data["stats"]["stitches"],0)
        self.assertEqual(data["threads"][0]["color"],"#849984")


if __name__ == "__main__":unittest.main()
