"""CI-only native startup smoke test. Does not connect, run SQL or use a vault."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import tempfile
import time


def window_visible(system, pid):
    if system == 'Windows':
        result = subprocess.run(['powershell.exe', '-NoProfile', '-Command',
            f'(Get-Process -Id {int(pid)} -ErrorAction Stop).MainWindowHandle'],
            capture_output=True, text=True, timeout=10)
        return result.returncode == 0 and result.stdout.strip().isdigit() and int(result.stdout.strip()) > 0
    result = subprocess.run(['xwininfo', '-root', '-tree'], capture_output=True, text=True, timeout=10)
    return result.returncode == 0 and '"sequelx"' in result.stdout.lower()


def run(binary, report):
    system = platform.system()
    if system not in ('Windows', 'Linux'):
        raise RuntimeError('This CI smoke test supports Windows/Linux; macOS needs native manual QA.')
    binary = Path(binary).resolve(strict=True)
    evidence = {'platform': system, 'architecture': platform.machine(),
                'sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
                'status': 'failed', 'databaseQA': False, 'fullInstallQA': False}
    process = None
    # shortcut: WebView2 may retain metrics locks; the ephemeral CI runner removes leftovers.
    with tempfile.TemporaryDirectory(prefix='sequelx-native-qa-', ignore_cleanup_errors=True) as folder:
        root = Path(folder)
        env = os.environ.copy()
        for key, child in [('HOME', 'home'), ('USERPROFILE', 'home'), ('APPDATA', 'roaming'),
                           ('LOCALAPPDATA', 'local'), ('XDG_CONFIG_HOME', 'config'),
                           ('XDG_CACHE_HOME', 'cache'), ('XDG_DATA_HOME', 'data')]:
            path = root / child
            path.mkdir(exist_ok=True)
            env[key] = str(path)
        evidence['freshConfig'] = True
        with (root / 'startup.log').open('wb') as log:
            try:
                process = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=log,
                                           start_new_session=system != 'Windows')
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError(f'Native app exited early: {process.returncode}')
                    if window_visible(system, process.pid):
                        evidence['nativeWindowObserved'] = True
                        time.sleep(3)
                        if process.poll() is not None:
                            raise RuntimeError('App exited after showing its native window')
                        evidence['status'] = 'passed'
                        break
                    time.sleep(0.5)
                else:
                    raise RuntimeError('No native app window observed within 30 seconds')
            except Exception as error:
                evidence['error'] = str(error)
            finally:
                if process is not None and process.poll() is None:
                    if system == 'Windows':
                        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, timeout=15)
                    else:
                        os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
        if evidence['status'] != 'passed':
            evidence['startupLog'] = (root / 'startup.log').read_text(errors='replace')[-4000:]
    report = Path(report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(evidence, indent=2) + '\n')
    if evidence['status'] != 'passed':
        raise RuntimeError(evidence.get('error', 'native startup failed'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('binary')
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    run(args.binary, args.report)
