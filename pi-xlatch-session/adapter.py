#!/usr/bin/python3
"""
xlatch -> pi session adapter.

Reads one xlatch JSON input document on stdin, forwards it to ONE pi session
over a private Unix domain socket, and writes one JSON result on stdout.

The target session is bound by --socket, which comes from the registered
manifest's fixed args. Shared content can never select a different session:
any "socket"/"session"/"slot" field in the input payload is ignored.

Shared files are written to the --dir directory (also fixed in the manifest,
never supplied by the phone) and only their resulting PATH is sent to the
session, so large payloads never cross the socket or enter the transcript.

Exit code is always 0 with a JSON result on stdout, so the phone shows a
readable message instead of an opaque failure.
"""

import base64
import binascii
import errno
import json
import os
import re
import socket
import sys

CONNECT_TIMEOUT_S = 5.0
REPLY_TIMEOUT_S = 15.0
MAX_REPLY_BYTES = 64 * 1024
MAX_FILE_BYTES = 8 * 1024 * 1024  # xlatch caps shared files at 4 MiB; stay tolerant
SAFE_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def emit(doc):
    sys.stdout.write(json.dumps(doc))
    sys.stdout.flush()
    raise SystemExit(0)


def parse_args(argv):
    # Fixed manifest args only: --socket <abs path> [--dir <abs path>]
    opts = {"socket": None, "dir": None}
    rest = argv[1:]
    while rest:
        flag = rest.pop(0)
        key = flag[2:] if flag.startswith("--") else None
        if key not in opts or not rest:
            emit({"ok": False, "text": "pi bridge: adapter misconfigured (bad arguments)."})
        opts[key] = rest.pop(0)
    if not opts["socket"] or not opts["socket"].startswith("/"):
        emit({"ok": False, "text": "pi bridge: adapter misconfigured (socket path must be absolute)."})
    if opts["dir"] is not None and not opts["dir"].startswith("/"):
        emit({"ok": False, "text": "pi bridge: adapter misconfigured (dir must be absolute)."})
    return opts


def safe_basename(name):
    """Derive a filename the phone cannot use to escape the destination dir."""
    base = os.path.basename(str(name or "").replace("\\", "/").strip())
    base = SAFE_CHARS.sub("_", base).lstrip(".")
    if not base or base in (".", ".."):
        base = "shared"
    stem, ext = os.path.splitext(base)
    return (stem[:80] or "shared") + ext[:16]


def save_file(directory, name, data_b64):
    try:
        blob = base64.b64decode(data_b64 or "", validate=True)
    except (binascii.Error, ValueError):
        emit({"ok": False, "text": "pi bridge: shared file was not valid base64."})
    if not blob:
        emit({"ok": False, "text": "pi bridge: shared file was empty."})
    if len(blob) > MAX_FILE_BYTES:
        emit({"ok": False, "text": "pi bridge: shared file is too large."})

    try:
        os.makedirs(directory, mode=0o700, exist_ok=True)
    except OSError:
        emit({"ok": False, "text": "pi bridge: cannot create the destination directory."})

    base = safe_basename(name)
    stem, ext = os.path.splitext(base)
    # Never overwrite an existing file; O_EXCL also closes the race.
    for attempt in range(500):
        candidate = os.path.join(directory, base if attempt == 0 else f"{stem}-{attempt}{ext}")
        try:
            fd = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            continue
        except OSError as exc:
            if exc.errno == errno.EACCES:
                emit({"ok": False, "text": "pi bridge: permission denied writing the shared file."})
            emit({"ok": False, "text": "pi bridge: could not write the shared file."})
        with os.fdopen(fd, "wb") as fh:
            fh.write(blob)
        return candidate, len(blob)
    emit({"ok": False, "text": "pi bridge: too many name collisions in the destination directory."})


def read_input():
    raw = sys.stdin.buffer.read()
    if not raw:
        emit({"ok": False, "text": "pi bridge: no input received."})
    try:
        doc = json.loads(raw.decode("utf-8"))
    except Exception:
        emit({"ok": False, "text": "pi bridge: input was not valid JSON."})
    if not isinstance(doc, dict):
        emit({"ok": False, "text": "pi bridge: input must be a JSON object."})
    return doc


def build_payload(doc, directory):
    """Keep only the fields the session is allowed to see.

    A file may arrive with accompanying text (a note the user typed in the
    app). Both are forwarded; the file is never dropped in favour of the note.
    """
    mime = doc.get("mime_type")
    text = doc.get("text")
    file_obj = doc.get("file")

    note = text.strip() if isinstance(text, str) and text.strip() else None
    payload = {"mime_type": mime if isinstance(mime, str) else None}

    if isinstance(file_obj, dict):
        if not directory:
            emit({"ok": False, "text": "pi bridge: this action is not configured to accept files."})
        path, size = save_file(directory, file_obj.get("name"), file_obj.get("data_base64"))
        fmime = file_obj.get("mime_type")
        payload["kind"] = "file"
        payload["path"] = path
        payload["name"] = os.path.basename(path)
        payload["bytes"] = size
        payload["file_mime_type"] = fmime if isinstance(fmime, str) else mime
        payload["note"] = note
        return payload

    if note:
        payload["kind"] = "text"
        payload["text"] = note
        return payload

    emit({"ok": False, "text": "pi bridge: nothing shareable in input (expected text or file)."})


def main():
    opts = parse_args(sys.argv)
    sock_path = opts["socket"]
    doc = read_input()

    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(CONNECT_TIMEOUT_S)
        s.connect(sock_path)
    except (FileNotFoundError, ConnectionRefusedError):
        emit({
            "ok": False,
            "text": "pi session is not connected. In the target pi session run /xlatch and choose Connect.",
        })
    except PermissionError:
        emit({"ok": False, "text": "pi bridge: permission denied on the session socket."})
    except OSError as exc:
        emit({"ok": False, "text": f"pi bridge: cannot reach the session socket ({exc.__class__.__name__})."})

    # Only persist the file once a session is known to be listening.
    payload = build_payload(doc, opts["dir"])

    try:
        s.settimeout(REPLY_TIMEOUT_S)
        s.sendall((json.dumps(payload) + "\n").encode("utf-8"))

        chunks = bytearray()
        while b"\n" not in chunks and len(chunks) < MAX_REPLY_BYTES:
            chunk = s.recv(4096)
            if not chunk:
                break
            chunks.extend(chunk)
    except socket.timeout:
        emit({"ok": False, "text": "pi session did not acknowledge in time."})
    except OSError as exc:
        emit({"ok": False, "text": f"pi bridge: transport error ({exc.__class__.__name__})."})
    finally:
        try:
            s.close()
        except OSError:
            pass

    line = bytes(chunks).split(b"\n", 1)[0].decode("utf-8", "replace").strip()
    if not line:
        emit({"ok": False, "text": "pi session closed the connection without acknowledging."})

    try:
        reply = json.loads(line)
    except Exception:
        emit({"ok": False, "text": "pi session sent a malformed acknowledgment."})

    if not isinstance(reply, dict) or not reply.get("ok"):
        detail = ""
        if isinstance(reply, dict):
            detail = str(reply.get("error") or reply.get("text") or "")
        emit({"ok": False, "text": detail or "pi session rejected the content."})

    emit({
        "ok": True,
        "text": str(reply.get("text") or "Delivered to pi."),
        "session": str(reply.get("session") or ""),
        "delivery": str(reply.get("delivery") or ""),
    })


if __name__ == "__main__":
    main()
