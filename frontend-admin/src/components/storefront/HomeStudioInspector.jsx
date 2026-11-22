import { ArrowLeft, Eye, EyeOff, Image as ImageIcon, MousePointer2 } from 'lucide-react'

const SECTION_NAMES = {
  hero: 'Banner principal', statement: 'Campaña de estilo',
  newest: 'Recién llegados', featured: 'Productos destacados',
  personalized: 'Recomendaciones', campaigns: 'Campañas fotográficas',
  visual: 'Bloques visuales', categories: 'Categorías',
  loyalty: 'Fidelización', services: 'Beneficios',
  faq: 'Preguntas frecuentes', closing: 'Cierre editorial',
}

const heroFields = [
  ['hero_eyebrow', 'Texto superior', 120],
  ['hero_title', 'Título principal', 160],
  ['hero_description', 'Descripción', 500],
  ['hero_button', 'Texto del botón', 60],
]
const campaignFields = [
  ['title', 'Título', 80],
  ['subtitle', 'Subtítulo', 160],
  ['button_text', 'Botón', 40],
]
const loyaltyFields = [
  ['eyebrow', 'Texto superior', 120],
  ['title', 'Título', 160],
  ['description', 'Descripción', 500],
  ['button_text', 'Botón', 60],
]

export default function HomeStudioInspector({
  draft, selected, selectedCampaignIndex = 0, focusField = '',
  disabled = false, hidden = [], onFieldChange, onCampaignChange,
  onLoyaltyChange, onCustomChange, onVisibilityChange, onOpenEditor,
}) {
  const custom = selected.startsWith('custom:')
    ? (draft.homepage_custom_sections || []).find(item => 'custom:' + item.id === selected)
    : null
  const campaigns = draft.homepage_banners || []
  const safeCampaignIndex = Math.max(0, Math.min(selectedCampaignIndex, campaigns.length - 1))
  const campaign = campaigns[safeCampaignIndex]
  const loyalty = draft.homepage_loyalty_banner
  const isHidden = selected !== 'hero' && hidden.includes(selected)
  const heading = custom?.title || SECTION_NAMES[selected] || 'Sección seleccionada'

  let fields = []
  let data = null
  let onChange = null
  if (selected === 'hero') {
    fields = heroFields
    data = draft
    onChange = onFieldChange
  } else if (selected === 'campaigns' && campaign) {
    fields = campaignFields
    data = campaign
    onChange = (field, value) => onCampaignChange(safeCampaignIndex, field, value)
  } else if (selected === 'loyalty' && loyalty) {
    fields = loyaltyFields
    data = loyalty
    onChange = onLoyaltyChange
  } else if (custom) {
    fields = [['title', 'Nombre de la sección', 80]]
    data = custom
    onChange = (field, value) => onCustomChange(custom.id, field, value)
  }

  return <section className="hj-studio-inspector" aria-label="Edición rápida de la sección seleccionada">
    <div className="hj-studio-inspector-heading">
      <div>
        <span className="admin-page-kicker"><MousePointer2 size={13} aria-hidden="true" /> Editor contextual</span>
        <h3>{heading}</h3>
        <p>Selecciona otra sección directamente sobre la vista previa para cambiar lo que editas.</p>
      </div>
      {selected !== 'hero' && <span className="hj-inspector-status">
        {isHidden ? <><EyeOff size={14} aria-hidden="true"/> Oculta</> : <><Eye size={14} aria-hidden="true"/> Visible</>}
      </span>}
    </div>
    {selected === 'campaigns' && campaigns.length > 1 && <label className="form-label">
      Campaña seleccionada
      <select className="form-select form-select-sm" value={safeCampaignIndex} disabled={disabled}
        onChange={event => onOpenEditor('campaigns', Number(event.target.value))}>
        {campaigns.map((item, index) => <option key={index} value={index}>
          {index + 1}. {item.title || 'Sin título'}
        </option>)}
      </select>
    </label>}
    {fields.length ? <div className="hj-studio-inspector-fields">
      {fields.map(([field, label, maxLength]) => <label className="form-label" key={field}>
        <span>{label}{focusField === field && <small className="hj-inspector-selected">Seleccionado en la vista</small>}</span>
        {field === 'hero_description' || field === 'description'
          ? <textarea className="form-control form-control-sm" rows={2} maxLength={maxLength}
              disabled={disabled} value={data?.[field] || ''} onChange={event => onChange(field, event.target.value)}/>
          : <input className="form-control form-control-sm" maxLength={maxLength}
              disabled={disabled} value={data?.[field] || ''} onChange={event => onChange(field, event.target.value)}/>}
      </label>)}
    </div> : <p className="hj-inspector-hint">
      {selected === 'campaigns' ? 'Todavía no hay campañas. Puedes crear una desde el editor completo.'
        : 'Esta sección utiliza componentes propios de la tienda. Edita su contenido en el formulario correspondiente.'}
    </p>}
    {selected !== 'hero' && <label className="hj-inspector-toggle">
      <input type="checkbox" checked={!isHidden} disabled={disabled}
        onChange={() => onVisibilityChange(selected)}/>
      Mostrar sección en la portada
    </label>}
    <div className="hj-studio-inspector-actions">
      <button type="button" className="btn btn-outline-secondary btn-sm"
        onClick={() => onOpenEditor(selected, safeCampaignIndex)}>
        <ImageIcon size={15} aria-hidden="true" /> Abrir editor completo
        <ArrowLeft size={13} aria-hidden="true" />
      </button>
      <small>Textos y visibilidad permanecen en el borrador. Las fotografías, los enlaces y las fechas se configuran en el editor completo.</small>
    </div>
  </section>
}
