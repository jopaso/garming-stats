#!/usr/bin/env python3
from __future__ import annotations
"""
Serve the built SPA from dist/ and live activity JSON from public/data/.

Usage:
    python serve.py                 # http://0.0.0.0:8787
    PORT=9000 python serve.py

/data/* is read from public/data/ so a sync that writes new JSON is visible
without rebuilding the frontend image.
"""

import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
DATA_DIR = ROOT / "public" / "data"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8787"))


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith("/data/"):
            self._serve_data(path[len("/data/") :])
            return

        self._serve_spa(path)

    def _serve_data(self, relative: str):
        # Prevent path traversal outside DATA_DIR
        candidate = (DATA_DIR / relative).resolve()
        try:
            candidate.relative_to(DATA_DIR.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not candidate.is_file():
            self.send_error(404, "Not found")
            return

        self._send_file(candidate, cache_control="no-store")

    def _serve_spa(self, path: str):
        if path in ("", "/"):
            relative = "index.html"
        else:
            relative = path.lstrip("/")

        candidate = (DIST_DIR / relative).resolve()
        try:
            candidate.relative_to(DIST_DIR.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if candidate.is_file():
            self._send_file(candidate)
            return

        # SPA fallback: client-side routes
        index = DIST_DIR / "index.html"
        if index.is_file():
            self._send_file(index)
            return

        self.send_error(404, "Frontend not built. Run npm run build.")

    def _send_file(self, path: Path, cache_control: str | None = None):
        content_type, _ = mimetypes.guess_type(str(path))
        if content_type is None:
            content_type = "application/octet-stream"
        if path.suffix == ".json":
            content_type = "application/json; charset=utf-8"

        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if cache_control:
            self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args):
        # Quieter logs: skip successful static GETs noise in production
        message = format % args
        if " 200 " in message:
            return
        super().log_message(format, *args)


def main():
    if not DIST_DIR.is_dir():
        print(f"WARNING: {DIST_DIR} missing. Build the frontend with: npm run build")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving on http://{HOST}:{PORT}")
    print(f"  SPA  → {DIST_DIR}")
    print(f"  data → {DATA_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
