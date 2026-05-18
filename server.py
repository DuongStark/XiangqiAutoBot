"""
Pikafish UCI server - HTTP wrapper quanh Pikafish binary.

POST /bestmove   { "fen": "...", "movetime": 1000 }  -> { "bestmove": "h2e2", "info": "..." }
GET  /health                                          -> { "ok": true }
"""
import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent / "engine"
ENGINE_EXE = ENGINE_DIR / "pikafish.exe"
HOST = "127.0.0.1"
PORT = 8080
ALLOWED_ORIGIN = "https://play.xiangqi.com"


class Engine:
    def __init__(self, exe_path: Path):
        self.proc = subprocess.Popen(
            [str(exe_path)],
            cwd=str(exe_path.parent),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.lock = threading.Lock()
        self._send("uci")
        self._read_until("uciok")
        self._send("setoption name MultiPV value 2")
        self._send("isready")
        self._read_until("readyok")
        print(f"[engine] ready: {exe_path}")

    def _send(self, cmd: str):
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _read_until(self, marker: str, collect: bool = False):
        lines = []
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("engine closed unexpectedly")
            line = line.strip()
            if collect:
                lines.append(line)
            if line.startswith(marker) or line == marker:
                return lines if collect else line

    @staticmethod
    def _score_from_info(line: str) -> int | None:
        """Tra ve score (cp) tu dong info, mate quy thanh +/-100000."""
        parts = line.split()
        try:
            i = parts.index("score")
            kind, val = parts[i + 1], int(parts[i + 2])
            if kind == "cp":
                return val
            if kind == "mate":
                return 100000 if val > 0 else -100000
        except (ValueError, IndexError):
            return None
        return None

    @staticmethod
    def _multipv_from_info(line: str) -> int | None:
        parts = line.split()
        try:
            i = parts.index("multipv")
            return int(parts[i + 1])
        except (ValueError, IndexError):
            return None

    def bestmove(self, fen: str, movetime_ms: int = 1000, depth: int | None = None) -> dict:
        with self.lock:
            self._send("ucinewgame")
            self._send("isready")
            self._read_until("readyok")
            self._send(f"position fen {fen}")
            if depth is not None:
                self._send(f"go depth {depth}")
            else:
                self._send(f"go movetime {movetime_ms}")
            lines = self._read_until("bestmove", collect=True)
            best_line = lines[-1]
            best = best_line.split()[1] if len(best_line.split()) > 1 else None

            pv_scores: dict[int, int] = {}
            last_depth = 0
            for l in lines:
                if not l.startswith("info") or "score" not in l or "multipv" not in l:
                    continue
                pv = self._multipv_from_info(l)
                sc = self._score_from_info(l)
                if pv is not None and sc is not None:
                    pv_scores[pv] = sc
                if " depth " in l:
                    try:
                        d = int(l.split(" depth ")[1].split()[0])
                        last_depth = max(last_depth, d)
                    except (ValueError, IndexError):
                        pass

            best_score = pv_scores.get(1)
            second_score = pv_scores.get(2)
            gap = abs(best_score - second_score) if (best_score is not None and second_score is not None) else None

            return {
                "bestmove": best,
                "score": best_score,
                "second_score": second_score,
                "gap": gap,
                "depth": last_depth,
            }

    def close(self):
        try:
            self._send("quit")
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()


engine = Engine(ENGINE_EXE)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[http] {self.address_string()} - {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "engine": ENGINE_EXE.name})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/bestmove":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            fen = data.get("fen")
            if not fen:
                self._json(400, {"error": "missing fen"})
                return
            movetime = int(data.get("movetime", 1000))
            depth = data.get("depth")
            t0 = time.time()
            result = engine.bestmove(fen, movetime_ms=movetime, depth=depth)
            result["elapsed_ms"] = int((time.time() - t0) * 1000)
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[http] listening on http://{HOST}:{PORT}")
    print(f"[http] allowed origin: {ALLOWED_ORIGIN}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[http] shutting down")
    finally:
        engine.close()
        server.server_close()


if __name__ == "__main__":
    main()
