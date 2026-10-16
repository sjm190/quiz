#!/usr/bin/env python3
"""
Servidor de desarrollo local para el web-quiz.

Replica el routing de vercel.json: sirve los archivos estaticos y enruta
/api/verify y /api/logs a los handlers de la carpeta api/.

Uso:
    python3 dev-server.py [puerto]        # por defecto 8000

Para obtener el codigo MFA valido del momento:
    python3 dev-server.py --code
"""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "api"))

import verify as verify_api  # noqa: E402
import logs as logs_api  # noqa: E402

ROUTES = {
    "/api/verify": verify_api.handler,
    "/api/logs": logs_api.handler,
}


class DevHandler(SimpleHTTPRequestHandler):
    """Sirve estaticos y delega /api/* a los handlers estilo Vercel."""

    def _delegate(self, method):
        path = self.path.split("?", 1)[0]
        vercel_handler = ROUTES.get(path.rstrip("/"))
        if vercel_handler is None:
            return False

        # Los handlers de Vercel son BaseHTTPRequestHandler: se les puede
        # llamar el metodo directamente reusando este socket/rfile/wfile.
        proxy = vercel_handler.__new__(vercel_handler)
        proxy.rfile = self.rfile
        proxy.wfile = self.wfile
        proxy.headers = self.headers
        proxy.path = self.path
        proxy.command = self.command
        proxy.request_version = self.request_version
        proxy.requestline = self.requestline
        proxy.client_address = self.client_address
        proxy.server = self.server
        proxy.connection = self.connection
        proxy.close_connection = True
        proxy.log_request = lambda *a, **k: None

        fn = getattr(proxy, method, None)
        if fn is None:
            self.send_error(405, "Method not allowed")
            return True
        try:
            fn()
        except Exception as exc:  # pragma: no cover - solo dev
            print(f"[DEV ERROR] {path}: {exc}", file=sys.stderr)
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode())
        return True

    def do_GET(self):
        if not self._delegate("do_GET"):
            super().do_GET()

    def do_POST(self):
        if not self._delegate("do_POST"):
            self.send_error(405, "Method not allowed")

    def do_OPTIONS(self):
        if not self._delegate("do_OPTIONS"):
            self.send_error(405, "Method not allowed")

    def end_headers(self):
        # Evita cache molesto durante el desarrollo.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    if "--code" in sys.argv:
        print(verify_api.generate_totp(verify_api.TOTP_SECRET))
        return

    port = 8000
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)

    handler_cls = partial(DevHandler, directory=BASE_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler_cls)
    code = verify_api.generate_totp(verify_api.TOTP_SECRET)
    print(f"Quiz local -> http://127.0.0.1:{port}")
    print(f"Codigo MFA actual (valido ~30s): {code}")
    print("Ctrl+C para detener.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.server_close()


if __name__ == "__main__":
    main()
