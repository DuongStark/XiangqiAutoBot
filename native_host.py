import json
import os
import struct
import subprocess
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "server.py"
PYTHONW = Path(sys.executable).with_name("pythonw.exe")
PYTHON = PYTHONW if PYTHONW.exists() else Path(sys.executable)
HEALTH_URL = "http://127.0.0.1:8080/health"


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    return json.loads(data.decode("utf-8"))


def write_message(payload):
    data = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def server_health():
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1.5) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def start_server():
    health = server_health()
    if health.get("ok"):
        return {"ok": True, "alreadyRunning": True, "health": health}

    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    subprocess.Popen(
        [str(PYTHON), str(SERVER)],
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
        startupinfo=startupinfo,
    )

    for _ in range(20):
        health = server_health()
        if health.get("ok"):
            return {"ok": True, "alreadyRunning": False, "health": health}

    return {"ok": False, "error": "server did not become healthy"}


def handle(msg):
    msg_type = msg.get("type")
    if msg_type == "HEALTH":
        health = server_health()
        return {"ok": bool(health.get("ok")), "health": health}
    if msg_type == "START_SERVER":
        return start_server()
    return {"ok": False, "error": f"unknown message type: {msg_type}"}


def main():
    while True:
        msg = read_message()
        if msg is None:
            return
        write_message(handle(msg))


if __name__ == "__main__":
    main()
