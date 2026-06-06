'use client'
import { useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'

export default function GalleryLightbox({ images, index, r2Public, onClose, onChange }: {
  images: string[]; index: number; r2Public: string
  onClose: () => void; onChange: (i: number) => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onChange(Math.min(index + 1, images.length - 1))
      if (e.key === 'ArrowLeft') onChange(Math.max(index - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, images.length])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={onClose}>
        <X size={24} />
      </button>
      <p className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-sm">{index + 1} / {images.length}</p>

      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onChange(index - 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors">
          <ChevronRight size={24} className="rotate-180" />
        </button>
      )}

      <img
        src={`${r2Public}/${images[index]}`}
        className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg select-none"
        onClick={e => e.stopPropagation()}
      />

      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onChange(index + 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors">
          <ChevronRight size={24} />
        </button>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <button key={i} onClick={() => onChange(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'}`}>
              <img src={`${r2Public}/${img}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
