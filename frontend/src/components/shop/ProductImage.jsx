import { useState } from 'react'

/**
 * Presentation-only image with a graceful branded fallback for missing/broken assets.
 * Never alters product records, URLs, stock or checkout data.
 */
export default function ProductImage({
  src, alt, category, className = '', loading = 'lazy',
  fetchPriority = 'auto', onError,
}) {
  const [failedUrl, setFailedUrl] = useState(null)
  const visible = typeof src === 'string' && src.trim() && failedUrl !== src

  if (visible) {
    return <img src={src} alt={alt || 'Producto HJStoreVP'}
      className={className} loading={loading} decoding="async"
      fetchPriority={fetchPriority}
      onError={event => {
        setFailedUrl(src)
        onError?.(event)
      }}/>
  }

  return <span className="editorial-product-fallback store-product-placeholder"
    role="img" aria-label={alt ? `Fotografía no disponible: ${alt}` : 'Fotografía no disponible'}>
    <span className="store-product-placeholder-mark" aria-hidden="true">HJ<span>VP</span></span>
    <span className="store-product-placeholder-label">{category || 'ESTILO PROPIO'}</span>
    <span className="sr-only">Fotografía no disponible</span>
  </span>
}
