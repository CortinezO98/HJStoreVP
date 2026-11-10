import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileCheck2, ShieldAlert, Save, Search, Calculator } from 'lucide-react'
import toast from 'react-hot-toast'
import { taxReadinessApi, productsApi } from '../services/api'

const EMPTY = {
  legal_name: '', tax_id: '', verification_digit: '', person_type: 'juridica',
  tax_regime: '', fiscal_responsibilities: '', economic_activities: '',
  fiscal_address: '', city: '', department: '', contact_email: '',
  operation_mode: 'pending', provider_name: '',
}
const MODES = {
  pending: 'Por seleccionar',
  free_dian: 'Facturación Gratuita DIAN',
  own_software: 'Desarrollo propio',
  tech_provider: 'Proveedor tecnológico habilitado',
}
const TREATMENTS = {
  pending: 'Sin clasificar', taxed: 'Gravado', exempt: 'Exento',
  excluded: 'Excluido', not_subject: 'No sujeto',
}
const REQUIRED_CHECKS = {
  issuer_profile: 'Datos fiscales del emisor',
  operation_mode_selected: 'Modalidad de operación seleccionada',
  all_active_products_classified: 'Productos clasificados y revisados por contador',
  dian_provider_verified: 'Proveedor o modalidad habilitada',
  certificate_configured: 'Certificado de firma verificado',
  authorized_numbering_verified: 'Numeración autorizada',
  dian_habilitation_verified: 'Habilitación DIAN comprobada',
  real_invoice_issuance_enabled: 'Emisión electrónica autorizada',
}
function textOrEmpty(value) { return value == null ? '' : String(value) }
function fromApi(raw) {
  if (!raw) return EMPTY
  return {
    ...EMPTY, ...raw,
    fiscal_responsibilities: (raw.fiscal_responsibilities || []).join(', '),
    economic_activities: (raw.economic_activities || []).join(', '),
    verification_digit: raw.verification_digit || '',
    provider_name: raw.provider_name || '',
  }
}
function csvCodes(text) {
  return text.split(',').map(value=>value.trim()).filter(Boolean)
}
function IssuerForm({ current, onSaved }) {
  const [form, setForm] = useState(() => fromApi(current))
  const mutate = useMutation({
    mutationFn: payload => taxReadinessApi.saveIssuer(payload),
    onSuccess: () => { toast.success('Perfil fiscal guardado como borrador'); onSaved() },
    onError: err => {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar el perfil')
    },
  })
  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const submit = event => {
    event.preventDefault()
    mutate.mutate({
      ...form,
      legal_name: form.legal_name.trim(),
      tax_id: form.tax_id.trim(),
      verification_digit: form.verification_digit.trim() || null,
      fiscal_responsibilities: csvCodes(form.fiscal_responsibilities),
      economic_activities: csvCodes(form.economic_activities),
      tax_regime: form.tax_regime.trim(), fiscal_address: form.fiscal_address.trim(),
      city: form.city.trim(), department: form.department.trim(),
      contact_email: form.contact_email.trim(),
      provider_name: form.provider_name.trim() || null,
    })
  }
  const fields = [
    ['legal_name', 'Razón social o nombre legal', 'text', true],
    ['tax_id', 'NIT / identificación tributaria (sin DV)', 'text', true],
    ['verification_digit', 'Dígito de verificación (si aplica)', 'text', false],
    ['tax_regime', 'Régimen tributario (según RUT)', 'text', true],
    ['fiscal_responsibilities', 'Responsabilidades RUT (separadas por coma)', 'text', true],
    ['economic_activities', 'Actividades económicas CIIU (separadas por coma)', 'text', true],
    ['fiscal_address', 'Dirección fiscal', 'text', true],
    ['city', 'Municipio fiscal', 'text', true],
    ['department', 'Departamento fiscal', 'text', true],
    ['contact_email', 'Correo registrado de facturación', 'email', true],
  ]
  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map(([name, label, type, required]) =>
        <div key={name} className={name==='fiscal_address' ? 'md:col-span-2' : ''}>
          <label className="block font-semibold text-xs mb-2" htmlFor={name}>{label}</label>
          <input id={name} type={type} required={required} className="input"
            value={textOrEmpty(form[name])} onChange={e=>set(name,e.target.value)} />
        </div>
      )}
      <div>
        <label className="block font-semibold text-xs mb-2" htmlFor="person_type">Tipo de persona</label>
        <select id="person_type" className="input" value={form.person_type}
          onChange={e=>set('person_type',e.target.value)}>
          <option value="juridica">Jurídica</option><option value="natural">Natural</option>
        </select>
      </div>
      <div>
        <label className="block font-semibold text-xs mb-2" htmlFor="operation_mode">Modo previsto de facturación</label>
        <select id="operation_mode" className="input" value={form.operation_mode}
          onChange={e=>set('operation_mode',e.target.value)}>
          {Object.entries(MODES).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {form.operation_mode === 'tech_provider' &&
        <div className="md:col-span-2">
          <label className="block font-semibold text-xs mb-2" htmlFor="provider_name">Proveedor propuesto</label>
          <input id="provider_name" className="input" value={form.provider_name}
            required onChange={e=>set('provider_name',e.target.value)} />
        </div>}
    </div>
    <button type="submit" disabled={mutate.isPending} className="btn-primary inline-flex items-center gap-2">
      <Save size={17}/>{mutate.isPending ? 'Guardando…' : 'Guardar configuración preliminar'}
    </button>
    <p className="text-xs text-slate-500">Completar este formulario no significa que el comercio esté habilitado por la DIAN. La clasificación debe ser revisada con el RUT y por el responsable tributario.</p>
  </form>
}
function ProductClassification({ product, saved, onSaved }) {
  const [treatment, setTreatment] = useState(saved?.tax_treatment || 'pending')
  const [taxRate, setTaxRate] = useState(saved?.tax_rate || '')
  const [tariffCode, setTariffCode] = useState(saved?.tariff_code || '')
  const [note, setNote] = useState(saved?.accounting_note || '')
  const [reviewed, setReviewed] = useState(Boolean(saved?.reviewed_by_accountant))
  const mutation = useMutation({
    mutationFn: () => taxReadinessApi.saveProductTax(product.id, {
      tax_treatment: treatment,
      tariff_code: tariffCode.trim() || null,
      tax_rate: treatment === 'taxed' ? Number(taxRate) : null,
      accounting_note: note.trim() || null,
      reviewed_by_accountant: reviewed,
    }),
    onSuccess: () => { toast.success('Clasificación guardada'); onSaved() },
    onError: () => toast.error('No se pudo guardar la clasificación tributaria'),
  })
  return <form className="border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={e=>{e.preventDefault();mutation.mutate()}}>
    <div className="sm:col-span-2">
      <p className="font-bold">{product.name}</p><p className="text-xs text-slate-500">SKU: {product.sku} · ID {product.id}</p>
    </div>
    <div><label htmlFor={`tax-treatment-${product.id}`} className="text-xs font-semibold block mb-1">Tratamiento (revisar con contador)</label>
      <select id={`tax-treatment-${product.id}`} className="input" value={treatment}
        onChange={e=>{setTreatment(e.target.value);setReviewed(false)}}>
        {Object.entries(TREATMENTS).map(([key,value])=><option key={key} value={key}>{value}</option>)}
      </select></div>
    <div><label htmlFor={`tax-rate-${product.id}`} className="text-xs font-semibold block mb-1">Tasa % (solo gravado)</label>
      <input id={`tax-rate-${product.id}`} type="number" min="0" max="100" step="0.0001" className="input"
        disabled={treatment !== 'taxed'} required={treatment === 'taxed'}
        value={treatment==='taxed'?taxRate:''} onChange={e=>{setTaxRate(e.target.value);setReviewed(false)}} /></div>
    <div><label htmlFor={`tax-code-${product.id}`} className="text-xs font-semibold block mb-1">Clasificación/código tributario (opcional)</label>
      <input id={`tax-code-${product.id}`} className="input" value={tariffCode} maxLength={40}
        onChange={e=>{setTariffCode(e.target.value);setReviewed(false)}} /></div>
    <div><label htmlFor={`tax-note-${product.id}`} className="text-xs font-semibold block mb-1">Observación fiscal</label>
      <input id={`tax-note-${product.id}`} className="input" value={note} maxLength={500}
        onChange={e=>{setNote(e.target.value);setReviewed(false)}} /></div>
    <label className="sm:col-span-2 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
      Clasificación revisada con el contador
    </label>
    <button className="btn-secondary sm:col-span-2" type="submit" disabled={mutation.isPending}>
      {mutation.isPending ? 'Guardando…' : 'Guardar clasificación'}
    </button>
  </form>
}

export default function TaxReadinessPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const {data: issuer, isLoading: loadingIssuer} = useQuery({
    queryKey: ['tax-issuer'], queryFn: () => taxReadinessApi.issuer().then(r=>r.data),
  })
  const {data: readiness, isLoading: loadingReadiness} = useQuery({
    queryKey: ['tax-readiness'], queryFn: () => taxReadinessApi.readiness().then(r=>r.data),
  })
  const {data: classified = []} = useQuery({
    queryKey: ['tax-products'], queryFn: () => taxReadinessApi.products().then(r=>r.data),
  })
  const {data: catalog} = useQuery({
    queryKey: ['tax-catalog'], queryFn: () => productsApi.list({page:1,per_page:100}),
  })
  const list = Array.isArray(catalog?.data) ? catalog.data
    : catalog?.data?.items || catalog?.data?.products || []
  const visible = list.filter(item => String(item.name||'').toLowerCase().includes(search.toLowerCase())).slice(0,30)
  const refresh = () => {
    queryClient.invalidateQueries({queryKey:['tax-issuer']})
    queryClient.invalidateQueries({queryKey:['tax-readiness']})
    queryClient.invalidateQueries({queryKey:['tax-products']})
  }
  return <div className="space-y-6">
    <header><p className="admin-dashboard-overline">PREPARACIÓN TRIBUTARIA</p>
      <h1 className="font-black text-3xl tracking-tight">Configuración DIAN</h1>
      <p className="text-sm text-slate-500 mt-2">Datos del emisor, régimen fiscal y clasificación de productos. Emisión electrónica deshabilitada.</p>
    </header>
    <div className="p-4 border border-amber-200 bg-amber-50 flex gap-3 text-sm text-amber-900">
      <ShieldAlert size={20} className="shrink-0"/>
      <p><strong>No se emiten facturas.</strong> Esta pantalla es una preparación administrativa.
        No conecta con DIAN, no transmite XML, no firma ni obtiene CUFE/CUDE o numeración fiscal.</p>
    </div>
    <section className="card space-y-4">
      <div className="flex gap-2 items-center"><FileCheck2 size={20}/><h2 className="font-bold text-xl">Estado de preparación</h2></div>
      {loadingReadiness ? <p role="status">Consultando requisitos…</p> : readiness ? <>
        <p className="text-sm font-semibold">Productos revisados: {readiness.classified_products} de {readiness.active_products}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(REQUIRED_CHECKS).map(([key,label]) => <div key={key} className="flex items-start gap-2 text-sm py-2">
            <span className={readiness.checks?.[key] ? 'text-emerald-700' : 'text-amber-700'} aria-hidden="true">
              {readiness.checks?.[key] ? '✓' : '○'}
            </span><span>{label}</span>
          </div>)}
        </div>
        <p className="text-xs text-slate-500">La emisión permanece bloqueada incluso cuando completes todos los campos preliminares.</p>
      </> : <p role="alert">No fue posible consultar la preparación DIAN.</p>}
    </section>
    <section className="card space-y-5">
      <h2 className="font-bold text-xl">Datos fiscales del emisor</h2>
      {loadingIssuer ? <p role="status">Cargando perfil…</p> : <IssuerForm key={issuer?.id || 'new'} current={issuer} onSaved={refresh}/>}
    </section>
    <section className="card space-y-4">
      <div className="flex items-center gap-2"><Calculator size={20}/><h2 className="font-bold text-xl">Tratamiento tributario por producto</h2></div>
      <p className="text-sm text-slate-600">Estas clasificaciones son preparatorias: no modifican el precio de venta, pedidos ni impuestos liquidados.</p>
      <div className="relative"><Search size={16} className="absolute top-3 left-3 text-slate-400"/>
        <input className="input pl-9" aria-label="Buscar producto" placeholder="Buscar producto…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map(product=><ProductClassification key={product.id} product={product}
          saved={classified.find(x=>x.product_id===product.id)} onSaved={refresh}/>)}
      </div>
      <p className="text-xs text-slate-500">Se muestran hasta 30 productos del primer lote de catálogo. La clasificación completa y paginación se ampliarán antes de producción.</p>
    </section>
  </div>
}
