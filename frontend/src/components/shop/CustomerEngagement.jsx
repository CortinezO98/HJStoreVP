import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, HeartHandshake, ShoppingCart, BellOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/api'
import { useCartStore } from '../../store'

export default function CustomerEngagement() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const addItem = useCartStore(s=>s.addItem)
  const {data: loyalty, isLoading: pointsLoading} = useQuery({
    queryKey:['my-loyalty'], queryFn:()=>apiClient.get('/engagement/loyalty').then(r=>r.data),
  })
  const {data: preferences, isLoading: consentLoading} = useQuery({
    queryKey:['my-engagement-preferences'],
    queryFn:()=>apiClient.get('/engagement/preferences').then(r=>r.data),
  })
  const {data: savedCart} = useQuery({
    queryKey:['my-saved-cart'], queryFn:()=>apiClient.get('/engagement/cart').then(r=>r.data),
  })
  const [restoring, setRestoring] = useState(false)
  const optIn = useMutation({
    mutationFn:data=>apiClient.put('/engagement/preferences',data),
    onSuccess:()=>{
      client.invalidateQueries({queryKey:['my-engagement-preferences']})
      toast.success('Preferencias guardadas')
    },
    onError:()=>toast.error('No pudimos guardar tus preferencias'),
  })
  const saveConsent = (key, value) => {
    if (!preferences) return
    optIn.mutate({...preferences,[key]:value})
  }
  const restoreCart = async() => {
    if (!savedCart?.items?.length) return
    setRestoring(true)
    let restored=0
    try {
      for (const entry of savedCart.items) {
        const {data: product} = await apiClient.get(`/products/${entry.product_id}`)
        const added = addItem(product, entry.qty)
        if(added)restored += 1
      }
      if(restored) {
        toast.success(`Restaurados ${restored} productos al carrito`)
        navigate('/carrito')
      }else toast.error('Estos productos ya no tienen disponibilidad suficiente')
    }catch{toast.error('Algunos productos no están disponibles. Revisa el catálogo.')}
    finally{setRestoring(false)}
  }
  return <div className="space-y-5" aria-label="Fidelización y comunicación">
    <section className="store-card space-y-4">
      <h2 className="font-black text-lg flex items-center gap-2"><Gift size={20}/> MIS PUNTOS HJSTOREVP</h2>
      {pointsLoading?<p role="status">Consultando puntos…</p>:loyalty?<div>
        <p className="text-3xl font-black">{loyalty.points} <span className="text-sm text-neutral-500">puntos</span></p>
        <p className="text-sm text-neutral-600 mt-2">Nivel {loyalty.tier?.toUpperCase()}</p>
        <p className="text-xs text-neutral-500 mt-3">{loyalty.explanation}</p>
        {!!loyalty.history?.length && <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold">Ver movimientos</summary>
          <ol className="space-y-2 mt-3">
            {loyalty.history.map(entry=><li key={entry.id} className="text-xs flex justify-between gap-2">
              <span>Pedido #{entry.order_id} · {entry.event_type==='earned'?'Compra':'Ajuste por devolución'}</span>
              <strong>{entry.points_delta>0?'+':''}{entry.points_delta}</strong>
            </li>)}
          </ol>
        </details>}
      </div>:<p role="alert" className="text-sm text-red-700">No se pudo cargar el historial de puntos.</p>}
    </section>
    <section className="store-card space-y-4">
      <h2 className="font-black text-lg flex items-center gap-2"><HeartHandshake size={20}/> MIS PREFERENCIAS</h2>
      <p className="text-xs text-neutral-600">Los correos comerciales y recordatorios están desactivados hasta que los autorices. Puedes desactivarlos en cualquier momento.</p>
      {consentLoading?<p role="status">Consultando preferencias…</p>:preferences?<>
        <label className="flex gap-3 items-start text-sm">
          <input type="checkbox" checked={preferences.recovery_email_opt_in} disabled={optIn.isPending}
            onChange={e=>saveConsent('recovery_email_opt_in',e.target.checked)}/>
          <span>Quiero recibir recordatorios por correo si dejo productos en mi carrito.</span>
        </label>
        <label className="flex gap-3 items-start text-sm">
          <input type="checkbox" checked={preferences.marketing_email_opt_in} disabled={optIn.isPending}
            onChange={e=>saveConsent('marketing_email_opt_in',e.target.checked)}/>
          <span>Quiero recibir ofertas y novedades comerciales de HJStoreVP.</span>
        </label>
        <p className="text-xs text-neutral-500 flex items-center gap-2"><BellOff size={14}/> Ninguna campaña se envía automáticamente sin configurar el servicio.</p>
      </>:<p role="alert" className="text-sm text-red-700">No fue posible consultar tus preferencias.</p>}
    </section>
    <section className="store-card space-y-3">
      <h2 className="font-black text-lg flex items-center gap-2"><ShoppingCart size={20}/> CARRITO GUARDADO</h2>
      {savedCart?.items?.length ? <>
        <p className="text-sm text-neutral-600">{savedCart.items.length} referencia(s) guardadas en tu cuenta.</p>
        <ul className="text-sm space-y-1">
          {savedCart.items.slice(0,5).map(item=><li key={item.product_id}>{item.name} × {item.qty}</li>)}
        </ul>
        <button className="store-button store-button-outline w-full" type="button" disabled={restoring}
          onClick={restoreCart}>{restoring?'RESTAURANDO…':'RECUPERAR PRODUCTOS'}</button>
      </> : <>
        <p className="text-sm text-neutral-500">Todavía no tienes un carrito guardado en tu cuenta.</p>
        <Link to="/catalogo" className="store-inline-link text-sm">Explorar catálogo</Link>
      </>}
      <p className="text-xs text-neutral-500">Al restaurar se consultan nuevamente precios y disponibilidad. Guardar productos no reserva existencias.</p>
    </section>
  </div>
}
