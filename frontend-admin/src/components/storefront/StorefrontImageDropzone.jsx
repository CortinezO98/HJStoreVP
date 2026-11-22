import { useState } from 'react'
import { ImagePlus, UploadCloud } from 'lucide-react'

/**
 * Carga por selección o arrastrar/soltar. No envía ficheros por sí misma:
 * el editor propietario valida formato, recorta y sube al backend.
 */
export default function StorefrontImageDropzone({
  id, label, hint, disabled = false, onFile, compact = false,
}) {
  const [over, setOver] = useState(false)
  const acceptFile = file => {
    if (!disabled && file) onFile(file)
  }
  const dragOver = event => {
    if (disabled) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }
  const drop = event => {
    event.preventDefault()
    setOver(false)
    if (disabled) return
    acceptFile(event.dataTransfer.files?.[0])
  }
  return <div className={`hj-image-dropzone ${over ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''} ${compact ? 'is-compact' : ''}`}
    onDragEnter={dragOver} onDragOver={dragOver}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(false) }}
    onDrop={drop}>
    <label htmlFor={id} className="hj-image-dropzone-label">
      {compact ? <ImagePlus size={20} aria-hidden="true" /> : <UploadCloud size={24} aria-hidden="true" />}
      <span><strong>{label}</strong><small>{hint || 'JPG, PNG o WebP · arrastra una fotografía o selecciónala'}</small></span>
    </label>
    <input id={id} className="hj-image-dropzone-input" type="file"
      accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={event => {
        acceptFile(event.target.files?.[0])
        event.target.value = ''
      }}/>
  </div>
}
