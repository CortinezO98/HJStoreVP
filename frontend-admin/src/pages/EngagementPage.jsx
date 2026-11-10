import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../services/api'
import { HeartHandshake, ShoppingCart, Mail, Users, RefreshCw, ShieldAlert } from 'lucide-react'

export default function EngagementPage() {
  const {data, isLoading, isError, refetch} = useQuery({
    queryKey:['engagement-overview'],
    queryFn:()=>apiClient.get('/engagement/admin/overview').then(r=>r.data),
  })
  const cards = data ? [
    {label:'Carritos guardados con productos',value:data.saved_carts_with_items,icon:ShoppingCart},
    {label:'Clientes que aceptaron recordatorios',value:data.customers_with_recovery_consent,icon:Mail},
    {label:'Recordatorios programados',value:data.recovery_scheduled,icon:RefreshCw},
    {label:'Recordatorios aceptados por SMTP',value:data.recovery_sent,icon:Mail},
    {label:'Clientes con movimientos de puntos',value:data.loyalty_members,icon:Users},
    {label:'Puntos registrados (neto)',value:data.loyalty_points_issued_net,icon:HeartHandshake},
  ] : []
  return <main className="space-y-6">
    <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
      <div>
        <p className="admin-dashboard-overline">RETENCIÓN Y EXPERIENCIA</p>
        <h1 className="text-3xl font-black tracking-tight">Fidelización y carritos</h1>
        <p className="text-sm text-slate-500 mt-2">Indicadores operativos agregados, sin exponer carritos individuales ni información personal de los clientes.</p>
      </div>
      <button type="button" onClick={()=>refetch()} className="btn-secondary inline-flex items-center gap-2 self-start">
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>
    <div className="bg-amber-50 border border-amber-200 p-4 flex gap-3 text-amber-900 text-sm">
      <ShieldAlert className="shrink-0" size={20}/>
      <p><strong>Envíos deshabilitados por defecto.</strong> Los mensajes de recuperación requieren aceptación expresa del cliente y activación independiente del proceso SMTP. Los puntos aún no se pueden canjear por descuentos.</p>
    </div>
    {isLoading ? <p role="status" className="p-8 text-slate-500">Cargando métricas…</p>
      : isError ? <div role="alert" className="p-5 text-red-700">
        No fue posible consultar la fidelización.
        <button className="underline ml-2" type="button" onClick={()=>refetch()}>Reintentar</button>
      </div>
      : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(card=>{
          const Icon=card.icon
          return <div className="card" key={card.label}>
            <div className="flex gap-2 items-center text-xs font-bold text-slate-500"><Icon size={17}/>{card.label}</div>
            <p className="text-3xl font-black mt-4">{Number(card.value||0).toLocaleString('es-CO')}</p>
          </div>
        })}
      </div>}
    {data && <p className="text-xs text-slate-500 leading-6">{data.disclaimer}</p>}
    <section className="card space-y-3 text-sm">
      <h2 className="text-lg font-bold">Cómo funciona</h2>
      <p>Los productos de un carrito autenticado se guardan como referencias y cantidades, no como pedidos ni reservas de stock. El comprador puede restaurarlos en Mi cuenta y confirmar los precios actuales.</p>
      <p>Los recordatorios se preparan tras 24 horas sin cambios. Solo podrán enviarse a clientes que aceptaron esa comunicación; como máximo una vez por semana por cliente, sujeto a disponibilidad del servicio.</p>
      <p>La fidelización asigna un punto por cada $1.000 COP de artículos pagados después del descuento, excluyendo envío. Se registran ajustes cuando se documentan devoluciones externas. El canje está deshabilitado hasta definir reglas comerciales.</p>
    </section>
  </main>
}
