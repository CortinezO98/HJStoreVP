import Swal from 'sweetalert2'

/**
 * Confirmación centralizada con SweetAlert2.
 * Devuelve boolean y nunca ejecuta la acción directamente.
 * Emplea titleText/text para no interpretar HTML de usuario o backend.
 */
export async function confirmAction(
  message,
  { title, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {},
) {
  const result = await Swal.fire({
    titleText: title || (danger ? 'Confirma esta acción' : 'Confirmar'),
    text: String(message ?? ''),
    icon: danger ? 'warning' : 'question',
    iconColor: danger ? '#C81E1E' : '#1D5FA8',
    confirmButtonText: confirmLabel,
    cancelButtonText: cancelLabel,
    showCancelButton: true,
    focusCancel: danger,
    reverseButtons: false,
    allowOutsideClick: false,
    allowEscapeKey: true,
    buttonsStyling: false,
    customClass: {
      popup: 'hj-swal-confirm',
      title: 'hj-swal-confirm-title',
      confirmButton: danger ? 'btn btn-danger' : 'btn btn-primary',
      cancelButton: 'btn btn-outline-secondary',
      actions: 'hj-swal-confirm-actions',
    },
  })
  return result.isConfirmed === true
}

// Mantiene el contrato del layout anterior mientras se retira el host personalizado.
export function ConfirmHost() {
  return null
}
