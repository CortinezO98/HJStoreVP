import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'
import {
  ShoppingBag, TrendingUp, AlertTriangle,
  Clock, DollarSign, Package
} from 'lucide-react'
import { analyticsApi } from '../services/api'

function formatCOP(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function KPICard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const year = new Date().getFullYear()

  const { data: summary, isLoading: loadingSum } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => analyticsApi.dashboard().then((r) => r.data),
  })

  const { data: salesByMonth, isLoading: loadingChart } = useQuery({
    queryKey: ['analytics', 'sales-month', year],
    queryFn: () => analyticsApi.salesByMonth(year).then((r) => r.data),
  })

  const { data: topProducts } = useQuery({
    queryKey: ['analytics', 'top-products'],
    queryFn: () => analyticsApi.topProducts({ limit: 5 }).then((r) => r.data),
  })

  const { data: lowStock } = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => analyticsApi.lowRotation(30).then((r) => r.data),
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen del mes actual</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <KPICard
          title="Ventas del mes"
          value={loadingSum ? '...' : formatCOP(summary?.revenue_this_month || 0)}
          sub="Ingresos totales"
          icon={DollarSign}
          color="bg-brand-600"
        />
        <KPICard
          title="Pedidos del mes"
          value={loadingSum ? '...' : summary?.orders_this_month || 0}
          sub={`Ticket promedio: ${formatCOP(summary?.avg_ticket || 0)}`}
          icon={ShoppingBag}
          color="bg-green-500"
        />
        <KPICard
          title="Ganancia bruta"
          value={loadingSum ? '...' : formatCOP(summary?.profit_this_month || 0)}
          sub="Ingresos menos costos"
          icon={TrendingUp}
          color="bg-purple-500"
        />
        <KPICard
          title="Pedidos pendientes"
          value={loadingSum ? '...' : summary?.pending_orders || 0}
          sub={`${summary?.low_stock_alerts || 0} alertas de stock`}
          icon={Clock}
          color="bg-amber-500"
        />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Ventas por mes */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4">Ventas por mes — {year}</h2>
          {loadingChart ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={salesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCOP(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v, name) => [formatCOP(v), name === 'total_sales' ? 'Ventas' : 'Ganancia']}
                  labelFormatter={(l) => `Mes: ${l}`}
                />
                <Legend formatter={(v) => v === 'total_sales' ? 'Ventas' : 'Ganancia'} />
                <Line type="monotone" dataKey="total_sales" stroke="#3a3fec" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gross_profit" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top productos */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4">Top 5 productos más vendidos</h2>
          {topProducts ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={(v) => formatCOP(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="product_name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatCOP(v)} />
                <Bar dataKey="total_revenue" fill="#3a3fec" radius={[0, 4, 4, 0]} name="Ingresos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
              Sin datos disponibles
            </div>
          )}
        </div>
      </div>

      {/* Alertas de baja rotación */}
      {lowStock?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-bold text-gray-900">Productos sin ventas (últimos 30 días)</h2>
            <span className="badge-yellow ml-auto">{lowStock.length} productos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Producto</th>
                  <th className="text-left py-2 text-gray-500 font-medium">SKU</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Precio venta</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Stock actual</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Última venta</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.slice(0, 8).map((p) => (
                  <tr key={p.product_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-900">{p.product_name}</td>
                    <td className="py-2.5 text-gray-500 font-mono text-xs">{p.sku}</td>
                    <td className="py-2.5 text-right">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.sale_price)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={p.current_stock <= 5 ? 'badge-red' : 'badge-yellow'}>
                        {p.current_stock} uds
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-400 text-xs">
                      {p.last_sale_date ? new Date(p.last_sale_date).toLocaleDateString('es-CO') : 'Sin ventas'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
