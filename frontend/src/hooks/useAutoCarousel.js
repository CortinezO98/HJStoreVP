import { useEffect, useState } from 'react'

/**
 * Autoplay progresivo y accesible. La interacción manual no se bloquea.
 * Se detiene al pasar el cursor, enfocar controles, ocultar la pestaña o
 * cuando el usuario solicita movimiento reducido.
 */
export default function useAutoCarousel(count, intervalMs = 6000, identity = '') {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    setIndex(0)
    setPaused(false)
  }, [identity])

  useEffect(() => {
    if (count < 2 || paused) return undefined
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer = null

    const stop = () => {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    }
    const refresh = () => {
      stop()
      if (!document.hidden && !reducedMotion.matches) {
        timer = window.setInterval(() => {
          setIndex((current) => (current + 1) % count)
        }, intervalMs)
      }
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    reducedMotion.addEventListener?.('change', refresh)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', refresh)
      reducedMotion.removeEventListener?.('change', refresh)
    }
  }, [count, intervalMs, paused, identity])

  const goTo = (next) => {
    if (!count) return
    setIndex(((next % count) + count) % count)
  }
  return { index: count ? Math.min(index, count - 1) : 0, goTo, setPaused }
}
