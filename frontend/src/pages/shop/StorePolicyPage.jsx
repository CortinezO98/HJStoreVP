import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { storefrontSettingsApi } from '../../services/api'

const POLICIES = {
  envios: ['shipping_policy', 'Política de envíos'],
  devoluciones: ['returns_policy', 'Cambios y devoluciones'],
  privacidad: ['privacy_policy', 'Tratamiento de datos personales'],
  terminos: ['terms_policy', 'Términos y condiciones'],
}

export default function StorePolicyPage() {
  const { policy } = useParams()
  const choice = POLICIES[policy]
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['storefront-settings-public'],
    queryFn: () => storefrontSettingsApi.public().then(({ data }) => data),
    staleTime: 60000,
  })
  if (!choice) return <main className="store-container store-section">
    <h1 className="editorial-catalog-title">Política no encontrada</h1>
    <Link to="/" className="store-inline-link">Volver al inicio</Link>
  </main>
  const [key, title] = choice
  const content = settings[key]?.trim()
  return <main className="store-container store-section">
    <h1 className="editorial-catalog-title">{title.toUpperCase()}</h1>
    {isLoading ? <p className="mt-6">Cargando…</p> :
      content ? <div className="mt-8 max-w-4xl whitespace-pre-wrap break-words leading-8 text-neutral-700">{content}</div>
        : <p className="mt-6 text-neutral-500">Esta política aún no está publicada.</p>}
    <Link to="/" className="store-inline-link mt-8 inline-block">Volver al inicio</Link>
  </main>
}
