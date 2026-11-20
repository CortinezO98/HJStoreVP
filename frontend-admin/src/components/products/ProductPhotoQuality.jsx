import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ImageOff } from 'lucide-react'

/**
 * Client-side merchandising guidance. Not a claim that an image's content
 * is semantically correct; only dimensions, loading and alt text can be assessed.
 */
export default function ProductPhotoQuality({ src, altText = '', isPrimary = false, compact = false }) {
  const [inspection, setInspection] = useState(null)
  const goodAlt = String(altText || '').trim().length >= 12
  const warnings = []
  if (!src) warnings.push('Sin fotografía')
  else if (inspection?.url === src && inspection.failed) warnings.push('La fotografía no carga')
  else if (inspection?.url === src && inspection.width) {
    if (Math.min(inspection.width, inspection.height) < 900)
      warnings.push('Resolución baja: recomendamos al menos 900 px por lado')
    if (Math.max(inspection.width / inspection.height, inspection.height / inspection.width) > 1.6)
      warnings.push('Formato muy alargado: revisa el encuadre del catálogo')
  }
  if (!goodAlt) warnings.push('Agrega una descripción de al menos 12 caracteres')

  return <div className={compact ? 'text-xs space-y-1' : 'rounded-lg bg-gray-50 p-3 text-xs space-y-2'}>
    {src && <img src={src} alt="" className="sr-only" decoding="async" loading="lazy"
      onLoad={e => setInspection({ url: src, width: e.currentTarget.naturalWidth,
        height: e.currentTarget.naturalHeight })}
      onError={() => setInspection({ url: src, failed: true })}/>}
    <div className="flex items-center gap-2 font-semibold">
      {warnings.length ? <AlertTriangle size={15} className="text-amber-700" /> :
        <CheckCircle2 size={15} className="text-green-700"/>}
      <span>{isPrimary ? 'Fotografía principal' : 'Revisión visual'}:
        {inspection?.url === src && inspection.width ?
          ` ${inspection.width} × ${inspection.height} px` : !src ? ' sin imagen' : ' comprobando imagen'}</span>
    </div>
    {warnings.map(message => <p key={message} className="text-amber-800 flex gap-2 items-start">
      <ImageOff size={13} className="shrink-0 mt-0.5"/>{message}
    </p>)}
    {!warnings.length && <p className="text-green-700">
      Verificaciones técnicas básicas superadas; revisa también que la foto sea del producto correcto.
    </p>}
  </div>
}
