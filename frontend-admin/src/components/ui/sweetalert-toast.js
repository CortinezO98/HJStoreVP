import Swal from 'sweetalert2'

const palette = {
  success: '#1F7A4D',
  error: '#C81E1E',
  warning: '#9A5B00',
  info: '#1D5FA8',
}

// Fachada compatible con las llamadas existentes a toast.success/error.
// SweetAlert2 muestra mensajes breves sin HTML proveniente del backend.
const notification = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3600,
  timerProgressBar: true,
  showCloseButton: true,
  customClass: { popup: 'hj-swal-toast', title: 'hj-swal-toast-title' },
  didOpen: (popup) => {
    popup.addEventListener('mouseenter', Swal.stopTimer)
    popup.addEventListener('mouseleave', Swal.resumeTimer)
  },
})

function show(message, icon = 'info') {
  return notification.fire({
    icon,
    titleText: String(message ?? ''),
    iconColor: palette[icon] || palette.info,
  })
}

export const toast = Object.assign(
  (message) => show(message, 'info'),
  {
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
    warning: (message) => show(message, 'warning'),
    loading: (message) => Swal.fire({
      titleText: String(message ?? 'Procesando…'),
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    }),
    dismiss: () => Swal.close(),
    remove: () => Swal.close(),
    promise: async (promise, messages) => {
      const pending = typeof promise === 'function' ? promise() : promise
      if (messages?.loading) toast.loading(messages.loading)
      try {
        const result = await pending
        Swal.close()
        if (messages?.success) toast.success(typeof messages.success === 'function' ? messages.success(result) : messages.success)
        return result
      } catch (error) {
        Swal.close()
        if (messages?.error) toast.error(typeof messages.error === 'function' ? messages.error(error) : messages.error)
        throw error
      }
    },
  },
)

export default toast
