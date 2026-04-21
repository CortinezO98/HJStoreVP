import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { useAuthStore } from '../../store'
import { apiClient } from '../../services/api'
import toast from 'react-hot-toast'

export default function RegisterPage() {
    const [form, setForm] = useState({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
        phone: '',
    })
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const { login } = useAuthStore()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const next = searchParams.get('next') || '/'

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (form.password !== form.confirm_password) {
        toast.error('Las contraseñas no coinciden')
        return
        }
        if (form.password.length < 8) {
        toast.error('La contraseña debe tener al menos 8 caracteres')
        return
        }

        setLoading(true)
        try {
        // Registrar y hacer login automático
        const { data } = await apiClient.post('/auth/register', {
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            phone: form.phone || undefined,
        })

        // Guardar tokens en el store
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)

        // Actualizar store manualmente (el endpoint register devuelve tokens directamente)
        await login(form.email, form.password)

        toast.success(`Bienvenido/a, ${data.full_name}! 🎉`)
        navigate(next)
        } catch (err) {
        toast.error(err.response?.data?.detail || 'Error al crear la cuenta')
        } finally {
        setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

            {/* Logo */}
            <div className="text-center mb-8">
            <Link to="/" className="inline-block">
                <span className="text-4xl font-black text-white">
                HJ<span className="text-brand-400">Store</span><span className="text-brand-300">VP</span>
                </span>
            </Link>
            <p className="text-gray-400 mt-2">Crea tu cuenta y empieza a comprar</p>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Crear cuenta</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nombre */}
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo *
                </label>
                <input
                    type="text" required
                    value={form.full_name}
                    onChange={e => set('full_name', e.target.value)}
                    placeholder="Juan Pérez"
                    className="input"
                />
                </div>

                {/* Email */}
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correo electrónico *
                </label>
                <input
                    type="email" required
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="tu@correo.com"
                    className="input"
                />
                </div>

                {/* Teléfono */}
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono (opcional)
                </label>
                <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+57 300 000 0000"
                    className="input"
                />
                </div>

                {/* Contraseña */}
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                </label>
                <div className="relative">
                    <input
                    type={showPass ? 'text' : 'password'} required
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="input pr-10"
                    />
                    <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                </div>

                {/* Confirmar contraseña */}
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar contraseña *
                </label>
                <input
                    type={showPass ? 'text' : 'password'} required
                    value={form.confirm_password}
                    onChange={e => set('confirm_password', e.target.value)}
                    placeholder="Repite tu contraseña"
                    className={`input ${
                    form.confirm_password && form.password !== form.confirm_password
                        ? 'border-red-400 focus:ring-red-400'
                        : ''
                    }`}
                />
                {form.confirm_password && form.password !== form.confirm_password && (
                    <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                )}
                </div>

                {/* Submit */}
                <button
                type="submit"
                disabled={loading || (form.confirm_password && form.password !== form.confirm_password)}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base mt-2"
                >
                {loading
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><UserPlus size={18} /> Crear cuenta</>
                }
                </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
                Inicia sesión
                </Link>
            </p>
            </div>

            <p className="text-center text-xs text-gray-500 mt-6">
            <Link to="/" className="hover:text-gray-400 transition-colors">← Volver a la tienda</Link>
            </p>
        </div>
        </div>
    )
}
