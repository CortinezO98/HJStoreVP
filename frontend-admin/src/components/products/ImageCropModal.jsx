import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Encuadre no destructivo antes de subir. Utiliza Canvas para producir una
 * copia WEBP recortada; los archivos preexistentes nunca se modifican.
 */
export default function ImageCropModal({ file, ratio = 1, width = 1800, title = 'Ajustar fotografía', onCancel, onConfirm }) {
  const imageRef = useRef(null)
  const [url, setUrl] = useState('')
  const [dimensions, setDimensions] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState(null)
  const [preparedUrl, setPreparedUrl] = useState('')

  useEffect(() => {
    if (!file) return undefined
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    setDimensions(null)
    setZoom(1)
    setX(0)
    setY(0)
    setError('')
    setPrepared(null)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  useEffect(() => {
    if (!prepared) {
      setPreparedUrl('')
      return undefined
    }
    const preview = URL.createObjectURL(prepared)
    setPreparedUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [prepared])

  const frameHeight = Math.round(width / ratio)
  const imageMetrics = useMemo(() => {
    if (!dimensions) return null
    const baseScale = Math.max(width / dimensions.width, frameHeight / dimensions.height)
    const scaledWidth = dimensions.width * baseScale * zoom
    const scaledHeight = dimensions.height * baseScale * zoom
    const extraX = Math.max(0, scaledWidth - width)
    const extraY = Math.max(0, scaledHeight - frameHeight)
    const left = -extraX * (x + 100) / 200
    const top = -extraY * (y + 100) / 200
    return { scaledWidth, scaledHeight, left, top }
  }, [dimensions, zoom, x, y, width, frameHeight])

  const prepare = async () => {
    const img = imageRef.current
    if (!img?.complete || !img.naturalWidth || !imageMetrics || saving) return
    setSaving(true)
    setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = frameHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('No fue posible preparar la imagen')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      if (!img.complete || !img.naturalWidth) throw new Error('La fotografía no terminó de cargar')
      ctx.drawImage(img, imageMetrics.left, imageMetrics.top,
        imageMetrics.scaledWidth, imageMetrics.scaledHeight)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let visible = 0
      let min = 255, max = 0, minAlpha = 255, maxAlpha = 0
      for (let i = 0; i < pixels.length; i += 64) {
        minAlpha = Math.min(minAlpha, pixels[i + 3])
        maxAlpha = Math.max(maxAlpha, pixels[i + 3])
        if (pixels[i + 3] > 12) {
          visible++
          min = Math.min(min, pixels[i], pixels[i + 1], pixels[i + 2])
          max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2])
        }
      }
      if (!visible || (max - min < 5 && maxAlpha - minAlpha < 5)) {
        throw new Error('El recorte parece vacío o de un solo color. Revisa el encuadre.')
      }
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen')),
          'image/webp', 0.9))
      const base = (file.name || 'imagen').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70)
      if (blob.size < 500) throw new Error('El archivo generado está vacío')
      const output = new File([blob], `${base}-optimizada.webp`, { type: 'image/webp' })
      const decoded = await createImageBitmap(output)
      try {
        if (decoded.width !== width || decoded.height !== frameHeight) {
          throw new Error('El archivo final no tiene las dimensiones esperadas')
        }
      } finally {
        decoded.close()
      }
      setPrepared(output)
    } catch (err) {
      setError(err.message || 'Error preparando la fotografía')
    } finally {
      setSaving(false)
    }
  }

  const uploadPrepared = async () => {
    if (!prepared || saving) return
    setSaving(true)
    setError('')
    try {
      await onConfirm(prepared)
    } catch (err) {
      setError(err?.message || 'No se pudo subir la imagen.')
    } finally {
      setSaving(false)
    }
  }

  if (!file) return null
  return (
    <div className="fixed inset-0 z-[1100] bg-black/80 flex items-center justify-center p-3 sm:p-5"
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white text-gray-900 rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          Centra el producto, ajusta el zoom y desplaza el encuadre. Se generará una
          copia WEBP de alta calidad sin modificar la fotografía original de tu computador.
        </p>
        <div className="bg-neutral-100 rounded-lg p-3 flex items-center justify-center overflow-hidden">
          <div className="relative overflow-hidden bg-white border border-neutral-300"
            style={{ width: '100%', maxWidth: ratio > 1 ? 560 : 420, aspectRatio: String(ratio) }}>
            <img ref={imageRef} src={url} alt="Vista previa de recorte" draggable={false}
              onLoad={(event) => setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              onError={() => setError('No se pudo abrir la imagen en este navegador')}
              style={imageMetrics ? {
                position: 'absolute',
                width: `${imageMetrics.scaledWidth / width * 100}%`,
                height: `${imageMetrics.scaledHeight / frameHeight * 100}%`,
                left: `${imageMetrics.left / width * 100}%`,
                top: `${imageMetrics.top / frameHeight * 100}%`,
                maxWidth: 'none',
              } : { width: '100%', height: '100%', objectFit: 'contain' }}/>
            <div className="absolute inset-0 border-2 border-white/80 pointer-events-none"/>
          </div>
        </div>
        {preparedUrl && (
          <div className="mt-4 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
            <p className="text-sm font-semibold mb-2">Vista previa del WEBP final</p>
            <img src={preparedUrl} alt="Fotografía procesada antes de subir"
              style={{ maxHeight: 250, maxWidth: '100%', objectFit: 'contain', margin: 'auto' }}
              onError={() => { setPrepared(null); setError('El archivo final no se puede visualizar.') }}/>
            <p className="text-xs text-gray-600 mt-2">
              Tamaño: {(prepared?.size / 1024).toFixed(0)} KB. Confirma únicamente si se ve correctamente.
            </p>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4 my-5">
          {[
            ['Zoom', zoom, setZoom, 1, 3, 0.05],
            ['Horizontal', x, setX, -100, 100, 1],
            ['Vertical', y, setY, -100, 100, 1],
          ].map(([label, value, setter, min, max, step]) => (
            <label key={label} className="text-sm font-semibold">
              {label}
              <input type="range" className="w-full mt-3" min={min} max={max} step={step}
                value={value} onChange={(e) => { setter(Number(e.target.value)); setPrepared(null) }}/>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Salida: {width} × {frameHeight} px · WEBP calidad alta ·
          {' '}{dimensions ? `Original: ${dimensions.width} × ${dimensions.height} px` : 'Abriendo archivo…'}
        </p>
        {error && <p role="alert" className="text-red-700 text-sm mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-outline-secondary" disabled={!dimensions || saving}
            onClick={prepare}>{saving ? 'Procesando…' : 'Generar vista previa'}</button>
          <button type="button" className="btn btn-primary" disabled={!prepared || saving}
            onClick={uploadPrepared}>{saving ? 'Subiendo…' : 'Confirmar imagen'}</button>
        </div>
      </div>
    </div>
  )
}
