import { Link } from 'react-router-dom'
import { ArrowRight, ImagePlus, LayoutTemplate, ShieldCheck, Store, Type } from 'lucide-react'

/**
 * Guía visual no destructiva: explica los dos flujos de publicación existentes.
 * La portada por secciones se gestiona como borrador en Estudio visual.
 * Configuración general conserva su guardado/publicación inmediata.
 */
export default function StorefrontWorkflowGuide({ context = 'studio' }) {
  const studio = context === 'studio'
  return (
    <section className="hj-home-guide" aria-label="Guía para personalizar la tienda">
      <div className="hj-home-guide-heading">
        <div>
          <span className="hj-home-guide-kicker">Personaliza tu tienda en tres pasos</span>
          <h2>{studio ? 'Diseña la portada sin afectar a tus clientes' : 'Marca y portada, cada una en su lugar'}</h2>
          <p>{studio
            ? 'Elige una sección, ajusta textos o fotografías y revisa el resultado. Tus cambios son privados hasta que publiques.'
            : 'Aquí modificas la información general de la tienda. Para cambiar el orden de secciones, crear banners o probar fotografías antes de publicar, usa el Estudio visual.'}</p>
        </div>
        <Link className="btn btn-outline-secondary btn-sm" to={studio ? '/configuracion-tienda' : '/estudio-inicio'}>
          {studio ? 'Editar datos generales' : 'Abrir estudio visual'} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="hj-home-guide-steps">
        <div className="hj-home-guide-step">
          <span className="hj-home-guide-step-icon"><Type size={19} aria-hidden="true" /></span>
          <div><strong>1. Personaliza</strong><p>{studio ? 'Selecciona el banner o una sección para editar textos y orden.' : 'Completa nombre, eslogan, contacto y políticas.'}</p></div>
        </div>
        <div className="hj-home-guide-step">
          <span className="hj-home-guide-step-icon"><ImagePlus size={19} aria-hidden="true" /></span>
          <div><strong>2. Agrega imágenes</strong><p>Sube JPG, PNG o WebP. Recorta cuando se solicite y comprueba la vista móvil.</p></div>
        </div>
        <div className="hj-home-guide-step">
          <span className="hj-home-guide-step-icon">{studio ? <LayoutTemplate size={19} aria-hidden="true" /> : <Store size={19} aria-hidden="true" />}</span>
          <div><strong>3. {studio ? 'Guarda y publica' : 'Publica cuando esté listo'}</strong><p>{studio
            ? 'Guarda el borrador, revísalo y luego pulsa «Publicar portada».'
            : '«Guardar y publicar» cambia la información general visible para los clientes.'}</p></div>
        </div>
      </div>
      <p className="hj-home-guide-note"><ShieldCheck size={16} aria-hidden="true" />
        {studio
          ? 'No se modifica la tienda pública al crear secciones, cargar fotos o guardar un borrador.'
          : 'Para probar diseños sin publicarlos, edita primero en Estudio visual.'}
      </p>
    </section>
  )
}
