import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace
from native_smoke import run, window_visible

class NativeProbeTests(unittest.TestCase):
    @patch('native_smoke.subprocess.run')
    def test_windows_requires_our_process_handle(self, command):
        for code, text, expected in [(0, '42\n', True), (0, '0', False), (1, '42', False), (0, 'unknown', False)]:
            command.return_value = SimpleNamespace(returncode=code, stdout=text)
            self.assertEqual(window_visible('Windows', 123), expected)
            self.assertIn('-Id 123 ', command.call_args[0][0][-1])
    @patch('native_smoke.subprocess.run')
    def test_linux_requires_a_native_window(self, command):
        for code, text, expected in [(0, '0x123 "sequelx": app', True), (0, 'root window', False), (1, '"sequelx"', False)]:
            command.return_value = SimpleNamespace(returncode=code, stdout=text)
            self.assertEqual(window_visible('Linux', 123), expected)

class NativeRunTests(unittest.TestCase):
    def test_startup_report_survives_deferred_cleanup_without_hiding_exit_failures(self):
        temporary_directory = tempfile.TemporaryDirectory
        for exit_code in [None, 7]:
            with self.subTest(exit_code=exit_code), temporary_directory() as folder:
                root = Path(folder)
                binary, report = root / 'fixture.exe', root / 'evidence.json'
                binary.write_bytes(b'not executed; Popen is mocked')
                process = Mock(pid=123)
                process.poll.return_value = exit_code
                with patch('native_smoke.platform.system', return_value='Windows'), \
                     patch('native_smoke.subprocess.Popen', return_value=process) as launch, \
                     patch('native_smoke.subprocess.run') as command, \
                     patch('native_smoke.window_visible', return_value=True), \
                     patch('native_smoke.time.sleep'), \
                     patch('native_smoke.tempfile.TemporaryDirectory', wraps=temporary_directory) as isolated:
                    if exit_code is None:
                        run(binary, report)
                        self.assertEqual(command.call_args[0][0], ['taskkill', '/PID', '123', '/T', '/F'])
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'exited early'):
                            run(binary, report)
                    self.assertTrue(isolated.call_args.kwargs['ignore_cleanup_errors'])
                    self.assertNotEqual(launch.call_args.kwargs['env']['APPDATA'], str(root))
                evidence = json.loads(report.read_text())
                self.assertEqual(evidence['status'], 'passed' if exit_code is None else 'failed')
                self.assertFalse(evidence['databaseQA'])
                self.assertFalse(evidence['fullInstallQA'])

if __name__ == '__main__':
    unittest.main()
