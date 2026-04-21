import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react'
import { apiClient } from '../../services/api'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(Number(n || 0))
}

export default function PaymentConfirmationPage() {
    const [searchParams] = useSearchParams()
    const orderNumber = searchParams.get('order')

    const [status, setStatus] = useState('loading')
    const [orderData, setOrderData] = useState(null)

    useEffect(() => {
        if (!orderNumber) {
        setStatus('error')
        return
        }

        const timer = setTimeout(async () => {
        try {
            const { data } = await apiClient.get(`/payments/status/${orderNumber}`)
            setOrderData(data)

            if (data.status === 'paid') {
            setStatus('paid')
            } else if (data.status === 'cancelled') {
            setStatus('cancelled')
            } else {
            setStatus('pending')
            }
        } catch {
            setStatus('error')
        }
        }, 2000)

        return () => clearTimeout(timer)
    }, [orderNumber])

    if (status === 'loading') {
        return (
        <div className="max-w-lg mx-auto px-4 py-24 text-center">
            <Loader size={48} className="text-brand-500 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-700 mb-2">
            Verificando tu pago...
            </h2>
            <p className="text-gray-400 text-sm">
            Por favor espera un momento
            </p>
        </div>
        )
    }

    if (status === 'paid') {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
            </div>

            <h1 className="text-3xl font-black text-gray-900 mb-2">
            ¡Pago exitoso!
            </h1>
            <p className="text-gray-500 mb-1">Tu pedido está confirmado</p>
            <p className="font-mono font-bold text-gray-700 mb-2">
            {orderNumber}
            </p>

            {orderData?.total_amount && (
            <p className="text-2xl font-black text-brand-700 mb-8">
                {formatCOP(orderData.total_amount)}
            </p>
            )}

            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left mb-8">
            <p className="text-sm text-green-800 font-medium mb-1">
                Estado del pedido: Pagado
            </p>
            <p className="text-sm text-green-700">
                Hemos recibido tu pago correctamente y tu pedido seguirá el flujo normal de preparación.
            </p>
            </div>

            <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">
                Ir al inicio
            </Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">
                Ver mis pedidos
            </Link>
            </div>
        </div>
        )
    }

    if (status === 'pending') {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock size={40} className="text-amber-600" />
            </div>

            <h1 className="text-3xl font-black text-gray-900 mb-2">
            Pago en validación
            </h1>
            <p className="text-gray-500 mb-1">
            Tu transacción todavía está siendo procesada
            </p>
            <p className="font-mono font-bold text-gray-700 mb-2">
            {orderNumber}
            </p>

            {orderData?.total_amount && (
            <p className="text-2xl font-black text-brand-700 mb-8">
                {formatCOP(orderData.total_amount)}
            </p>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left mb-8">
            <p className="text-sm text-amber-800 font-medium mb-1">
                Estado del pedido: Pendiente
            </p>
            <p className="text-sm text-amber-700">
                En algunos casos el proveedor de pago puede tardar unos minutos en confirmar la transacción.
                Revisa nuevamente en “Mi cuenta” o vuelve a esta página más tarde.
            </p>
            </div>

            <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">
                Ir al inicio
            </Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">
                Ver mis pedidos
            </Link>
            </div>
        </div>
        )
    }

    if (status === 'cancelled') {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle size={40} className="text-red-600" />
            </div>

            <h1 className="text-3xl font-black text-gray-900 mb-2">
            Pago cancelado
            </h1>
            <p className="text-gray-500 mb-1">
            La transacción no fue completada
            </p>
            <p className="font-mono font-bold text-gray-700 mb-8">
            {orderNumber}
            </p>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-left mb-8">
            <p className="text-sm text-red-800 font-medium mb-1">
                Estado del pedido: Cancelado
            </p>
            <p className="text-sm text-red-700">
                Puedes volver al carrito o iniciar nuevamente el proceso de compra cuando quieras.
            </p>
            </div>

            <div className="flex gap-3">
            <Link to="/carrito" className="btn-secondary flex-1">
                Volver al carrito
            </Link>
            <Link to="/catalogo" className="btn-primary flex-1">
                Seguir comprando
            </Link>
            </div>
        </div>
        )
    }

    return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle size={40} className="text-gray-500" />
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">
            No pudimos verificar tu pago
        </h1>
        <p className="text-gray-500 mb-2">
            Ocurrió un problema al consultar el estado de la transacción
        </p>

        {orderNumber && (
            <p className="font-mono font-bold text-gray-700 mb-8">
            {orderNumber}
            </p>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left mb-8">
            <p className="text-sm text-gray-800 font-medium mb-1">
            ¿Qué puedes hacer ahora?
            </p>
            <p className="text-sm text-gray-600">
            Intenta revisar en “Mi cuenta” si el pedido aparece actualizado o comunícate con soporte si el problema persiste.
            </p>
        </div>

        <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">
            Ir al inicio
            </Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">
            Ver mis pedidos
            </Link>
        </div>
        </div>
    )
}