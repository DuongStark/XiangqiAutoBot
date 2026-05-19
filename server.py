"""
Pikafish UCI server - HTTP wrapper quanh Pikafish binary.

POST /bestmove   { "fen": "...", "movetime": 1000, "plies": 12 }  -> { "bestmove": "h2e2", ... }
GET  /health                                          -> { "ok": true }

Anti-repetition: server theo doi moi vi tri (board FEN) da goi engine va nuoc
da choi. Neu engine de xuat lai nuoc cu o cung vi tri cu -> dung nuoc PV2 (hoac PVk khac)
de pha vong lap.

Variety: khai cuoc / trung cuoc dung MultiPV cao, random trong cac nuoc gap nho de da dang.
"""
import json
import random
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

STARTPOS_BOARD = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR"


def fen_board_only(fen: str) -> str:
    return fen.split()[0] if fen else ""


def variety_config(plies: int) -> tuple[int, int]:
    """Tra ve (multipv, max_gap_cp) theo phase."""
    if plies < 10:
        return 5, 50
    if plies < 30:
        return 3, 30
    return 2, 0

def strength_config(strength: int, plies: int) -> tuple[int, int]:
    """Map muc Elo tap luyen sang (multipv, max_drop_cp)."""
    if strength >= 2600:
        return 4, 70
    if strength >= 2200:
        return 5, 130
    if strength >= 1800:
        return 6, 220
    if strength >= 1400:
        return 8, 350 if plies < 40 else 260
    return 10, 520 if plies < 40 else 380

def strength_weights(strength: int, candidates: list[tuple[str, int, int]]) -> list[int]:
    if strength >= 2600:
        return [max(1, 14 - (k - 1) * 5) for _, _, k in candidates]
    if strength >= 2200:
        return [max(1, 10 - (k - 1) * 3) for _, _, k in candidates]
    if strength >= 1800:
        return [max(1, 8 - (k - 1) * 2) for _, _, k in candidates]
    if strength >= 1400:
        return [max(1, 5 - (k - 1)) for _, _, k in candidates]
    return [2 if k == 1 else 3 for _, _, k in candidates]


def mistake_config(strength: int) -> tuple[float, int, int]:
    """Tra ve (rate, min_drop_cp, max_drop_cp) cho local sparring."""
    if strength >= 2600:
        return 0.03, 80, 160
    if strength >= 2200:
        return 0.08, 100, 240
    if strength >= 1800:
        return 0.16, 140, 420
    if strength >= 1400:
        return 0.28, 180, 700
    return 0.42, 220, 1100

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
        self._send("isready")
        self._read_until("readyok")
        self.played: dict[str, set[str]] = {}
        self.current_multipv = 0
        print(f"[engine] ready: {exe_path}")

    def _set_multipv(self, n: int):
        if self.current_multipv == n:
            return
        self._send(f"setoption name MultiPV value {n}")
        self._send("isready")
        self._read_until("readyok")
        self.current_multipv = n

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
    def _score_from_info(line: str):
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
    def _multipv_from_info(line: str):
        parts = line.split()
        try:
            i = parts.index("multipv")
            return int(parts[i + 1])
        except (ValueError, IndexError):
            return None

    @staticmethod
    def _pv_first_move(line: str):
        parts = line.split()
        try:
            i = parts.index("pv")
            return parts[i + 1]
        except (ValueError, IndexError):
            return None

    def bestmove(self, fen: str, movetime_ms: int = 1000, depth=None, plies: int = 0, record: bool = True, style: str = "best", strength: int = 2200) -> dict:
        with self.lock:
            board = fen_board_only(fen)

            if board == STARTPOS_BOARD and self.played:
                print("[engine] startpos detected, reset anti-repetition history")
                self.played.clear()

            if style == "sparring":
                multipv, max_gap = strength_config(strength, plies)
            else:
                multipv, max_gap = variety_config(plies)
            self._set_multipv(multipv)

            self._send("ucinewgame")
            self._send("isready")
            self._read_until("readyok")
            self._send(f"position fen {fen}")
            if depth is not None:
                self._send(f"go depth {depth}")
            else:
                self._send(f"go movetime {movetime_ms}")
            lines = self._read_until("bestmove", collect=True)
            best, pv_moves, pv_scores, last_depth = self._parse_search(lines)

            best_score = pv_scores.get(1)
            second_score = pv_scores.get(2)
            gap = abs(best_score - second_score) if (best_score is not None and second_score is not None) else None

            already_played = self.played.get(board, set())
            candidates = []
            mistake_candidates = []
            if best_score is not None and max_gap > 0:
                mistake_rate, min_drop, max_drop = mistake_config(strength)
                for k in sorted(pv_moves.keys()):
                    mv = pv_moves[k]
                    sc = pv_scores.get(k)
                    if sc is None or mv in already_played:
                        continue
                    drop = abs(best_score - sc)
                    if drop <= max_gap:
                        candidates.append((mv, sc, k))
                    elif style == "sparring" and min_drop <= drop <= max_drop:
                        mistake_candidates.append((mv, sc, k))

            chosen = best
            chosen_score = best_score
            chosen_pv = 1
            avoided = False
            randomized = False
            mistake = False

            if best in already_played:
                fallback = next(((mv, sc, k) for mv, sc, k in candidates if mv != best), None)
                if not fallback:
                    for k in sorted(pv_moves.keys()):
                        mv = pv_moves[k]
                        if mv != best and mv not in already_played:
                            fallback = (mv, pv_scores.get(k), k); break
                if fallback:
                    chosen, chosen_score, chosen_pv = fallback
                    avoided = True
                    print(f"[engine] anti-repetition: {best} da choi roi -> chon PV{chosen_pv} {chosen}")
            elif style == "sparring" and mistake_candidates and abs(best_score or 0) < 90000 and random.random() < mistake_rate:
                pick = random.choice(mistake_candidates)
                chosen, chosen_score, chosen_pv = pick
                randomized = True
                mistake = True
                drop = abs((best_score or 0) - (chosen_score or 0))
                print(f"[engine] soft-mistake: elo={strength}, plies={plies}, chon PV{chosen_pv} {chosen} (drop={drop}cp, score={chosen_score})")
            elif len(candidates) > 1:
                if style == "sparring" and abs(best_score or 0) < 90000:
                    weights = strength_weights(strength, candidates)
                    pick = random.choices(candidates, weights=weights, k=1)[0]
                else:
                    pick = random.choice(candidates)
                if pick[0] != best:
                    chosen, chosen_score, chosen_pv = pick
                    randomized = True
                    print(f"[engine] variety: phase plies={plies}, co {len(candidates)} nuoc ngang ngua, chon PV{chosen_pv} {chosen} (score={chosen_score})")

            if record and chosen and chosen != "(none)":
                self.played.setdefault(board, set()).add(chosen)
                if len(self.played) > 200:
                    self.played.clear()

            return {
                "bestmove": chosen,
                "score": chosen_score,
                "best_score": best_score,
                "second_score": second_score,
                "gap": gap,
                "depth": last_depth,
                "multipv": multipv,
                "candidates": len(candidates),
                "style": style,
                "strength": strength,
                "avoided_repetition": avoided,
                "randomized": randomized,
                "mistake": mistake,
            }

    def _parse_search(self, lines):
        best_line = lines[-1] if lines else ""
        parts = best_line.split()
        best = parts[1] if len(parts) > 1 else None

        pv_scores: dict[int, int] = {}
        pv_moves: dict[int, str] = {}
        last_depth = 0
        for l in lines:
            if not l.startswith("info") or "score" not in l or "multipv" not in l:
                continue
            pv = self._multipv_from_info(l)
            sc = self._score_from_info(l)
            mv = self._pv_first_move(l)
            if pv is not None:
                if sc is not None:
                    pv_scores[pv] = sc
                if mv is not None:
                    pv_moves[pv] = mv
            if " depth " in l:
                try:
                    d = int(l.split(" depth ")[1].split()[0])
                    last_depth = max(last_depth, d)
                except (ValueError, IndexError):
                    pass
        return best, pv_moves, pv_scores, last_depth

    def close(self):
        try:
            self._send("quit")
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()


engine = None


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
            if engine is None:
                self._json(503, {"error": "engine not ready"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            fen = data.get("fen")
            if not fen:
                self._json(400, {"error": "missing fen"})
                return
            movetime = int(data.get("movetime", 1000))
            depth = data.get("depth")
            plies = int(data.get("plies", 0))
            record = bool(data.get("record", True))
            style = data.get("style", "best")
            strength = int(data.get("strength", 2200))
            t0 = time.time()
            result = engine.bestmove(fen, movetime_ms=movetime, depth=depth, plies=plies, record=record, style=style, strength=strength)
            result["elapsed_ms"] = int((time.time() - t0) * 1000)
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e)})


def main():
    global engine
    if not ENGINE_EXE.exists():
        raise FileNotFoundError(f"{ENGINE_EXE} not found. Run: python download_engine.py")
    engine = Engine(ENGINE_EXE)
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
