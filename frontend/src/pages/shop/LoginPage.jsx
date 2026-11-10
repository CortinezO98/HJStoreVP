import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store'
import AuthShell from '../../components/shop/AuthShell'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/mi-cuenta'

  const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const account = await login(form.email.trim(), form.password)
      setForm((previous) => ({ ...previous, password: '' }))
      toast.success('Sesión iniciada correctamente')
      // Conservar el flujo original: las cuentas administrativas usan su propio panel.
      if (['super_admin', 'admin', 'seller'].includes(account.user_role)) {
        const adminUrl = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174'
        window.location.assign(adminUrl)
        return
      }
      navigate(next, { replace: true })
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No pudimos iniciar sesión. Revisa tus datos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell eyebrow="TU CUENTA" headline={<>EL ESTILO<br/>ES PERSONAL.</>}
      description="Accede a tus pedidos, consulta tus compras y guarda todo en un mismo lugar.">
      <div className="store-auth-card">
        <LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true" className="mb-5" />
        <h1>INICIAR SESIÓN</h1>
        <p className="store-muted">Ingresa tus datos para continuar.</p>
        <form onSubmit={submit}>
          <div>
            <label className="store-label" htmlFor="login-email">Correo electrónico</label>
            <input className="store-input" id="login-email" name="email" type="email" autoComplete="username"
              autoCapitalize="none" spellCheck="false" maxLength={254} required
              placeholder="tu@correo.com" value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
          </div>
          <div>
            <label className="store-label" htmlFor="login-password">Contraseña</label>
            <div className="relative">
              <input className="store-input pr-14" id="login-password" name="password"
                type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                placeholder="Tu contraseña" value={form.password}
                onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword} onClick={() => setShowPassword((previous) => !previous)}>
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>
          <button className="store-button store-button-dark" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? 'INGRESANDO…' : 'INGRESAR'}
          </button>
        </form>
        <p className="text-center text-sm text-neutral-500 mt-8">
          ¿Aún no tienes una cuenta? <Link className="store-inline-link" to="/registro">CREAR CUENTA</Link>
        </p>
      </div>
    </AuthShell>
  )
}
