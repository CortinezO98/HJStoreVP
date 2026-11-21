"""Tests sin red ni base de datos para el checker pasivo de Fase E."""
import unittest
from unittest.mock import patch

import phase_e_smoke as smoke


class PhaseESmokeTests(unittest.TestCase):
    def test_rejects_remote_unsafe_and_credentialed_origins(self):
        for url in (
            "https://localhost:8000", "http://example.com:8000",
            "http://127.0.0.1:8000@evil.example:8000",
            "http://127.0.0.1:8000/private", "http://localhost:8000?x=1",
            "http://127.0.0.1", "file:///etc/passwd",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                smoke.local_url(url)

    def test_validates_loopback_origin(self):
        self.assertEqual(smoke.local_url("http://127.0.0.1:8000/"), "http://127.0.0.1:8000")
        self.assertEqual(smoke.local_url("http://localhost:5173"), "http://localhost:5173")

    def test_all_targets_are_passive(self):
        self.assertEqual({c.target for c in smoke.CHECKS}, {"api", "store", "admin"})
        self.assertTrue(all(c.path.startswith("/") for c in smoke.CHECKS))
        self.assertTrue(any(c.path == "/checkout" for c in smoke.CHECKS))

    def test_error_redacts_exception_message(self):
        origins = {"api": "http://localhost:8000", "store": "http://localhost:5173",
                   "admin": "http://localhost:5174"}
        with patch.object(smoke, "fetch_local", side_effect=OSError("private response")):
            results = smoke.run_checks(origins)
        self.assertTrue(all(not item["ok"] for item in results))
        self.assertTrue(all("private response" not in item["detail"] for item in results))

    def test_mismatched_responses_fail_closed(self):
        origins = {"api": "http://localhost:8000", "store": "http://localhost:5173",
                   "admin": "http://localhost:5174"}
        with patch.object(smoke, "fetch_local",
                          return_value=(200, {"Content-Type": "text/html"}, b"<div>")):
            results = smoke.run_checks(origins)
        self.assertEqual(len(results), len(smoke.CHECKS))
        self.assertFalse(all(item["ok"] for item in results))


if __name__ == "__main__":
    unittest.main()
