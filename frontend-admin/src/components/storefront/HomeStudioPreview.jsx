import { ArrowUpRight, ShoppingBag, Search, UserRound } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''
const src = value => value?.startsWith('/') ? `${API_URL}${value}` : value
const LABELS = {
  newest: 'ACABAN DE LLEGAR', statement: 'HAZ QUE TU ESTILO HABLE',
  featured: 'PRODUCTOS DESTACADOS', campaigns: 'COLECCIONES Y CAMPAÑAS',
  personalized: 'ELEGIDOS PARA TI', visual: 'CAMPAÑAS ESPECIALES',
  categories: 'EXPLORA POR CATEGORÍA', loyalty: 'CLUB DE CLIENTES', services: 'BENEFICIOS',
  faq: 'PREGUNTAS FRECUENTES', closing: 'ENCUENTRA TU SIGUIENTE FAVORITO',
}
const ORDER = ['newest', 'statement', 'featured', 'campaigns', 'personalized',
  'visual', 'categories', 'loyalty', 'services', 'faq', 'closing']
const placeholders = [1, 2, 3, 4]

function Tile({ item, mobile }) {
  const image = mobile ? item.mobile_image_url || item.image_url : item.image_url
  const align = item.text_align || 'left'
  const position = item.text_position || 'bottom'
  const opacity = (item.overlay_opacity ?? 65) / 100
  return <div className="position-relative overflow-hidden bg-dark text-white" style={{ minHeight: mobile ? 220 : 245 }}>
    {image && <img src={src(image)} alt={item.title || 'Campaña'}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>}
    <div className="position-absolute inset-0" aria-hidden="true"
      style={{ background: `linear-gradient(transparent,rgba(0,0,0,${opacity}))` }}/>
    <div className="position-absolute start-0 w-100 p-3"
      style={{ textAlign: align, top: position === 'top' ? 0 :
        position === 'center' ? '50%' : 'auto',
        bottom: position === 'bottom' ? 0 : 'auto',
        transform: position === 'center' ? 'translateY(-50%)' : undefined }}>
      <small>{item.subtitle || ''}</small>
      <strong className="d-block fs-5 lh-sm text-uppercase">{item.title || 'NUEVA COLECCIÓN'}</strong>
      <small className="d-inline-flex bg-white text-black px-2 py-1 mt-2">
        {item.button_text || 'VER AHORA'} <ArrowUpRight size={14}/>
      </small>
    </div>
  </div>
}

export default function HomeStudioPreview({ draft, mobile = false, onSelect, selected }) {
  if (!draft) return null
  const custom = draft.homepage_custom_sections || []
  const allowed = [...ORDER, ...custom.map(block => 'custom:' + block.id)]
  const saved = Array.isArray(draft.homepage_section_order) ? draft.homepage_section_order : ORDER
  const order = [...new Set([...saved.filter(id => allowed.includes(id)), ...allowed])]
  for (const [id, after] of [['visual', 'campaigns'], ['loyalty', 'categories']]) {
    if (!order.includes(id)) order.splice(order.indexOf(after) + 1, 0, id)
  }
  const hidden = new Set(draft.homepage_hidden_sections || [])
  const banners = (draft.homepage_banners || []).filter(item => item.active && item.image_url)
  const visuals = (draft.homepage_visual_blocks || []).filter(block => block.active && block.items?.length)
  const heroImage = (draft.hero_images || [])[0]
  const statementImage = (draft.statement_images || [])[0]
  const categoryPhotos = (draft.homepage_category_tiles || []).filter(x => x.image_url)
  const loyalty = draft.homepage_loyalty_banner
  const heroPresentation = draft.hero_presentation || {}
  const statementPresentation = draft.statement_presentation || {}
  const click = (id) => onSelect?.(id)

  return <div className="bg-white text-black mx-auto overflow-hidden"
    style={{ maxWidth: mobile ? 375 : 1000, width: '100%', boxShadow: '0 12px 42px #0002',
      fontFamily: 'Arial, sans-serif', fontSize: mobile ? 12 : 14 }}>
    <div className="text-center text-white bg-black py-2" style={{ fontSize: 9, letterSpacing: 2 }}>
      HJSTOREVP · ESTILO PROPIO
    </div>
    <div className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom">
      <strong style={{ letterSpacing: -1, fontSize: mobile ? 18 : 25 }}>HJ STOREVP</strong>
      {!mobile && <div className="fw-bold" style={{ fontSize: 10, letterSpacing: 1 }}>
        INICIO　CATÁLOGO　NOVEDADES　DESTACADOS
      </div>}
      <div className="d-flex gap-2"><Search size={16}/><UserRound size={16}/><ShoppingBag size={16}/></div>
    </div>
    <button type="button" onClick={() => click('hero')} className="w-100 text-start border-0 p-0"
      aria-label="Seleccionar banner principal" style={{ outline: selected === 'hero' ? '3px solid #2563eb' : 'none',
        outlineOffset: -3, background: '#171717', color: '#fff' }}>
      <div className="position-relative overflow-hidden d-flex"
        style={{ height: mobile ? 400 : 370,
          alignItems: ({top:'flex-start',center:'center',bottom:'flex-end'})[heroPresentation.text_position || 'center'] }}>
        {heroImage && <img src={src(heroImage)} alt="Portada"
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, objectFit: 'cover' }}/>}
        <div className="position-absolute w-100 h-100"
          style={{ background: `linear-gradient(90deg,rgba(0,0,0,${(heroPresentation.overlay_opacity ?? 65)/100}),transparent)` }}/>
        <div className="position-relative p-4" style={{ maxWidth: 530, width: '100%',
          textAlign: heroPresentation.text_align || 'left',
          marginLeft: heroPresentation.text_align === 'right' ? 'auto' : undefined,
          marginInline: heroPresentation.text_align === 'center' ? 'auto' : undefined }}>
          <small>{draft.hero_eyebrow}</small>
          <h1 style={{ fontSize: mobile ? 38 : 56, fontWeight: 900, lineHeight: 1, margin: '10px 0' }}>
            {draft.hero_title || 'ESTILO PROPIO'}
          </h1>
          <p>{draft.hero_description}</p>
          <span className="d-inline-flex align-items-center gap-2 px-3 py-2 bg-white text-black fw-bold">
            {draft.hero_button || 'EXPLORAR'} <ArrowUpRight size={14}/>
          </span>
        </div>
      </div>
    </button>
    {order.filter(id => !hidden.has(id)).map(id => <button
      key={id} type="button" onClick={() => click(id)}
      className="d-block w-100 text-start border-0 p-0 bg-white text-black"
      aria-label={`Seleccionar sección ${id.startsWith('custom:') ? 'personalizada' : LABELS[id]}`}
      style={{ outline: selected === id ? '3px solid #2563eb' : 'none', outlineOffset: -3 }}>
      {id.startsWith('custom:') ? (() => {
        const block = custom.find(entry => 'custom:' + entry.id === id)
        if (!block) return null
        const images = (block.items || []).filter(item => item.image_url)
        return <div className="p-3" style={{ background:'#f6f5f3' }}>
          <p className="small mb-2 text-secondary">{block.type === 'carousel'
            ? 'CARRUSEL' : block.type === 'mosaic' ? 'MOSAICO' : 'BANNER'} PERSONALIZADO
            {!block.active && ' · AÚN NO PUBLICADO'}
          </p>
          <h2 style={{fontSize:mobile ? 20 : 28, fontWeight:900}}>
            {block.title || 'Nueva sección'}
          </h2>
          {images.length ? <div className="d-grid gap-2 mt-2"
            style={{gridTemplateColumns: block.type === 'banner' || mobile ? '1fr' : 'repeat(2,1fr)'}}>
            {(block.type === 'banner' ? images.slice(0,1) : images).map((item,index) =>
              <Tile key={index} item={item} mobile={mobile}/>)}
          </div> : <p className="small text-secondary mb-0">Agrega fotografías para mostrar esta sección.</p>}
        </div>
      })() :
      id === 'statement' ? <div className="d-flex bg-black text-white">
        <div className="p-3 d-flex"
          style={{ flex: 1, textAlign: statementPresentation.text_align || 'left',
            justifyContent: ({left:'flex-start',center:'center',right:'flex-end'})[statementPresentation.text_align || 'left'],
            alignItems: ({top:'flex-start',center:'center',bottom:'flex-end'})[statementPresentation.text_position || 'center'] }}>
          <strong style={{ fontSize: mobile ? 22 : 36, lineHeight: 1 }}>HAZ QUE TU ESTILO HABLE.</strong>
        </div>
        {statementImage && <img src={src(statementImage)} alt="Campaña de estilo"
          style={{ width: '45%', height: mobile ? 170 : 255, objectFit: 'cover' }}/>}
      </div> :
      id === 'campaigns' ? banners.length > 0 && <div className="p-3">
        <h2 className="fw-black mb-3" style={{ fontSize: mobile ? 18 : 26 }}>{LABELS[id]}</h2>
        <div className="d-grid gap-2" style={{ gridTemplateColumns: mobile ? '1fr' : 'repeat(2,1fr)' }}>
          {banners.map((item,i) => <Tile item={item} mobile={mobile} key={i}/>)}
        </div>
      </div> :
      id === 'visual' ? visuals.length > 0 && <div className="p-3">
        {visuals.map(block => <div className="mb-3" key={block.id}>
          <h2 style={{ fontSize: 20 }}>{block.title || 'CAMPAÑA ESPECIAL'}</h2>
          <div className="d-grid gap-2" style={{
            gridTemplateColumns: block.type === 'banner' || mobile ? '1fr' : 'repeat(2,1fr)' }}>
            {(block.type === 'banner' ? block.items.slice(0, 1) : block.items).map((item,i) =>
              <Tile item={item} mobile={mobile} key={i}/>)}
          </div>
        </div>)}
      </div> :
      id === 'loyalty' ? loyalty?.image_url && loyalty.active && <div className="position-relative overflow-hidden bg-dark text-white p-4"
        style={{ minHeight: mobile ? 250 : 320 }}>
        <img src={src(mobile ? loyalty.mobile_image_url || loyalty.image_url : loyalty.image_url)}
          alt="Club de clientes" style={{ position:'absolute', inset:0,width:'100%',height:'100%',objectFit:'cover' }}/>
        <div className="position-absolute inset-0" style={{ background:'linear-gradient(90deg,#000a,#0002)' }}/>
        <div className="position-relative" style={{
          textAlign: loyalty.text_align || 'left',
          paddingTop: loyalty.text_position === 'bottom' ? (mobile ? 110 : 145) :
            loyalty.text_position === 'center' ? (mobile ? 70 : 100) : 0,
        }}>
          <small>{loyalty.eyebrow}</small>
          <h2 style={{ fontWeight:900,fontSize:mobile ? 28 : 42 }}>{loyalty.title}</h2>
          <p>{loyalty.description}</p>
          <span className="d-inline-flex bg-white text-black px-3 py-2">{loyalty.button_text}</span>
        </div>
      </div> :
      id === 'categories' && categoryPhotos.length > 0 ? <div className="p-3">
        <h2 style={{ fontSize: mobile ? 18 : 26 }}>{LABELS[id]}</h2>
        <div className="d-grid gap-2" style={{gridTemplateColumns:mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)'}}>
          {categoryPhotos.map(tile => <div key={tile.category_slug} className="position-relative bg-dark text-white overflow-hidden"
            style={{height:mobile ? 160 : 220}}>
            <img src={src(mobile ? tile.mobile_image_url || tile.image_url : tile.image_url)}
              alt={tile.title || tile.category_slug} className="w-100 h-100" style={{objectFit:'cover'}}/>
            <strong className="position-absolute bottom-0 start-0 p-2" style={{background:'#0008'}}>
              {tile.title || tile.category_slug}
            </strong>
          </div>)}
        </div>
      </div> :
      id === 'newest' || id === 'featured' || id === 'personalized' ?
        <div className="p-3">
          <h2 className="fw-bold" style={{ fontSize: mobile ? 17 : 25 }}>{LABELS[id]}</h2>
          <div className="d-grid gap-2 mt-3" style={{ gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)' }}>
            {placeholders.map(i => <div key={i}>
              <div className="bg-light border" style={{ aspectRatio: '1/1.12' }}/>
              <div className="bg-light mt-2" style={{ height: 10, width: '75%' }}/>
              <div className="bg-light mt-1" style={{ height: 8, width: '50%' }}/>
            </div>)}
          </div>
        </div> :
      <div className="p-3" style={{ background: id === 'categories' || id === 'closing' ? '#f2f2f2' : '#fff' }}>
        <h2 className="fw-bold" style={{ fontSize: mobile ? 17 : 25 }}>{LABELS[id]}</h2>
        <p className="text-secondary small mb-0">
          {id === 'categories' ? 'GORRAS · PERFUMES · RELOJES · ACCESORIOS' :
            id === 'services' ? 'Envíos a Colombia · Opciones de pago · Seguimiento de pedidos' :
            id === 'faq' ? '¿Cómo puedo realizar una compra? · ¿Hacen envíos?' :
            'DESCUBRIR PRODUCTOS'}
        </p>
      </div>}
    </button>)}
    <div className="text-white bg-black p-4" style={{ fontSize: 10 }}>HJSTOREVP · CATÁLOGO · CONTACTO · POLÍTICAS</div>
  </div>
}
