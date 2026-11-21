"""E.5.4: pruebas offline. No utilizan Docker, HTTP real ni datos comerciales."""
from datetime import datetime, timezone
import importlib.util
import io
import json
from pathlib import Path
import sys
from unittest.mock import Mock
from urllib.error import HTTPError

import pytest

SCRIPT = Path(__file__).with_name("operations_monitor.py")
spec = importlib.util.spec_from_file_location("operations_monitor", SCRIPT)
monitor = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = monitor
spec.loader.exec_module(monitor)


def test_container_healthy(monkeypatch):
    monkeypatch.setattr(monitor.subprocess, "run", lambda *args, **kw:
        Mock(returncode=0, stdout=json.dumps({"Running": True, "Health": {"Status": "healthy"}})))
    status = monitor.container_state("hjstorevp_db")
    assert status["status"] == "ok"
    assert status["code"] == "CONTAINER_RUNNING"


@pytest.mark.parametrize("state,expected", [
    ({"Running": False}, "critical"),
    ({"Running": True, "Health": {"Status": "starting"}}, "warning"),
    ({"Running": True, "Health": {"Status": "unhealthy"}}, "critical"),
])
def test_container_not_healthy(monkeypatch, state, expected):
    monkeypatch.setattr(monitor.subprocess, "run", lambda *args, **kw:
        Mock(returncode=0, stdout=json.dumps(state)))
    assert monitor.container_state("hjstorevp_backend")["status"] == expected


def test_container_inspect_error_does_not_leak_stderr(monkeypatch):
    monkeypatch.setattr(monitor.subprocess, "run", lambda *args, **kw:
        Mock(returncode=1, stdout="", stderr="password=SENTINEL"))
    result = monitor.container_state("hjstorevp_backend")
    assert result["status"] == "critical"
    assert "SENTINEL" not in repr(result)


class FakeResponse:
    status = 200
    headers = {"Content-Type": "application/json"}

    def __init__(self, body=b'{"status":"ok"}', content_type=None):
        self.body = body
        if content_type:
            self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def read(self, n):
        return self.body[:n]


def test_api_health_requires_expected_json(monkeypatch):
    class Opener:
        def open(self, *_args, **_kwargs):
            return FakeResponse()
    monkeypatch.setattr(monitor, "build_opener", lambda *_: Opener())
    assert monitor.http_health(monitor.TARGETS["api"], 1500, 2)["status"] == "ok"

    class BadOpener:
        def open(self, *_args, **_kwargs):
            return FakeResponse(body=b"<html>wrong</html>", content_type="text/html")
    monkeypatch.setattr(monitor, "build_opener", lambda *_: BadOpener())
    assert monitor.http_health(monitor.TARGETS["api"], 1500, 2)["code"] == "API_HEALTH_BODY_INVALID"


def test_http_500_is_critical_and_no_redirect(monkeypatch):
    class Opener:
        def open(self, request, **_):
            assert request.get_method() == "GET"
            raise HTTPError(request.full_url, 500, "SENTINEL", {}, io.BytesIO(b"SECRET"))
    monkeypatch.setattr(monitor, "build_opener", lambda *_: Opener())
    output = monitor.http_health(monitor.TARGETS["api"], 1500, 2)
    assert output["code"] == "HTTP_ERROR_STATUS"
    assert "SENTINEL" not in repr(output)
    assert "SECRET" not in repr(output)


def test_latency_warning(monkeypatch):
    class Opener:
        def open(self, *_args, **_kwargs):
            return FakeResponse(body=b"<html></html>", content_type="text/html")
    monkeypatch.setattr(monitor, "build_opener", lambda *_: Opener())
    ticks = iter((1.0, 3.0))
    monkeypatch.setattr(monitor, "monotonic", lambda: next(ticks))
    response = monitor.http_health(monitor.TARGETS["store"], 1500, 4)
    assert response["code"] == "HTTP_SLOW"
    assert response["metrics"]["latency_ms"] == 2000


def test_backup_states(tmp_path):
    now = datetime.now(timezone.utc).timestamp()
    assert monitor.backup_state(tmp_path, "db", 48, now)["code"] == "BACKUP_NOT_FOUND"
    db = tmp_path / "hjstorevp_db_fixture.sql.gz"
    db.write_bytes(b"fixture")
    assert monitor.backup_state(tmp_path, "db", 48, now)["code"] == "BACKUP_INCOMPLETE"
    (tmp_path / (db.name + ".sha256")).write_text("dummy", encoding="utf-8")
    assert monitor.backup_state(tmp_path, "db", 48, now)["code"] == "BACKUP_PRESENT"
    assert monitor.backup_state(tmp_path, "db", 48, now + 49 * 3600)["code"] == "BACKUP_STALE"


def test_collect_status_and_no_sensitive_output(monkeypatch, tmp_path):
    monkeypatch.setattr(monitor, "container_state", lambda *_: monitor.result("ok", "CONTAINER_RUNNING"))
    monkeypatch.setattr(monitor, "http_health", lambda *_: monitor.result("ok", "HTTP_RESPONSIVE", latency_ms=10))
    monkeypatch.setattr(monitor, "disk_state", lambda *_: monitor.result("ok", "DISK_FREE", free_percent=55))
    monkeypatch.setattr(monitor, "backup_state", lambda *_: monitor.result("warning", "BACKUP_NOT_FOUND"))
    snapshot = monitor.collect(root=tmp_path, backups=tmp_path, now=1700000000)
    assert snapshot["overall"] == "warning"
    assert set(snapshot["warning_checks"]) == {"backup:db", "backup:uploads"}
    assert not snapshot["critical_checks"]
    assert "mysql+pymysql" not in json.dumps(snapshot)


def test_cli_exit_codes(monkeypatch, capsys):
    for state, expected in (("ok", 0), ("warning", 1), ("critical", 2)):
        monkeypatch.setattr(monitor, "collect", lambda *args, _state=state, **kw: {
            "overall": _state, "checks": {}, "critical_checks": [], "warning_checks": [],
        })
        assert monitor.main(["--json"]) == expected
        assert json.loads(capsys.readouterr().out)["overall"] == state


def test_fixed_targets_are_loopback_only():
    from urllib.parse import urlsplit
    for url in monitor.TARGETS.values():
        p = urlsplit(url)
        assert p.scheme == "http"
        assert p.hostname == "127.0.0.1"
        assert p.username is None and p.password is None


def test_invalid_thresholds_rejected():
    with pytest.raises(SystemExit):
        monitor.main(["--warning-free-percent", "5", "--critical-free-percent", "10"])
