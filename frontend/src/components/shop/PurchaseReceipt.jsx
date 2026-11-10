import { useState } from 'react'
import { Download, ReceiptText } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/api'

export default function PurchaseReceipt({ order }) {
  const [busy, setBusy] = useState(false)
  if (!['paid', 'preparing', 'shipped', 'delivered', 'refunded'].includes(order.status)) return null

  const download = async () => {
    setBusy(true)
    try {
      const { data: doc } = await apiClient.post(`/billing/receipt/${order.id}`)
      const { data } = await apiClient.get(`/billing/${doc.id}/print`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }))
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${doc.internal_reference}.html`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 15_000)
      }
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No fue posible generar el comprobante')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="border-t border-neutral-200 pt-4 mt-5">
      <button type="button" className="store-button store-button-outline inline-flex gap-2"
        onClick={download} disabled={busy}>
        <ReceiptText size={16} aria-hidden="true"/>
        {busy ? 'GENERANDO…' : 'COMPROBANTE DE COMPRA'}
        <Download size={15} aria-hidden="true"/>
      </button>
      <p className="text-xs text-neutral-500 mt-2">
        Documento comercial interno descargable en HTML, imprimible desde el navegador.
        No equivale a factura electrónica validada por la DIAN.
      </p>
    </div>
  )
}
