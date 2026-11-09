import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import AuthShell from '../../components/shop/AuthShell'
import { useAuthStore } from '../../store'

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm_password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((state) => state.register)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/mi-cuenta'
  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    if (form.password !== form.confirm_password) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72) {
      toast.error('Usa entre 8 y 72 bytes para tu contraseña')
      return
    }
    setLoading(true)
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      })
      setForm((previous) => ({ ...previous, password: '', confirm_password: '' }))
      toast.success('Tu cuenta está lista')
      navigate(next, { replace: true })
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No pudimos crear tu cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell eyebrow="ÚNETE A HJSTOREVP" headline={<>TU ESTILO<br/>COMIENZA AQUÍ.</>}
      description="Crea una cuenta para consultar tus pedidos y vivir una experiencia de compra más sencilla.">
      <div className="store-auth-card">
        <UserPlus size={24} strokeWidth={1.5} aria-hidden="true" className="mb-5" />
        <h1>CREAR CUENTA</h1>
        <p className="store-muted">Solo necesitamos unos datos para comenzar.</p>
        <form onSubmit={submit}>
          <div>
            <label className="store-label" htmlFor="register-name">Nombre completo</label>
            <input className="store-input" id="register-name" name="name" autoComplete="name" required maxLength={200}
              value={form.full_name} onChange={(event) => setField('full_name', event.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <label className="store-label" htmlFor="register-email">Correo electrónico</label>
            <input className="store-input" type="email" id="register-email" name="email"
              autoComplete="email" autoCapitalize="none" spellCheck="false" required maxLength={254}
              value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="tu@correo.com" />
          </div>
          <div>
            <label className="store-label" htmlFor="register-phone">Teléfono (opcional)</label>
            <input className="store-input" id="register-phone" type="tel" name="tel" autoComplete="tel"
              value={form.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="Tu teléfono" />
          </div>
          <div>
            <label className="store-label" htmlFor="register-password">Contraseña</label>
            <div className="relative">
              <input className="store-input pr-14" id="register-password" name="new-password"
                type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required
                value={form.password} onChange={(event) => setField('password', event.target.value)} placeholder="Mínimo 8 caracteres" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center"
                aria-label={showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} aria-pressed={showPassword}
                onClick={() => setShowPassword((previous) => !previous)}>
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="store-label" htmlFor="register-confirm">Confirmar contraseña</label>
            <input className="store-input" id="register-confirm" type={showPassword ? 'text' : 'password'}
              name="confirm-password" autoComplete="new-password" required
              aria-invalid={Boolean(form.confirm_password && form.confirm_password !== form.password)}
              value={form.confirm_password} onChange={(event) => setField('confirm_password', event.target.value)}
              placeholder="Repite tu contraseña" />
            {form.confirm_password && form.password !== form.confirm_password &&
              <p className="text-xs text-red-700 mt-2" role="alert">Las contraseñas no coinciden.</p>}
          </div>
          <button type="submit" disabled={loading || form.password !== form.confirm_password}
            aria-busy={loading} className="store-button store-button-dark">
            {loading ? 'CREANDO CUENTA…' : 'CREAR CUENTA'}
          </button>
        </form>
        <p className="text-center text-sm text-neutral-500 mt-8">
          ¿Ya tienes cuenta? <Link to="/login" className="store-inline-link">INICIAR SESIÓN</Link>
        </p>
      </div>
    </AuthShell>
  )
}
