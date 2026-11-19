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

  useEffect(() => {
    if (!file) return undefined
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    setDimensions(null)
    setZoom(1)
    setX(0)
    setY(0)
    setError('')
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

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

  const confirm = async () => {
    const img = imageRef.current
    if (!img?.complete || !img.naturalWidth || !imageMetrics || saving) return
    setSaving(true)
    setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = frameHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No fue posible preparar la imagen')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, imageMetrics.left, imageMetrics.top,
        imageMetrics.scaledWidth, imageMetrics.scaledHeight)
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen')),
          'image/webp', 0.9))
      const base = (file.name || 'imagen').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70)
      await onConfirm(new File([blob], `${base}-optimizada.webp`, { type: 'image/webp' }))
    } catch (err) {
      setError(err.message || 'Error preparando la fotografía')
    } finally {
      setSaving(false)
    }
  }

  if (!file) return null
  const previewWidth = 100
  const previewHeight = 100 / ratio
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
                width: `${imageMetrics.scaledWidth / width * previewWidth}%`,
                height: `${imageMetrics.scaledHeight / frameHeight * 100}%`,
                left: `${imageMetrics.left / width * 100}%`,
                top: `${imageMetrics.top / frameHeight * 100}%`,
                maxWidth: 'none',
              } : { width: '100%', height: '100%', objectFit: 'contain' }}/>
            <div className="absolute inset-0 border-2 border-white/80 pointer-events-none"/>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 my-5">
          {[
            ['Zoom', zoom, setZoom, 1, 3, 0.05],
            ['Horizontal', x, setX, -100, 100, 1],
            ['Vertical', y, setY, -100, 100, 1],
          ].map(([label, value, setter, min, max, step]) => (
            <label key={label} className="text-sm font-semibold">
              {label}
              <input type="range" className="w-full mt-3" min={min} max={max} step={step}
                value={value} onChange={(e) => setter(Number(e.target.value))}/>
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
          <button type="button" className="btn btn-primary" disabled={!dimensions || saving} onClick={confirm}>
            {saving ? 'Preparando…' : 'Aplicar encuadre'}
          </button>
        </div>
      </div>
    </div>
  )
}
