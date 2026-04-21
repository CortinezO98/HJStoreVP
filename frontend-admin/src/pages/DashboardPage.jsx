import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  Package,
  MapPin,
  DollarSign,
  BarChart3,
  Boxes,
} from 'lucide-react'
import {
  analyticsApi,
  inventoryApi,
  physicalSalesApi,
  ordersApi,
} from '../services/api'
import { useAuthStore } from '../store'

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-CO').format(Number(n || 0))
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function MetricCard({ title, value, subtitle, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-2">{subtitle}</p>}
        </div>

        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${tones[tone]}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  )
}

function MiniBarChart({ data = [], valueKey = 'total_sales', labelKey = 'month_name' }) {
  const max = Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1)

  return (
    <div className="flex items-end gap-2 h-56">
      {data.map((item, idx) => {
        const value = Number(item[valueKey] || 0)
        const height = Math.max((value / max) * 100, value > 0 ? 8 : 4)

        return (
          <div key={idx} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-2">
            <div className="text-[10px] text-gray-400 rotate-0 whitespace-nowrap">
              {value > 0 ? formatNumber(value) : ''}
            </div>
            <div
              className="w-full rounded-t-xl bg-brand-600 hover:bg-brand-700 transition-colors"
              style={{ height: `${height}%` }}
              title={`${item[labelKey]}: ${formatCOP(value)}`}
            />
            <div className="text-[11px] text-gray-500">{item[labelKey]}</div>
          </div>
        )
      })}
    </div>
  )
}

function HorizontalBars({ data = [], labelKey, valueKey, formatter = (v) => v }) {
  const max = Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1)

  return (
    <div className="space-y-4">
      {data.map((item, idx) => {
        const value = Number(item[valueKey] || 0)
        const width = Math.max((value / max) * 100, value > 0 ? 6 : 0)

        return (
          <div key={idx}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-sm text-gray-700 font-medium line-clamp-1">
                {item[labelKey]}
              </p>
              <p className="text-xs text-gray-500 shrink-0">{formatter(value)}</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const isAdmin = ['super_admin', 'admin'].includes(user?.role)
  const year = getCurrentYear()

  const [topLimit] = useState(8)
  const [lowRotationDays] = useState(30)

  const { data: dashboard, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => analyticsApi.dashboard().then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: salesByMonth = [], isLoading: loadingSalesByMonth } = useQuery({
    queryKey: ['sales-by-month', year],
    queryFn: () => analyticsApi.salesByMonth(year).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: topProducts = [], isLoading: loadingTopProducts } = useQuery({
    queryKey: ['top-products', topLimit],
    queryFn: () => analyticsApi.topProducts({ limit: topLimit }).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: lowRotation = [], isLoading: loadingLowRotation } = useQuery({
    queryKey: ['low-rotation', lowRotationDays],
    queryFn: () => analyticsApi.lowRotation(lowRotationDays).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: salesByLocation = [], isLoading: loadingSalesByLocation } = useQuery({
    queryKey: ['sales-by-location'],
    queryFn: () => analyticsApi.salesByLocation({}).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: lowStock = [], isLoading: loadingLowStock } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => inventoryApi.lowStock().then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: recentWebOrders = [], isLoading: loadingWebOrders } = useQuery({
    queryKey: ['recent-web-orders-dashboard'],
    queryFn: () => ordersApi.list({}).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: recentPhysicalSales = [], isLoading: loadingPhysicalSales } = useQuery({
    queryKey: ['recent-physical-sales-dashboard'],
    queryFn: () => physicalSalesApi.list({}).then((r) => r.data),
    enabled: isAdmin,
  })

  const monthlyTotals = useMemo(() => {
    const totalYearRevenue = salesByMonth.reduce(
      (acc, item) => acc + Number(item.total_sales || 0),
      0
    )
    const totalYearProfit = salesByMonth.reduce(
      (acc, item) => acc + Number(item.gross_profit || 0),
      0
    )
    return { totalYearRevenue, totalYearProfit }
  }, [salesByMonth])

  const topProductsByRevenue = useMemo(
    () =>
      [...topProducts]
        .sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0))
        .slice(0, 5),
    [topProducts]
  )

  const topLocations = useMemo(
    () =>
      [...salesByLocation]
        .sort((a, b) => Number(b.total_sales || 0) - Number(a.total_sales || 0))
        .slice(0, 5),
    [salesByLocation]
  )

  const lastOrders = useMemo(
    () => [...recentWebOrders].slice(0, 5),
    [recentWebOrders]
  )

  const lastPhysicalSales = useMemo(
    () => [...recentPhysicalSales].slice(0, 5),
    [recentPhysicalSales]
  )

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Este módulo está disponible solo para administradores.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard contable</h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumen comercial y financiero de tienda web + puntos físicos
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          title="Pedidos del mes"
          value={loadingSummary ? '...' : formatNumber(dashboard?.orders_this_month)}
          subtitle="Órdenes pagadas del mes actual"
          icon={ShoppingCart}
          tone="brand"
        />

        <MetricCard
          title="Ingresos del mes"
          value={loadingSummary ? '...' : formatCOP(dashboard?.revenue_this_month)}
          subtitle="Ventas pagadas acumuladas"
          icon={DollarSign}
          tone="green"
        />

        <MetricCard
          title="Ticket promedio"
          value={loadingSummary ? '...' : formatCOP(dashboard?.avg_ticket)}
          subtitle="Promedio por pedido"
          icon={TrendingUp}
          tone="blue"
        />

        <MetricCard
          title="Utilidad bruta del mes"
          value={loadingSummary ? '...' : formatCOP(dashboard?.profit_this_month)}
          subtitle="Ingreso - costo"
          icon={BarChart3}
          tone="green"
        />

        <MetricCard
          title="Alertas de stock"
          value={loadingSummary ? '...' : formatNumber(dashboard?.low_stock_alerts)}
          subtitle="Productos por debajo del mínimo"
          icon={AlertTriangle}
          tone="amber"
        />
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Pedidos pendientes"
          value={loadingSummary ? '...' : formatNumber(dashboard?.pending_orders)}
          subtitle="Requieren seguimiento"
          icon={Clock}
          tone="amber"
        />

        <MetricCard
          title="Ventas del año"
          value={loadingSalesByMonth ? '...' : formatCOP(monthlyTotals.totalYearRevenue)}
          subtitle={`Año ${year}`}
          icon={DollarSign}
          tone="brand"
        />

        <MetricCard
          title="Utilidad del año"
          value={loadingSalesByMonth ? '...' : formatCOP(monthlyTotals.totalYearProfit)}
          subtitle={`Año ${year}`}
          icon={TrendingUp}
          tone="green"
        />
      </div>

      {/* Gráfica ventas por mes */}
      <div className="card">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Ventas por mes</h2>
            <p className="text-xs text-gray-500 mt-1">
              Comportamiento mensual del año actual
            </p>
          </div>
          <div className="text-xs text-gray-400">Año {year}</div>
        </div>

        {loadingSalesByMonth ? (
          <div className="h-56 bg-gray-50 rounded-2xl animate-pulse" />
        ) : (
          <MiniBarChart data={salesByMonth} valueKey="total_sales" labelKey="month_name" />
        )}
      </div>

      {/* Segunda fila de analítica */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="mb-5">
            <h2 className="font-bold text-gray-900">Productos más vendidos</h2>
            <p className="text-xs text-gray-500 mt-1">
              Ordenados por ingresos generados
            </p>
          </div>

          {loadingTopProducts ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : topProductsByRevenue.length === 0 ? (
            <p className="text-sm text-gray-400">No hay datos disponibles</p>
          ) : (
            <HorizontalBars
              data={topProductsByRevenue}
              labelKey="product_name"
              valueKey="total_revenue"
              formatter={(v) => formatCOP(v)}
            />
          )}
        </div>

        <div className="card">
          <div className="mb-5">
            <h2 className="font-bold text-gray-900">Ventas por punto físico / canal</h2>
            <p className="text-xs text-gray-500 mt-1">
              Comparativo por ubicación
            </p>
          </div>

          {loadingSalesByLocation ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : topLocations.length === 0 ? (
            <p className="text-sm text-gray-400">No hay datos disponibles</p>
          ) : (
            <HorizontalBars
              data={topLocations}
              labelKey="location_name"
              valueKey="total_sales"
              formatter={(v) => formatCOP(v)}
            />
          )}
        </div>
      </div>

      {/* Alertas y baja rotación */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={18} className="text-amber-600" />
            <div>
              <h2 className="font-bold text-gray-900">Productos con bajo stock</h2>
              <p className="text-xs text-gray-500 mt-1">
                Prioridad para reposición
              </p>
            </div>
          </div>

          {loadingLowStock ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : lowStock.length === 0 ? (
            <p className="text-sm text-gray-400">No hay alertas de stock por ahora</p>
          ) : (
            <div className="space-y-3">
              {lowStock.slice(0, 6).map((item) => (
                <div
                  key={item.product_id}
                  className="border border-amber-100 bg-amber-50 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 line-clamp-1">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">SKU: {item.sku}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-700">
                      Stock: {item.total_stock}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Mínimo: {item.stock_min_alert}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Package size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Productos de baja rotación</h2>
              <p className="text-xs text-gray-500 mt-1">
                Candidatos a promoción o ajuste
              </p>
            </div>
          </div>

          {loadingLowRotation ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : lowRotation.length === 0 ? (
            <p className="text-sm text-gray-400">No hay productos en baja rotación</p>
          ) : (
            <div className="space-y-3">
              {lowRotation.slice(0, 6).map((item) => (
                <div
                  key={item.product_id}
                  className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 line-clamp-1">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">SKU: {item.sku}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Última venta: {item.last_sale_date ? new Date(item.last_sale_date).toLocaleDateString('es-CO') : 'Sin ventas'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">
                      {formatCOP(item.sale_price)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Stock actual: {item.current_stock}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Últimos movimientos operativos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <ShoppingCart size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Últimos pedidos web</h2>
              <p className="text-xs text-gray-500 mt-1">
                Seguimiento rápido de la tienda
              </p>
            </div>
          </div>

          {loadingWebOrders ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : lastOrders.length === 0 ? (
            <p className="text-sm text-gray-400">No hay pedidos web recientes</p>
          ) : (
            <div className="space-y-3">
              {lastOrders.map((order) => (
                <div
                  key={order.id}
                  className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-gray-700">
                      {order.order_number}
                    </p>
                    <p className="text-sm text-gray-900 mt-1 line-clamp-1">
                      {order.shipping_address?.full_name || 'Cliente web'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {order.shipping_address?.city || 'Sin ciudad'} · {formatDate(order.created_at)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">{formatCOP(order.total_amount)}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <MapPin size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Últimas ventas físicas</h2>
              <p className="text-xs text-gray-500 mt-1">
                Actividad reciente por puntos físicos
              </p>
            </div>
          </div>

          {loadingPhysicalSales ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : lastPhysicalSales.length === 0 ? (
            <p className="text-sm text-gray-400">No hay ventas físicas recientes</p>
          ) : (
            <div className="space-y-3">
              {lastPhysicalSales.map((sale) => (
                <div
                  key={sale.id}
                  className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-gray-700">
                      {sale.order_number}
                    </p>
                    <p className="text-sm text-gray-900 mt-1 line-clamp-1">
                      {sale.location_name || 'Punto físico'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(sale.created_at)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">{formatCOP(sale.total_amount)}</p>
                    <p className="text-xs text-green-700 mt-1">
                      Utilidad: {formatCOP(sale.gross_profit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resumen auxiliar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <Boxes className="text-brand-600" size={18} />
            <div>
              <p className="text-sm text-gray-500">Top productos consultados</p>
              <p className="font-semibold text-gray-900 mt-1">
                {topProducts.length ? `${topProducts.length} registros analizados` : 'Sin datos'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <MapPin className="text-brand-600" size={18} />
            <div>
              <p className="text-sm text-gray-500">Ubicaciones con ventas</p>
              <p className="font-semibold text-gray-900 mt-1">
                {salesByLocation.length ? `${salesByLocation.length} registros` : 'Sin datos'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600" size={18} />
            <div>
              <p className="text-sm text-gray-500">Productos por revisar</p>
              <p className="font-semibold text-gray-900 mt-1">
                {formatNumber((lowStock?.length || 0) + (lowRotation?.length || 0))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}