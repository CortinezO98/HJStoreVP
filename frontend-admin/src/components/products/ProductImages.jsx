import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Star, StarOff, ImageIcon, X, Loader } from 'lucide-react'
import { apiClient } from "../../services/api";
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

    function getImageUrl(url) {
    if (!url) return null
    if (url.startsWith('http')) return url
    return `${API_URL}${url}`
    }

    export default function ProductImages({ productId, productName, onClose }) {
    const qc = useQueryClient()
    const fileInputRef = useRef(null)
    const [dragging, setDragging] = useState(false)
    const [uploading, setUploading] = useState(false)

    const { data: images = [], isLoading } = useQuery({
        queryKey: ['product-images', productId],
        queryFn: () => apiClient.get(`/products/${productId}/images`).then(r => r.data),
    })

    const deleteMutation = useMutation({
        mutationFn: (imageId) => apiClient.delete(`/products/${productId}/images/${imageId}`),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['product-images', productId] })
        qc.invalidateQueries({ queryKey: ['products'] })
        toast.success('Imagen eliminada')
        },
        onError: () => toast.error('Error al eliminar imagen'),
    })

    const primaryMutation = useMutation({
        mutationFn: (imageId) => apiClient.patch(`/products/${productId}/images/primary`, { image_id: imageId }),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['product-images', productId] })
        qc.invalidateQueries({ queryKey: ['products'] })
        toast.success('Imagen principal actualizada')
        },
    })

    const uploadFiles = async (files) => {
        if (!files || files.length === 0) return

        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        const invalid = Array.from(files).find(f => !validTypes.includes(f.type))
        if (invalid) {
        toast.error('Solo se permiten imágenes JPG, PNG, WEBP')
        return
        }

        const tooBig = Array.from(files).find(f => f.size > 10 * 1024 * 1024)
        if (tooBig) {
        toast.error('Las imágenes no pueden superar 10MB')
        return
        }

        setUploading(true)
        try {
        const formData = new FormData()
        Array.from(files).forEach(f => formData.append('files', f))

        await apiClient.post(`/products/${productId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })

        qc.invalidateQueries({ queryKey: ['product-images', productId] })
        qc.invalidateQueries({ queryKey: ['products'] })
        toast.success(`${files.length} imagen(es) subida(s) correctamente`)
        } catch (e) {
        toast.error(e.response?.data?.detail || 'Error al subir imágenes')
        } finally {
        setUploading(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragging(false)
        uploadFiles(e.dataTransfer.files)
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        setDragging(true)
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
                <h2 className="font-bold text-gray-900 text-lg">Imágenes del producto</h2>
                <p className="text-sm text-gray-500 mt-0.5">{productName}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X size={20} />
            </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Zona de upload */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragging(false)}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'
                } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {uploading ? (
                <div className="flex flex-col items-center gap-3">
                    <Loader size={32} className="text-brand-500 animate-spin" />
                    <p className="text-sm font-medium text-brand-600">Subiendo imágenes...</p>
                </div>
                ) : (
                <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center">
                    <Upload size={24} className="text-brand-600" />
                    </div>
                    <div>
                    <p className="font-semibold text-gray-700 text-sm">
                        Arrastra imágenes aquí o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        JPG, PNG, WEBP · Máximo 10MB por imagen · Hasta 10 imágenes
                    </p>
                    </div>
                </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
            />

            {/* Grid de imágenes */}
            {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(i => (
                    <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
                ))}
                </div>
            ) : images.length === 0 ? (
                <div className="text-center py-8">
                <ImageIcon size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Este producto no tiene imágenes todavía</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                {images.map((img) => (
                    <div
                    key={img.id}
                    className={`relative group aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                        img.is_primary ? 'border-brand-500' : 'border-gray-200'
                    }`}
                    >
                    {/* Imagen */}
                    <img
                        src={getImageUrl(img.url)}
                        alt={img.alt_text || 'Producto'}
                        className="w-full h-full object-cover"
                    />

                    {/* Badge principal */}
                    {img.is_primary && (
                        <div className="absolute top-2 left-2 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        Principal
                        </div>
                    )}

                    {/* Overlay con acciones */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        {!img.is_primary && (
                        <button
                            onClick={() => primaryMutation.mutate(img.id)}
                            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-brand-50 transition-colors"
                            title="Establecer como principal"
                        >
                            <Star size={16} className="text-brand-600" />
                        </button>
                        )}
                        <button
                        onClick={() => {
                            if (confirm('¿Eliminar esta imagen?')) {
                            deleteMutation.mutate(img.id)
                            }
                        }}
                        className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-red-50 transition-colors"
                        title="Eliminar imagen"
                        >
                        <Trash2 size={16} className="text-red-500" />
                        </button>
                    </div>
                    </div>
                ))}
                </div>
            )}

            {images.length > 0 && (
                <p className="text-xs text-gray-400 text-center">
                {images.length} imagen(es) · Pasa el cursor sobre una imagen para ver las opciones
                </p>
            )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100">
            <button onClick={onClose} className="btn-secondary w-full">
                Cerrar
            </button>
            </div>
        </div>
        </div>
    )
}
