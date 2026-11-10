import { useEffect, useRef } from 'react'
import { useAuthStore, useCartStore } from '../../store'
import { apiClient } from '../../services/api'

/** Guarda en cuenta cambios del carrito; nunca registra precios ni direcciones.
 * No sustituye el carrito local y no borra uno remoto cuando la sesión inicia
 * con carrito local vacío. Solo los cambios posteriores sincronizan vacío.
 */
export default function CartEngagementSync() {
  const auth = useAuthStore(s=>s.isAuthenticated)
  const userId = useAuthStore(s=>s.user?.id)
  const role = useAuthStore(s=>s.user?.role)
  const items = useCartStore(s=>s.items)
  const fingerprint = items.map(i=>`${i.product.id}:${i.qty}`).sort().join('|')
  const prior = useRef({ key:null, id:null })

  useEffect(()=>{
    if(!auth || !userId || role!=='customer'){
      prior.current = {key:null,id:null}
      return
    }
    const firstForAccount = prior.current.id !== userId
    if(firstForAccount){
      prior.current={key:fingerprint,id:userId}
      if(!fingerprint) return
    } else if(prior.current.key===fingerprint) {
      return
    }
    prior.current={key:fingerprint,id:userId}
    const timeout=setTimeout(()=>{
      apiClient.put('/engagement/cart',{
        items:items.map(i=>({product_id:i.product.id,qty:i.qty})),
      }).catch(()=>{
        // Guardar carrito es best effort. No interrumpir checkout ni mostrar
        // errores por cada modificación: el carrito local permanece.
      })
    },900)
    return ()=>clearTimeout(timeout)
  },[auth,userId,role,fingerprint,items])
  return null
}
