'use client'
import { useState, useRef } from 'react'
import { compressImage } from '@/lib/compressImage'
import { assetImageKey, getNextImageIndex } from '@/lib/r2'
import { createClient } from '@/lib/supabase'
import { Upload, X, Loader2, Camera } from 'lucide-react'

interface Props {
  assetId: string
  assetNo: string
  images: string[]
  onUpdate: (images: string[]) => void
  readOnly?: boolean
}

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

export default function ImageUploader({ assetId, assetNo, images, onUpdate, readOnly }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList) => {
    if (images.length + files.length > 5) { alert('สูงสุด 5 รูป'); return }
    setUploading(true)
    const supabase = createClient()
    const newKeys = [...images]

    for (const file of Array.from(files)) {
      const compressed = await compressImage(file)
      const idx = await getNextImageIndex(newKeys)
      const key = assetImageKey(assetNo, idx)

      const { url } = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).then(r => r.json())

      await fetch(url, { method: 'PUT', body: compressed, headers: { 'Content-Type': 'image/webp' } })
      newKeys.push(key)

      const userId = (await supabase.auth.getUser()).data.user?.id
      await supabase.from('assets').update({ images: newKeys }).eq('id', assetId)
      await supabase.from('asset_logs').insert({ asset_id: assetId, action: 'image_added', detail: key, performed_by: userId })
    }

    onUpdate(newKeys)
    setUploading(false)
  }

  const remove = async (key: string) => {
    if (!confirm('ลบรูปนี้?')) return
    const supabase = createClient()
    await fetch('/api/r2/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
    })
    const newKeys = images.filter(k => k !== key)
    const userId = (await supabase.auth.getUser()).data.user?.id
    await supabase.from('assets').update({ images: newKeys }).eq('id', assetId)
    await supabase.from('asset_logs').insert({ asset_id: assetId, action: 'image_removed', detail: key, performed_by: userId })
    onUpdate(newKeys)
  }

  const canAdd = !readOnly && images.length < 5

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {images.map(key => (
          <div key={key} className="relative w-24 h-24 group">
            <img src={`${R2_PUBLIC}/${key}`} alt="" className="w-full h-full object-cover rounded-lg border border-gray-200" />
            {!readOnly && (
              <button onClick={() => remove(key)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        {uploading && (
          <div className="w-24 h-24 border-2 border-dashed border-indigo-300 rounded-lg flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-indigo-500" />
          </div>
        )}
      </div>

      {canAdd && !uploading && (
        <div className="flex gap-2">
          {/* ถ่ายรูปจากกล้อง */}
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Camera size={15} /> ถ่ายรูป
          </button>
          {/* เลือกจาก Gallery */}
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Upload size={15} /> เลือกรูป
          </button>
          <span className="text-xs text-gray-400 self-center">{images.length}/5 รูป</span>
        </div>
      )}

      {/* input ถ่ายรูป (กล้อง) */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files && upload(e.target.files)} />
      {/* input เลือกจาก Gallery */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => e.target.files && upload(e.target.files)} />
    </div>
  )
}
