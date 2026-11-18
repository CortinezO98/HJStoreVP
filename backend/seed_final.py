"""Archived destructive fixture reset.

This entrypoint is intentionally disabled. Use Alembic migrations and the
non-destructive bootstrap procedure for administrator provisioning instead.
The historical reset is not safe for an existing commerce database.
"""

raise SystemExit("Reset de base de datos deshabilitado: usa migraciones y bootstrap seguro")
