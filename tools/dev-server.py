#!/usr/bin/env python3
"""Local preview without Docker. Stands in for the Caddy container:
serves site/ at / and the music folder at /music/ (JSON listing + seeking).

    python3 tools/dev-server.py [port] [music-dir]
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
MUSIC = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / "mp3s"


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/music/":
            return self.send_listing()
        if path.startswith("/music/"):
            return self.send_music(MUSIC / path[len("/music/"):])
        super().do_GET()

    def send_listing(self):
        # Same shape as Caddy's `file_server browse` JSON output.
        entries = []
        for entry in sorted(os.scandir(MUSIC), key=lambda e: e.name):
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "size": stat.st_size,
                "url": "./" + quote(entry.name),
                "mod_time": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                "mode": stat.st_mode,
                "is_dir": entry.is_dir(),
                "is_symlink": entry.is_symlink(),
            })
        body = json.dumps(entries).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_music(self, file):
        if MUSIC not in file.resolve().parents or not file.is_file():
            return self.send_error(404)
        size = file.stat().st_size
        start, end = 0, size - 1
        byte_range = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if byte_range and (byte_range[1] or byte_range[2]):
            if byte_range[1]:
                start = int(byte_range[1])
                end = min(int(byte_range[2]), end) if byte_range[2] else end
            else:
                start = max(size - int(byte_range[2]), 0)
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                return self.end_headers()
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(file, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                data = f.read(min(65536, left))
                if not data:
                    break
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    break
                left -= len(data)


if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(
            f"Port {PORT} is already in use. If the preview is already running, "
            f"just open http://localhost:{PORT}\n"
            f"Otherwise pick another port: python3 tools/dev-server.py {PORT + 1}"
        )
    print(f"http://localhost:{PORT}  (music: {MUSIC})  Ctrl+C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
