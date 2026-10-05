"""Vercel Python Function and the identical local-development HTTP handler."""
from http.server import BaseHTTPRequestHandler
import json
from embroidery.compiler import compile_project

MAX_BODY = 2 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200, {"ok": True, "engine": "threadroom-poc+pystitch", "python": True})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                self.respond(413, {"error": "Choose a project smaller than 2 MB."})
                return
            if self.headers.get_content_type() != "application/json":
                self.respond(415, {"error": "Send an application/json project."})
                return
            project = json.loads(self.rfile.read(length))
            result = compile_project(project)
            self.respond(200, result)
        except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
            import sys
            exc = sys.exc_info()[1]
            self.respond(422, {"error": str(exc) if isinstance(exc, ValueError) else "This project contains invalid geometry or settings."})
        except Exception:
            import traceback
            traceback.print_exc()
            self.respond(500, {"error": "The embroidery engine could not export this design."})
