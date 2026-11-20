"""Contract tests for vulnerability inventory parsing."""
import json
import tempfile
import unittest
from pathlib import Path

from summarize_dependency_audit import summarize


class AuditParserTests(unittest.TestCase):
    def _write(self, folder, name, data):
        p = Path(folder) / name
        p.write_text(json.dumps(data), encoding="utf-8")
        return p

    def test_npm_zero_findings(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._write(directory, "npm.json", {
                "auditReportVersion": 2, "vulnerabilities": {},
                "metadata": {"vulnerabilities": {"total": 0}},
            })
            result = summarize("npm", path)
            self.assertEqual(result["packages_with_findings"], 0)

    def test_npm_severity_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._write(directory, "npm.json", {
                "vulnerabilities": {
                    "example-a": {"severity": "high"},
                    "example-b": {"severity": "critical"},
                },
                "metadata": {"vulnerabilities": {"total": 2}},
            })
            result = summarize("npm", path)
            self.assertEqual(result["severity"]["high"], 1)
            self.assertEqual(result["severity"]["critical"], 1)

    def test_npm_error_does_not_become_success(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._write(directory, "error.json", {
                "error": {"code": "EAUDITNOLOCK", "summary": "No lockfile"}
            })
            with self.assertRaises(ValueError):
                summarize("npm", path)

    def test_python_findings(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._write(directory, "py.json", {
                "dependencies": [
                    {"name": "example-lib", "version": "1", "vulns": [{"id": "TEST-1"}]},
                    {"name": "safe-lib", "version": "2", "vulns": []},
                ],
                "fixes": [],
            })
            result = summarize("python", path)
            self.assertEqual(result["findings"], 1)
            self.assertEqual(result["affected_packages"], ["example-lib"])

    def test_invalid_report_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._write(directory, "broken.json", {"metadata": {}})
            with self.assertRaises(ValueError):
                summarize("npm", path)
            with self.assertRaises(ValueError):
                summarize("python", path)


if __name__ == "__main__":
    unittest.main()
