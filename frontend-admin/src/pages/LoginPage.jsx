import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuthStore } from '../store'
import { authApi } from '../services/api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState('')
  const { login, completeLogin } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(form.email, form.password)
      if (data.mfa_required) {
        setChallenge(data.challenge_token)
        setForm({ email: '', password: '' })
        return
      }
      if (data.mfa_setup_required) {
        setForm({ email: '', password: '' })
        navigate('/configurar-mfa', { replace: true })
        return
      }
      toast.success(`Bienvenido, ${data.full_name}!`)
      navigate(location.state?.from || '/', { replace: true })
    } catch (error) {
      setError(error?.response?.data?.detail || error.message || 'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.mfaVerify({ challenge_token: challenge, code: mfaCode })
      completeLogin(data)
      setChallenge(null)
      setMfaCode('')
      toast.success('Verificación completada')
      navigate(location.state?.from || '/', { replace: true })
    } catch (error) {
      setError(error?.response?.data?.detail || 'El código no es válido o ya venció. Genera uno nuevo en tu aplicación.')
    } finally {
      setLoading(false)
    }
  }

  const errorBox = error && (
    <div className="alert alert-danger py-2 px-3 small mb-0" role="alert" id="login-error">{error}</div>
  )

  return (
    <div className="hj-login admin-app-shell">
      <aside className="hj-login-side" aria-hidden="true">
        <span className="hj-brand-word" style={{ fontSize: 30 }}>HJSTORE<small>VP</small><i>.</i></span>
        <div>
          <h1>Centro de<br />operaciones<i>.</i></h1>
          <p>Catálogo, inventario, ventas web y físicas, caja y reportes en un solo lugar.</p>
        </div>
        <p className="small" style={{ color: 'rgba(255,255,255,.45)' }}>Acceso exclusivo para el equipo de HJStoreVP.</p>
      </aside>
      <main className="hj-login-main">
        <div className="hj-login-card">
          <span className="hj-brand-word d-lg-none mb-4 d-inline-block" style={{ color: '#0A0A0A', fontSize: 28 }}>HJSTORE<small style={{ color: '#6B6B66' }}>VP</small><i>.</i></span>
          {challenge ? (
            <form onSubmit={handleMfa} className="d-grid gap-3" aria-describedby={error ? 'login-error' : undefined}>
              <div>
                <h2 className="admin-page-heading mb-1">Verificación en dos pasos</h2>
                <p className="admin-page-description mb-0">Escribe el código de 6 dígitos de tu aplicación autenticadora o uno de tus códigos de recuperación.</p>
              </div>
              {errorBox}
              <div>
                <label className="form-label" htmlFor="mfa-code">Código de seguridad</label>
                <input id="mfa-code" className="form-control form-control-lg text-center" autoComplete="one-time-code" inputMode="numeric" autoFocus required
                  value={mfaCode} maxLength={20} onChange={(e) => setMfaCode(e.target.value.trim())} placeholder="000000"
                  style={{ letterSpacing: '.3em', fontVariantNumeric: 'tabular-nums' }} />
              </div>
              <button className="btn btn-primary btn-lg w-100" type="submit" disabled={loading || mfaCode.length < 6}>
                {loading ? 'Verificando…' : 'Verificar e ingresar'}
              </button>
              <button type="button" className="btn btn-link btn-sm" onClick={() => { setChallenge(null); setMfaCode(''); setError('') }}>
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="d-grid gap-3" aria-describedby={error ? 'login-error' : undefined}>
              <div>
                <h2 className="admin-page-heading mb-1">Iniciar sesión</h2>
                <p className="admin-page-description mb-0">Ingresa con tu cuenta de administrador o vendedor.</p>
              </div>
              {errorBox}
              <div>
                <label className="form-label" htmlFor="login-email">Correo electrónico</label>
                <input id="login-email" type="email" autoComplete="username" required autoFocus value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} className="form-control form-control-lg" aria-invalid={Boolean(error)} />
              </div>
              <div>
                <label className="form-label" htmlFor="login-password">Contraseña</label>
                <div className="position-relative">
                  <input id="login-password" type={showPass ? 'text' : 'password'} autoComplete="current-password" required value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} className="form-control form-control-lg" style={{ paddingRight: 48 }} aria-invalid={Boolean(error)} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="admin-icon-button position-absolute top-50 end-0 translate-middle-y me-1"
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPass}>
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-100">
                {loading ? <><span className="hj-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Ingresando…</> : <><LogIn size={17} /> Ingresar</>}
              </button>
              <p className="form-text text-center mb-0">¿Olvidaste tu contraseña? Pide a un Super Admin que la restablezca desde Usuarios.</p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
