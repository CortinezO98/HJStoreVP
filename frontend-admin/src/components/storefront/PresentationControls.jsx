/** Reusable controlled presentation fields: changes stay in the parent draft. */
export function BannerPresentationControls({ value = {}, onChange }) {
  const update = (key, next) => onChange({ ...value, [key]: next })
  return <div className="border rounded p-3 mt-3">
    <strong className="d-block mb-3">Presentación de la fotografía</strong>
    <div className="row g-3">
      <label className="col-12 col-sm-6 form-label">Alineación del texto
        <select className="form-select mt-1" value={value.text_align || 'left'}
          onChange={e => update('text_align', e.target.value)}>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </label>
      <label className="col-12 col-sm-6 form-label">Posición vertical
        <select className="form-select mt-1" value={value.text_position || 'bottom'}
          onChange={e => update('text_position', e.target.value)}>
          <option value="top">Superior</option>
          <option value="center">Centro</option>
          <option value="bottom">Inferior</option>
        </select>
      </label>
      <label className="col-12 form-label">
        Intensidad del degradado: {value.overlay_opacity ?? 65}%
        <input className="form-range mt-2" type="range" min="0" max="90" step="5"
          value={value.overlay_opacity ?? 65}
          onChange={e => update('overlay_opacity', Number(e.target.value))}/>
      </label>
    </div>
  </div>
}

export function CarouselPlaybackControls({ value = {}, onChange, title = 'Reproducción del carrusel' }) {
  const update = (key, next) => onChange({ ...value, [key]: next })
  return <div className="border rounded p-3 mt-3">
    <strong className="d-block mb-3">{title}</strong>
    <label className="d-flex align-items-center gap-2 mb-3">
      <input type="checkbox" checked={value.autoplay ?? true}
        onChange={e => update('autoplay', e.target.checked)}/>
      Reproducción automática
    </label>
    <label className="d-block form-label">Intervalo de cambio
      <select className="form-select mt-1" value={value.interval_ms ?? 6000}
        disabled={!(value.autoplay ?? true)}
        onChange={e => update('interval_ms', Number(e.target.value))}>
        {[3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000].map(ms =>
          <option key={ms} value={ms}>{ms / 1000} segundos</option>)}
      </select>
    </label>
    <label className="d-flex align-items-center gap-2 mt-3">
      <input type="checkbox" checked={value.show_navigation ?? true}
        onChange={e => update('show_navigation', e.target.checked)}/>
      Mostrar flechas y controles de navegación
    </label>
    <p className="small text-secondary mb-0 mt-2">
      La reproducción automática se detiene cuando el cliente interactúa con el carrusel
      o ha solicitado movimiento reducido.
    </p>
  </div>
}
