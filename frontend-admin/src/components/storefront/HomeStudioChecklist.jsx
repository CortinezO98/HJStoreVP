import { CheckCircle2, CircleAlert, Image, MonitorSmartphone } from 'lucide-react'

const exists = value => typeof value === 'string' && value.trim().length > 0

/**
 * Recomendaciones para revisar antes de publicar. No altera la validación
 * de servidor ni bloquea publicar: se indica si algo es opcional.
 */
export default function HomeStudioChecklist({ draft, hasSavedDraft, changed, conflict, onSelect }) {
  const hidden = new Set(draft.homepage_hidden_sections || [])
  const visible = id => !hidden.has(id)
  const banners = (draft.homepage_banners || []).filter(item => item.active)
  const custom = (draft.homepage_custom_sections || []).filter(item => item.active &&
    visible('custom:' + item.id))
  const tasks = [
    { done: exists(draft.hero_title) && exists(draft.hero_button), label: 'Textos del banner principal', detail: 'Título y texto del botón', id: 'hero', essential: true },
    { done: (draft.hero_images || []).length > 0 || exists(draft.hero_image_url),
      label: 'Fotografía principal', detail: 'Opcional: el diseño editorial funciona sin fotografía', id: 'hero' },
    { done: banners.every(item => exists(item.image_url) && exists(item.title)),
      label: 'Campañas activas', detail: banners.length ? 'Cada campaña activa debe tener título y foto' : 'No hay campañas activas', id: 'campaigns', essential: true },
    { done: custom.every(block => (block.items || []).length > 0 &&
      block.items.every(item => exists(item.image_url))),
      label: 'Secciones nuevas activas', detail: custom.length ? 'Cada bloque activo necesita fotografías' : 'No hay secciones nuevas activas', id: 'visual', essential: true },
    { done: [...banners, ...custom.flatMap(block => block.items || [])]
      .filter(item => exists(item.image_url)).every(item => exists(item.mobile_image_url)),
      label: 'Fotografías para celular', detail: 'Opcional: se reutiliza la foto de escritorio si falta', id: 'campaigns' },
    { done: hasSavedDraft && !changed && !conflict, label: 'Borrador listo para revisión',
      detail: conflict ? 'La versión publicada cambió: revisa el conflicto' : changed ? 'Guarda los cambios antes de publicar' : hasSavedDraft ? 'El borrador está guardado' : 'Primero inicializa el borrador',
      id: 'hero', essential: true },
  ]
  const required = tasks.filter(task => task.essential)
  const completed = required.filter(task => task.done).length
  return <section className="hj-studio-checklist" aria-label="Lista de revisión antes de publicar">
    <div className="hj-studio-checklist-head">
      <div>
        <p className="admin-page-kicker">Revisión de la portada</p>
        <h2>¿Está listo el diseño?</h2>
        <p>Completa lo necesario y revisa las recomendaciones opcionales antes de publicar.</p>
      </div>
      <span className="hj-studio-checklist-count">{completed} de {required.length} puntos esenciales</span>
    </div>
    <ul className="hj-studio-checklist-items">
      {tasks.map(task => <li key={task.label}>
        {task.done ? <CheckCircle2 size={19} className="hj-check-ok" aria-hidden="true" />
          : task.essential ? <CircleAlert size={19} className="hj-check-warn" aria-hidden="true" />
            : <Image size={19} className="hj-check-optional" aria-hidden="true" />}
        <div><strong>{task.label}</strong><span>{task.detail}</span></div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onSelect(task.id)}>
          Revisar
        </button>
      </li>)}
    </ul>
    <p className="hj-studio-checklist-foot"><MonitorSmartphone size={16} aria-hidden="true" />
      Revisa el diseño en «Escritorio» y «Celular». Esta lista es orientativa; la validación final la realiza el servidor.</p>
  </section>
}
