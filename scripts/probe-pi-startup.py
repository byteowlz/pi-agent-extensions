#!/usr/bin/env python3
"""Bounded isolated PTY startup probe. Synthetic history only; never reads user config."""
import argparse
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pi', required=True, help='Absolute path to the Pi launcher')
parser.add_argument('--mode', choices=['regular', 'fullscreen'], default='fullscreen')
parser.add_argument('--messages', type=int, default=0, help='Synthetic resumed messages (0 starts fresh)')
parser.add_argument('--extension', action='append', default=[], help='Explicit trusted extension path; repeatable')
parser.add_argument('--timeout', type=float, default=12)
parser.add_argument('--output', help='Optional ANSI evidence file; contains synthetic data only')
args = parser.parse_args()
if not 0 <= args.messages <= 10000 or not 3 <= args.timeout <= 60:
    parser.error('messages must be 0..10000 and timeout 3..60 seconds')

with tempfile.TemporaryDirectory(prefix='pi-startup-proof-') as home:
    root = Path(home)
    agent = root / '.pi/agent'
    agent.mkdir(parents=True)
    (agent / 'settings.json').write_text(json.dumps({'tuiMode': args.mode}))
    (root / 'history-search.json').write_text(json.dumps({'sessionsDir': str(root / 'sessions'), 'indexOnStart': True}))
    probe = root / 'probe.ts'
    probe.write_text('export default function(pi){pi.registerCommand("startup-probe",{handler:async(_,ctx)=>ctx.ui.notify("STARTUP_ACK","info")});}')
    command = [os.path.abspath(args.pi), '--no-extensions', '-e', str(probe)]
    if args.messages:
        session = root / 'synthetic.jsonl'
        with session.open('w') as stream:
            stream.write(json.dumps({'type': 'session', 'version': 3, 'id': 'synthetic-startup', 'timestamp': '2026-01-01T00:00:00.000Z', 'cwd': home}) + '\n')
            for i in range(args.messages):
                stream.write(json.dumps({'type': 'message', 'id': str(i), 'parentId': str(i-1) if i else None, 'timestamp': '2026-01-01T00:00:00.000Z', 'message': {'role': 'user', 'content': [{'type': 'text', 'text': ('synthetic startup history ' + str(i) + ' ') * 70}], 'timestamp': 1767225600000}}) + '\n')
        command += ['--session', str(session)]
    else:
        command += ['--no-session']
    for extension in args.extension:
        command += ['-e', os.path.abspath(extension)]
    env = {'HOME': home, 'PI_CODING_AGENT_DIR': str(agent), 'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'TERM': 'xterm-256color', 'LANG': 'C.UTF-8'}
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 120, 0, 0))
    process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, cwd=home, env=env, start_new_session=True)
    os.close(slave)
    started = time.monotonic()
    output = b''
    sent = 0
    ack = None
    try:
        while time.monotonic() - started < args.timeout:
            if time.monotonic() - started > (sent + 1) * 2:
                os.write(master, b'\x15/startup-probe\r')
                sent += 1
            if select.select([master], [], [], 0.05)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                output += chunk
                if len(output) > 16 * 1024 * 1024:
                    break
                for request, reply in [(b'\x1b[6n', b'\x1b[1;1R'), (b'\x1b[c', b'\x1b[?1;2c'), (b'\x1b[?u', b'\x1b[?1u')]:
                    if request in chunk:
                        os.write(master, reply)
                if b'STARTUP_ACK' in output:
                    ack = round(time.monotonic() - started, 3)
                    break
            if process.poll() is not None:
                break
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        os.close(master)
    if args.output:
        Path(args.output).write_bytes(output)
    print(json.dumps({'mode': args.mode, 'syntheticMessages': args.messages, 'extensions': args.extension, 'ackSeconds': ack, 'capturedBytes': len(output), 'exitCodeAfterCleanup': process.returncode, 'responsive': ack is not None}))
    raise SystemExit(0 if ack is not None else 1)
