import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../services/api'
import { Activity, AlertTriangle, Download, Package, RefreshCw, Truck } from 'lucide-react'

const COP = value => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0))

// Protege Excel/LibreOffice contra ejecución de fórmulas en nombres y SKU.
function csvCell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[\s\t\r\n]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCSV(rows, name) {
  if (!rows.length) return
  const columns = Object.keys(rows[0])
  const content = '\uFEFF' + [
    columns.map(csvCell).join(','),
    ...rows.map(row => columns.map(key => csvCell(row[key])).join(',')),
  ].join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function Metric({ label, value, detail }) {
  return <div className="rounded-xl border border-slate-200 p-4 bg-white">
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="text-xl font-black text-slate-900 mt-2">{value}</p>
    {detail && <p className="text-xs text-slate-500 mt-2">{detail}</p>}
  </div>
}

const SHIPMENT_LABEL = {
  dispatched: 'Despachado', in_transit: 'En tránsito',
  out_for_delivery: 'En reparto', delivered: 'Entregado',
  exception: 'Incidencia',
}

export default function OperationalAnalytics() {
  const [period, setPeriod] = useState({ date_from: '', date_to: '' })
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['operational-report', period.date_from, period.date_to],
    queryFn: () => apiClient.get('/operational-analytics/overview', {
      params: {
        ...(period.date_from ? { date_from: period.date_from } : {}),
        ...(period.date_to ? { date_to: period.date_to } : {}),
      },
    }).then(r => r.data),
  })
  const sale = data?.sales
  const operations = data?.operations
  const shipment = operations?.shipments_by_current_status || {}
  const postSale = operations?.post_sale_by_status || {}
  const openCases = ['submitted', 'under_review', 'approved', 'received'].reduce(
    (sum, status) => sum + (postSale[status] || 0), 0
  )
  return <section className="space-y-5" aria-labelledby="operational-title">
    <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
      <div>
        <p className="text-xs tracking-widest font-bold text-slate-500">NUEVA VISTA · REPORTERÍA OPERATIVA</p>
        <h2 id="operational-title" className="font-black tracking-tight text-2xl mt-2">
          Indicadores operativos
        </h2>
        <p className="text-sm text-slate-500 mt-1">Ventas cobradas, entregas, casos posventa y existencias actuales.</p>
      </div>
      <button type="button" className="btn-secondary flex items-center gap-2 self-start"
        onClick={()=>refetch()}><RefreshCw size={17}/> Actualizar</button>
    </div>
    <div className="card space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-bold mb-2" htmlFor="operational-from">Desde</label>
          <input className="input" id="operational-from" type="date"
            value={period.date_from} max={period.date_to || undefined}
            onChange={e=>setPeriod(p=>({...p,date_from:e.target.value}))}/></div>
        <div><label className="block text-xs font-bold mb-2" htmlFor="operational-to">Hasta</label>
          <input className="input" id="operational-to" type="date"
            value={period.date_to} min={period.date_from || undefined}
            onChange={e=>setPeriod(p=>({...p,date_to:e.target.value}))}/></div>
      </div>
      <p className="text-xs text-slate-500">
        Este período es independiente de los filtros del reporte contable original.
        Las ventas usan fecha de pago; los despachos, fecha de despacho;
        las solicitudes posventa, fecha de registro.
      </p>
    </div>
    {isLoading ? <p role="status" className="text-sm text-slate-500 p-5">Calculando métricas…</p> :
      isError ? <div role="alert" className="p-5 bg-red-50 text-red-700">
        No se pudieron consultar los indicadores.
        <button type="button" className="underline ml-2" onClick={()=>refetch()}>Reintentar</button>
      </div> : data ? <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric label="Ingresos de ventas cobradas" value={COP(sale.gross_cop)}
            detail={`${sale.orders_paid} pedidos con pago confirmado`}/>
          <Metric label="Costo registrado de esas ventas" value={COP(sale.cost_cop)}
            detail="Costo histórico del pedido, sin gastos externos"/>
          <Metric label="Margen bruto indicativo" value={COP(sale.gross_margin_before_fees_cop)}
            detail="Antes de comisiones, devoluciones y otros gastos"/>
          <Metric label="Reembolsos externos documentados" value={COP(sale.recorded_external_refunds_cop)}
            detail={`${sale.recorded_external_refunds_count} registros, sin conciliación con pasarela`}/>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card space-y-4">
            <h3 className="font-bold flex items-center gap-2"><Activity size={19}/> Canales comerciales</h3>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Ventas web" value={COP(sale.by_channel.web.gross_cop)}
                detail={`${sale.by_channel.web.orders} pedidos`}/>
              <Metric label="Ventas físicas" value={COP(sale.by_channel.physical.gross_cop)}
                detail={`${sale.by_channel.physical.orders} ventas`}/>
            </div>
            <p className="text-xs text-slate-500">
              Valor de envíos cobrado en ventas: {COP(sale.shipping_charged_cop)}.
              No se interpreta como utilidad neta.
            </p>
          </div>
          <div className="card space-y-4">
            <h3 className="font-bold flex items-center gap-2"><Truck size={19}/> Despachos y posventa</h3>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pedidos web pendientes" value={operations.pending_web_orders}/>
              <Metric label="Casos abiertos en período" value={operations.post_sale_opened}
                detail={`${openCases} casos aún en flujo operativo`}/>
              <Metric label="Despachos del período" value={operations.shipments_registered}/>
              <Metric label="Productos con stock bajo" value={operations.low_stock_products}/>
            </div>
            {Object.keys(shipment).length>0 && <div className="text-sm space-y-2 pt-2 border-t border-slate-200">
              {Object.entries(shipment).map(([status,count])=>
                <div key={status} className="flex justify-between">
                  <span className="text-slate-600">{SHIPMENT_LABEL[status]||status}</span><strong>{count}</strong>
                </div>)}
            </div>}
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card space-y-3">
            <div className="flex justify-between gap-2 items-center">
              <h3 className="font-bold flex items-center gap-2"><Package size={19}/> Productos más vendidos</h3>
              <button type="button" className="btn-secondary inline-flex gap-2 items-center"
                onClick={()=>downloadCSV(data.top_products,'productos_operativos')}
                disabled={!data.top_products.length}><Download size={15}/> CSV</button>
            </div>
            {!data.top_products.length ? <p className="text-sm text-slate-500">Sin ventas cobradas para este período.</p> :
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[390px]">
              <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Unidades</th><th className="p-2">Venta</th></tr></thead>
              <tbody>{data.top_products.map((item,index)=><tr key={`${item.product_id}-${index}`} className="border-b border-slate-100">
                <td className="p-2"><strong>{item.name}</strong><p className="text-xs text-slate-500">{item.sku}</p></td>
                <td className="p-2">{item.units}</td><td className="p-2">{COP(item.sales_cop)}</td>
              </tr>)}</tbody>
            </table></div>}
          </div>
          <div className="card space-y-3">
            <div className="flex justify-between gap-2 items-center">
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={19}/> Alertas de inventario</h3>
              <button type="button" className="btn-secondary inline-flex gap-2 items-center"
                onClick={()=>downloadCSV(data.low_stock,'alertas_inventario')}
                disabled={!data.low_stock.length}><Download size={15}/> CSV</button>
            </div>
            {!data.low_stock.length ? <p className="text-sm text-slate-500">Sin productos bajo su mínimo.</p> :
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[390px]">
              <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Disponible</th><th className="p-2">Mínimo</th></tr></thead>
              <tbody>{data.low_stock.map(item=><tr key={item.product_id} className="border-b border-slate-100">
                <td className="p-2"><strong>{item.name}</strong><p className="text-xs text-slate-500">{item.sku}</p></td>
                <td className="p-2">{item.available}</td><td className="p-2">{item.minimum}</td>
              </tr>)}</tbody>
            </table></div>}
            {operations.low_stock_products>data.low_stock.length &&
              <p className="text-xs text-slate-500">Se muestran los 30 productos con mayor alerta.</p>}
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-6 p-4 border border-slate-200">
          {data.disclaimer}
        </p>
      </> : null}
  </section>
}
