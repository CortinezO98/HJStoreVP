import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuthStore } from '../store'

function errorText(error) {
  const detail = error?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'No fue posible completar la operación'
}

export default function MyProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [profile, setProfile] = useState({ full_name: '', phone: '', email: '' })
  const [emailPassword, setEmailPassword] = useState('')
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [mfa, setMfa] = useState(null)
  const [setupPassword, setSetupPassword] = useState('')
  const [enrollment, setEnrollment] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const supportsMfa = ['admin', 'super_admin'].includes(user?.role)

  useEffect(() => {
    let active = true
    authApi.me().then(({ data }) => {
      if (active) setProfile({
        full_name: data.full_name || '', phone: data.phone || '', email: data.email || '',
      })
    }).catch(() => toast.error('No se pudo consultar el perfil'))
    if (supportsMfa) authApi.mfaStatus().then(({ data }) => {
      if (active) setMfa(data)
    }).catch(() => toast.error('No se pudo consultar el estado del segundo factor'))
    return () => { active = false }
  }, [supportsMfa])

  const perform = async (action, message) => {
    setBusy(true)
    try {
      await action()
      if (message) toast.success(message)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const closeSession = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return <div className="space-y-6 max-w-4xl mx-auto pb-10">
    <div><h1 className="text-2xl font-bold text-gray-900">Mi perfil y seguridad</h1>
      <p className="text-sm text-gray-600">Gestiona tus datos y protege el acceso a tu cuenta.</p></div>

    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-lg">Datos personales</h2>
      <form onSubmit={(e) => { e.preventDefault(); perform(async () => {
        await authApi.updateProfile({ full_name: profile.full_name.trim(), phone: profile.phone.trim() || null })
        useAuthStore.setState((state) => ({ user: state.user ? { ...state.user, fullName: profile.full_name.trim() } : null }))
      }, 'Datos guardados') }} className="space-y-3">
        <label className="block text-sm" htmlFor="profile-name">Nombre completo</label>
        <input id="profile-name" className="input" required minLength={2} maxLength={200}
          value={profile.full_name} onChange={(e) => setProfile(p => ({ ...p, full_name: e.target.value }))}/>
        <label className="block text-sm" htmlFor="profile-phone">Teléfono</label>
        <input id="profile-phone" className="input" maxLength={50} value={profile.phone}
          onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}/>
        <button className="btn-primary" type="submit" disabled={busy}>Guardar datos</button>
      </form>
    </section>

    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-lg">Cambiar correo electrónico</h2>
      <p className="text-sm text-gray-600">Por seguridad debes confirmar tu contraseña actual.</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); perform(async () => {
        await authApi.changeEmail({ email: profile.email, current_password: emailPassword })
        setEmailPassword('')
      }, 'Correo actualizado') }}>
        <label className="block text-sm" htmlFor="profile-email">Correo</label>
        <input id="profile-email" className="input" type="email" required value={profile.email}
          onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))}/>
        <label className="block text-sm" htmlFor="profile-email-pass">Contraseña actual</label>
        <input id="profile-email-pass" className="input" type="password" autoComplete="current-password"
          required value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)}/>
        <button className="btn-primary" type="submit" disabled={busy}>Actualizar correo</button>
      </form>
    </section>

    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-lg">Cambiar contraseña</h2>
      <p className="text-sm text-gray-600">Mínimo 12 caracteres. Al cambiarla se cerrará tu sesión y quedarán revocados los tokens anteriores.</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault()
        if (passwords.new_password !== passwords.confirm) { toast.error('Las contraseñas no coinciden'); return }
        perform(async () => {
          await authApi.changePassword({ current_password: passwords.current_password, new_password: passwords.new_password })
          closeSession()
          toast.success('Contraseña cambiada. Inicia sesión nuevamente.')
        })
      }}>
        <label className="block text-sm" htmlFor="profile-old-pass">Contraseña actual</label>
        <input id="profile-old-pass" className="input" type="password" autoComplete="current-password" required
          value={passwords.current_password} onChange={(e) => setPasswords(p => ({ ...p, current_password: e.target.value }))}/>
        <label className="block text-sm" htmlFor="profile-new-pass">Contraseña nueva</label>
        <input id="profile-new-pass" className="input" type="password" autoComplete="new-password" required
          minLength={12} maxLength={72} value={passwords.new_password}
          onChange={(e) => setPasswords(p => ({ ...p, new_password: e.target.value }))}/>
        <label className="block text-sm" htmlFor="profile-confirm-pass">Confirmar contraseña nueva</label>
        <input id="profile-confirm-pass" className="input" type="password" autoComplete="new-password" required
          minLength={12} maxLength={72} value={passwords.confirm}
          onChange={(e) => setPasswords(p => ({ ...p, confirm: e.target.value }))}/>
        <button className="btn-primary" type="submit" disabled={busy}>Cambiar contraseña</button>
      </form>
    </section>

    {supportsMfa && <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-lg">Verificación en dos pasos (2FA)</h2>
      {mfa?.enabled ? <p className="text-green-700 font-semibold">Activa · Códigos de recuperación restantes: {mfa.recovery_codes_remaining}</p>
        : <p className="text-amber-700">Inactiva. Puedes habilitarla con Google Authenticator u otra aplicación TOTP.</p>}
      {mfa && !mfa.enabled && !enrollment && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); perform(async () => {
        const { data } = await authApi.mfaSetup({ current_password: setupPassword })
        setEnrollment(data)
        setSetupPassword('')
      }) }}>
        <label className="block text-sm" htmlFor="mfa-pass">Confirma tu contraseña actual</label>
        <input id="mfa-pass" className="input" type="password" autoComplete="current-password"
          value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} required/>
        <button className="btn-primary" type="submit" disabled={busy}>Configurar segundo factor</button>
      </form>}
      {enrollment && !mfa?.enabled && <div className="space-y-3">
        <p className="text-sm text-gray-700">Añade manualmente esta clave a tu aplicación autenticadora. No la compartas.</p>
        <code className="block bg-gray-100 p-3 break-all select-all" aria-label="Clave secreta TOTP">{enrollment.secret}</code>
        <p className="text-xs text-gray-500">Tipo: basado en tiempo (TOTP), SHA-1, 6 dígitos, intervalo de 30 segundos.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); perform(async () => {
          const { data } = await authApi.mfaConfirm({ code: verifyCode })
          setRecoveryCodes(data.recovery_codes)
          setMfa({ enabled: true, recovery_codes_remaining: data.recovery_codes.length })
          setEnrollment(null)
          setVerifyCode('')
          toast.success('2FA activado. Guarda tus códigos de recuperación.')
        }) }}>
          <label htmlFor="mfa-verify" className="block text-sm">Código de seis dígitos</label>
          <input id="mfa-verify" className="input" inputMode="numeric" pattern="[0-9]{6}"
            autoComplete="one-time-code" required value={verifyCode} maxLength={6}
            onChange={(e) => setVerifyCode(e.target.value)}/>
          <button className="btn-primary" disabled={busy} type="submit">Confirmar y activar 2FA</button>
        </form>
      </div>}
      {recoveryCodes && <div className="space-y-3 border border-amber-300 rounded-xl p-4">
        <p className="font-semibold">Códigos de recuperación (se muestran una sola vez)</p>
        <p className="text-sm">Guárdalos fuera del navegador. Cada uno solo funciona una vez.</p>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map(code =>
          <span key={code} className="bg-gray-100 rounded p-2">{code}</span>)}</div>
        <button type="button" className="btn-primary" onClick={() => { setRecoveryCodes(null); closeSession() }}>
          He guardado mis códigos · cerrar sesión
        </button>
      </div>}
    </section>}
  </div>
}
