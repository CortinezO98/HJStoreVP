"""Puerto de integración fiscal de HJStoreVP.

No contiene adaptadores reales y deliberadamente no puede emitir.
Implementar un proveedor exige habilitación/contrato, firma, UBL,
numeración autorizada, idempotencia, consulta de aceptación DIAN y
almacenamiento privado de XML/representación gráfica.
"""
from dataclasses import dataclass
from typing import Protocol, Mapping, Any


class FiscalIssuanceDisabled(RuntimeError):
    pass


@dataclass(frozen=True)
class FiscalSubmission:
    source_order_id: int
    issuer_profile_id: int
    idempotency_key: str
    document_kind: str
    payload: Mapping[str, Any]


@dataclass(frozen=True)
class FiscalResult:
    provider_reference: str
    authority_status: str
    xml_storage_key: str | None
    graphical_storage_key: str | None
    cufe_or_cude: str | None


class FiscalAdapter(Protocol):
    def submit(self, request: FiscalSubmission) -> FiscalResult: ...
    def status(self, provider_reference: str) -> FiscalResult: ...


class DisabledFiscalAdapter:
    """Adaptador único actual. Ni las pruebas pueden emitir accidentalmente."""

    def submit(self, request: FiscalSubmission) -> FiscalResult:
        raise FiscalIssuanceDisabled(
            "Emisión DIAN deshabilitada. No hay proveedor ni habilitación configurados."
        )

    def status(self, provider_reference: str) -> FiscalResult:
        raise FiscalIssuanceDisabled(
            "Consulta DIAN deshabilitada. No hay proveedor integrado."
        )


def get_fiscal_adapter() -> FiscalAdapter:
    # No elegir por nombre ni URL controlados por el navegador.
    # Cualquier activación futura requiere revisión de seguridad y nuevo código.
    return DisabledFiscalAdapter()
