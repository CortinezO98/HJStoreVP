const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * Confirm that an uploaded file can be decoded from its public URL.
 * Helps detect a missing uploads volume or inaccessible API host.
 */
export async function verifyUploadedImage(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('El servidor no devolvió una ruta de imagen')
  }
  const url = /^https?:\/\//.test(path) ? path : API_URL + path
  const image = new Image()
  image.decoding = 'async'
  try {
    if (typeof image.decode === 'function') {
      image.src = url
      await image.decode()
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = url
      })
    }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Imagen sin dimensiones')
    return url
  } catch {
    throw new Error('La imagen está registrada, pero su URL pública no se puede visualizar. Revisa backend y almacenamiento antes de publicarla.')
  }
}
