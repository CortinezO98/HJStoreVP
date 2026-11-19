const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * Verify a just-uploaded public asset. Report the true HTTP status instead
 * of interpreting all load failures as an invalid image.
 *
 * fetch() also distinguishes an inaccessible API origin from an unreadable
 * image body. Blob decoding is done locally, without cross-origin surprises.
 */
export async function verifyUploadedImage(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('El servidor no devolvió una ruta de imagen')
  }
  const url = /^https?:\/\//i.test(path) ? path : `${API_URL}${path}`
  let response
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' })
  } catch {
    throw new Error(
      `No fue posible conectar con el servidor de imágenes (${url}). Revisa que el backend del puerto 8000 esté disponible.`
    )
  }
  if (!response.ok) {
    throw new Error(
      `La imagen se guardó, pero su URL responde HTTP ${response.status} (${url}). ` +
      'No vuelvas a subirla hasta revisar el almacenamiento del backend.'
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(
      `La URL responde ${contentType || 'un tipo desconocido'} en lugar de imagen (${url}).`
    )
  }
  const blob = await response.blob()
  if (blob.size < 100) {
    throw new Error(`El archivo publicado está vacío o incompleto (${url}).`)
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = new Image()
    const decoded = new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
    img.src = objectUrl
    if (typeof img.decode === 'function') {
      await img.decode()
    } else {
      await decoded
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('No hay dimensiones válidas')
    }
    return url
  } catch {
    throw new Error(
      `La URL responde HTTP 200, pero el navegador no pudo decodificar la imagen (${url}).`
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
