import unittest
from unittest.mock import patch
from types import SimpleNamespace
from native_smoke import window_visible

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

if __name__ == '__main__':
    unittest.main()
