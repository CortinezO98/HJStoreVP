"""E.5.5: historial y persistencia, pruebas offline sin Docker ni HTTP."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys

import pytest

SCRIPT = Path(__file__).with_name("operations_history.py")
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location("operations_history", SCRIPT)
history = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = history
spec.loader.exec_module(history)


def sample(status="ok", date=None, secret=False):
    at = (date or datetime.now(timezone.utc)).isoformat()
    checks = {key: {"status": status, "code": "UNTRUSTED_SECRET",
                    "metrics": {"latency_ms": 120, "token": "SHOULD_NOT_APPEAR"}}
              for key in history.KNOWN_CHECKS}
    data = {"environment": "local-development-only", "checked_at_utc": at,
            "checks": checks}
    if secret:
        data["secret"] = "SENTINEL"
    return data


def test_sanitizer_disallows_unknown_fields_and_secrets():
    clean = history.clean_snapshot(sample(secret=True))
    output = json.dumps(clean)
    assert "SENTINEL" not in output
    assert "SHOULD_NOT_APPEAR" not in output
    assert "UNTRUSTED_SECRET" not in output
    assert len(clean["checks"]) == 11


def test_sanitizer_rejects_incomplete_and_external():
    fixture = sample()
    fixture["environment"] = "production"
    with pytest.raises(ValueError):
        history.clean_snapshot(fixture)
    fixture = sample()
    fixture["checks"].pop("http:api")
    with pytest.raises(ValueError, match="incompleto"):
        history.clean_snapshot(fixture)


def test_alerts_require_three_consecutive_non_ok_samples():
    now = datetime.now(timezone.utc)
    rows = [history.clean_snapshot(sample("ok", now - timedelta(minutes=3))),
            history.clean_snapshot(sample("critical", now - timedelta(minutes=2))),
            history.clean_snapshot(sample("critical", now - timedelta(minutes=1)))]
    assert history.build_summary(rows)["persistent_alerts"] == []
    rows.append(history.clean_snapshot(sample("critical", now)))
    report = history.build_summary(rows)
    assert len(report["persistent_alerts"]) == 11
    assert report["observed_ok_percent"] == 25.0
    assert report["latency"]["http:api"]["p95_ms"] == 120


def test_record_once_and_histories_are_bounded(tmp_path):
    now = datetime.now(timezone.utc)
    first = history.record_once(tmp_path, snapshot=sample("ok", now - timedelta(seconds=2)))
    second = history.record_once(tmp_path, snapshot=sample("warning", now))
    assert first["sample_count"] == 1
    assert second["sample_count"] == 2
    assert json.loads((tmp_path / "summary.json").read_text())["sample_count"] == 2
    assert len((tmp_path / "snapshots.jsonl").read_text().splitlines()) == 2


def test_out_of_order_snapshot_does_not_mutate_existing(tmp_path):
    now = datetime.now(timezone.utc)
    history.record_once(tmp_path, snapshot=sample("ok", now))
    previous = (tmp_path / "snapshots.jsonl").read_bytes()
    with pytest.raises(ValueError, match="fuera de orden"):
        history.record_once(tmp_path, snapshot=sample("critical", now - timedelta(seconds=30)))
    assert (tmp_path / "snapshots.jsonl").read_bytes() == previous


def test_lock_blocks_parallel_writer(tmp_path):
    (tmp_path / ".collector.lock").write_text("busy")
    with pytest.raises(RuntimeError, match="bloqueo pendiente"):
        history.record_once(tmp_path, snapshot=sample())
    assert not (tmp_path / "summary.json").exists()


def test_history_corruption_fails_closed(tmp_path):
    (tmp_path / "snapshots.jsonl").write_text('{"password":"SENTINEL"}\n')
    with pytest.raises(ValueError):
        history.record_once(tmp_path, snapshot=sample())
    assert not (tmp_path / "summary.json").exists()


def test_summary_has_no_personal_or_commercial_data(tmp_path):
    history.record_once(tmp_path, snapshot=sample(secret=True))
    txt = (tmp_path / "summary.json").read_text()
    assert "SENTINEL" not in txt
    assert "token" not in txt
    assert "customer" not in txt
    assert "password" not in txt


def test_history_retention_and_sample_limit():
    now = datetime.now(timezone.utc)
    rows = [history.clean_snapshot(sample("ok", now - timedelta(minutes=i))) for i in range(800)]
    summary = history.build_summary(rows[-history.MAX_ROWS:])
    assert summary["sample_count"] == 720
    assert len(summary["trend"]) == 60
