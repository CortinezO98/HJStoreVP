import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store'

export default function MFAEnrollmentPage() {
  const { isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [enrollment, setEnrollment] = useState(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const exit = () => { logout(); navigate('/login', { replace: true }) }
  if (!isAuthenticated || sessionStorage.getItem('mfa_setup_required') !== 'true') return <Navigate to="/login" replace />
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (!enrollment) {
        const { data } = await authApi.mfaSetup({ current_password: password })
        setEnrollment(data); setPassword('')
      } else {
        const { data } = await authApi.mfaConfirm({ code })
        setRecovery(data.recovery_codes); setEnrollment(null); setCode('')
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'No fue posible completar la configuración')
    } finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
    <section className="w-full max-w-lg bg-white rounded-xl border p-6 space-y-4">
      <h1 className="text-2xl font-bold">Protege tu cuenta administrativa</h1>
      <p className="text-sm text-gray-600">La verificación en dos pasos es obligatoria. Configúrala para acceder al panel.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {recovery ? <div className="space-y-4">
        <h2 className="font-semibold">Guarda tus códigos de recuperación</h2>
        <p className="text-sm">Solo se muestran una vez. Guárdalos fuera del navegador.</p>
        <div className="grid grid-cols-2 gap-2 font-mono">{recovery.map(value => <span key={value}>{value}</span>)}</div>
        <button className="btn-primary" onClick={exit}>He guardado mis códigos · iniciar sesión</button>
      </div> : <form onSubmit={submit} className="space-y-4">
        {enrollment ? <>
          <p>Escanea el QR con tu aplicación autenticadora o introduce la clave manualmente.</p>
          <QRCodeSVG value={enrollment.provisioning_uri} size={192} level="M" marginSize={1} />
          <code className="block break-all select-all">{enrollment.secret}</code>
          <label className="block" htmlFor="enroll-code">Código de seis dígitos</label>
          <input id="enroll-code" className="input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
            autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} />
        </> : <>
          <label className="block" htmlFor="enroll-password">Confirma tu contraseña actual</label>
          <input id="enroll-password" className="input" type="password" autoComplete="current-password"
            required value={password} onChange={e => setPassword(e.target.value)} />
        </>}
        <button className="btn-primary" disabled={busy} type="submit">{busy ? 'Verificando…' : enrollment ? 'Activar segundo factor' : 'Configurar segundo factor'}</button>
      </form>}
      {!recovery && <button className="btn btn-link" onClick={exit}>Cerrar sesión</button>}
    </section>
  </main>
}
