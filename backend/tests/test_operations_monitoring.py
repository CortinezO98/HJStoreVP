"""E.5.5 — Endpoint de monitor: RBAC real, sólo lectura y reporte depurado.

Se ejecuta con SQLite de prueba, sin Docker ni servicio comercial.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from app.api.v1.endpoints import operations_monitoring as monitor_api
from app.core.config import settings
from app.models.models import UserRole
from tests.test_main import TestingSession, client, auth_headers, setup_db  # noqa: F401


def report():
    at = datetime.now(timezone.utc).isoformat()
    checks = {k: {"status": "ok", "metrics": {"latency_ms": 30, "token": "SENTINEL"}}
              for k in monitor_api._ALLOWED_CHECKS}
    return {
        "schema_version": 1, "environment": "local-development-only",
        "latest_at_utc": at, "latest_status": "ok", "sample_count": 1,
        "observed_ok_percent": 100.0, "latest_checks": checks,
        "persistent_alerts": [], "trend": [{"at": at, "status": "ok"}],
        "latency": {"http:api": {"p50_ms": 30, "p95_ms": 30, "samples": 1}},
        "secret": "SENTINEL",
    }


def test_superadmin_reads_only_allowlisted_metrics(client, auth_headers, tmp_path, monkeypatch):
    filename = tmp_path / "summary.json"
    filename.write_text(json.dumps(report()), encoding="utf-8")
    monkeypatch.setattr(monitor_api, "_REPORT", filename)
    response = client.get("/api/v1/operations-monitoring", headers=auth_headers)
    assert response.status_code == 200, response.text
    text = response.text
    assert "SENTINEL" not in text and "token" not in text and "secret" not in text
    assert response.json()["sample_count"] == 1
    assert response.headers["cache-control"] == "no-store"


def test_anonymous_and_non_superadmin_denied(client, auth_headers, tmp_path, monkeypatch):
    filename = tmp_path / "summary.json"
    filename.write_text(json.dumps(report()), encoding="utf-8")
    monkeypatch.setattr(monitor_api, "_REPORT", filename)
    assert client.get("/api/v1/operations-monitoring").status_code in (401, 403)
    db = TestingSession()
    try:
        from app.models.models import User
        user = db.query(User).filter_by(email="test@hjstorevp.com").first()
        user.role = UserRole.ADMIN
        db.commit()
    finally:
        db.close()
    denied = client.get("/api/v1/operations-monitoring", headers=auth_headers)
    assert denied.status_code in (401, 403)


def test_production_blocks_report_even_for_superadmin(client, auth_headers, tmp_path, monkeypatch):
    filename = tmp_path / "summary.json"
    filename.write_text(json.dumps(report()), encoding="utf-8")
    monkeypatch.setattr(monitor_api, "_REPORT", filename)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = client.get("/api/v1/operations-monitoring", headers=auth_headers)
    assert response.status_code == 503


def test_stale_report_detected(client, auth_headers, tmp_path, monkeypatch):
    data = report()
    data["latest_at_utc"] = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    file = tmp_path / "summary.json"
    file.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(monitor_api, "_REPORT", file)
    response = client.get("/api/v1/operations-monitoring", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["stale"] is True


def test_invalid_report_fails_closed(client, auth_headers, tmp_path, monkeypatch):
    file = tmp_path / "summary.json"
    file.write_text(json.dumps({"password": "SENTINEL"}), encoding="utf-8")
    monkeypatch.setattr(monitor_api, "_REPORT", file)
    response = client.get("/api/v1/operations-monitoring", headers=auth_headers)
    assert response.status_code == 503
    assert "SENTINEL" not in response.text
