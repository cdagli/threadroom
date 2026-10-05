from http.server import ThreadingHTTPServer
import json
import os
from api.export import handler

if __name__ == "__main__":
    # Port 0 asks the OS for an available port. The launcher forwards that exact
    # port to Next.js, so an unrelated server on 8000 cannot receive our requests.
    port = int(os.environ.get("THREADROOM_API_PORT", "0"))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(json.dumps({"threadroomReady": True, "port": server.server_port}), flush=True)
    server.serve_forever()
