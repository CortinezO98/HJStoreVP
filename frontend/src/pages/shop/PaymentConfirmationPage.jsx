import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react'
import { apiClient } from '../../services/api'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(n)
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

        // Esperar 2 segundos para que el webhook de Wompi procese
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
            <h2 className="text-xl font-bold text-gray-700 mb-2">Verificando tu pago...</h2>
            <p className="text-gray-400 text-sm">Por favor espera un momento</p>
        </div>
        )
    }

    if (status === 'paid') {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">¡Pago exitoso!</h1>
            <p className="text-gray-500 mb-1">Tu pedido está confirmado</p>
            <p className="font-mono font-bold text-gray-700 mb-2">{orderNumber}</p>
            {orderData?.total_amount && (
            <p className="text-2xl font-black text-brand-700 mb-8">
                {formatCOP(orderData.total_amount)}
            </p>
            )}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 text-left">
            <p className="text-sm font-semibold text-green-800 mb-1">¿Qué sigue?</p>
            <p className="text-sm text-green-700">
                Procesaremos tu pedido y te notificaremos cuando sea enviado. Puedes seguir el estado en "Mi cuenta".
            </p>
            </div>
            <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">Ir al inicio</Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">Ver mis pedidos</Link>
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago en proceso</h1>
            <p className="text-gray-500 mb-8">
            Tu pago está siendo procesado. Te notificaremos cuando se confirme.
            </p>
            <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">Ir al inicio</Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">Ver mi pedido</Link>
            </div>
        </div>
        )
    }

    if (status === 'cancelled') {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle size={40} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago no completado</h1>
            <p className="text-gray-500 mb-8">
            El pago fue cancelado o declinado. Puedes intentarlo nuevamente.
            </p>
            <div className="flex gap-3">
            <Link to="/carrito" className="btn-secondary flex-1">Volver al carrito</Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">Ver mis pedidos</Link>
            </div>
        </div>
        )
    }

    return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">No se encontró información del pago.</p>
        <Link to="/" className="btn-primary inline-block mt-4">Ir al inicio</Link>
        </div>
    )
}
