'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, Employee } from '@/lib/supabase'
import BarcodeScannerModal from './BarcodeScannerModal'
import { compressImage } from '@/lib/compressImage'
import { assetImageKey, getNextImageIndex } from '@/lib/r2'
import { ScanLine, Camera, Upload, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['Notebook', 'MacBook', 'Desktop', 'iMac', 'Monitor', 'Printer', 'Network', 'Other']
const STATUSES = [
  { value: 'active', label: 'ใช้งาน' }, { value: 'repair', label: 'ซ่อม' },
  { value: 'storage', label: 'สต็อก' }, { value: 'retired', label: 'ปลดระวาง' },
]

interface Props {
  initial?: Partial<Asset>
  userId: string
  onSave?: (id: string) => void
}

export default function AssetForm({ initial, userId, onSave }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    asset_no: initial?.asset_no ?? '',
    name: initial?.name ?? '',
    category: initial?.category ?? CATEGORIES[0],
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    serial_no: initial?.serial_no ?? '',
    status: initial?.status ?? 'active',
    location: initial?.location ?? '',
    purchase_date: initial?.purchase_date ?? '',
    notes: initial?.notes ?? '',
    emp_id: initial?.emp_id ?? '',
  })

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [assetNoError, setAssetNoError] = useState('')
  const [scanner, setScanner] = useState<'asset_no' | 'serial_no' | null>(null)
  const [saving, setSaving] = useState(false)

  // รูปที่เลือกไว้ก่อน save (เฉพาะ Add mode)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)

  useEffect(() => {
    if (!form.emp_id) { setEmployee(null); return }
    createClient().from('employees').select('*').eq('emp_id', form.emp_id).maybeSingle()
      .then(({ data }) => setEmployee(data ?? null))
  }, [form.emp_id])

  const checkAssetNo = async (val: string) => {
    if (!val || (isEdit && val === initial?.asset_no)) { setAssetNoError(''); return }
    const { data } = await createClient().from('assets').select('id').eq('asset_no', val).maybeSingle()
    setAssetNoError(data ? 'Asset No. นี้มีอยู่แล้ว' : '')
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'asset_no') checkAssetNo(e.target.value)
  }

  const onScanResult = useCallback((value: string, target: 'asset_no' | 'serial_no') => {
    setForm(f => ({ ...f, [target]: value }))
    if (target === 'asset_no') checkAssetNo(value)
  }, [])

  // เพิ่มรูปที่เลือกไว้ก่อน save
  const addPendingFiles = (files: FileList) => {
    const total = pendingFiles.length + files.length
    if (total > 5) { alert('สูงสุด 5 รูป'); return }
    const newFiles = Array.from(files)
    setPendingFiles(prev => [...prev, ...newFiles])
    newFiles.forEach(f => {
      const url = URL.createObjectURL(f)
      setPreviewUrls(prev => [...prev, url])
    })
  }

  const removePending = (i: number) => {
    URL.revokeObjectURL(previewUrls[i])
    setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
    setPreviewUrls(prev => prev.filter((_, idx) => idx !== i))
  }

  // upload รูปหลัง asset ถูกสร้าง
  const uploadImages = async (assetId: string, assetNo: string) => {
    if (!pendingFiles.length) return []
    setUploadingImages(true)
    const keys: string[] = []
    const supabase = createClient()

    for (const file of pendingFiles) {
      const compressed = await compressImage(file)
      const idx = await getNextImageIndex(keys)
      const key = assetImageKey(assetNo, idx)

      const { url } = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).then(r => r.json())

      await fetch(url, { method: 'PUT', body: compressed, headers: { 'Content-Type': 'image/webp' } })
      keys.push(key)

      await supabase.from('asset_logs').insert({
        asset_id: assetId, action: 'image_added', detail: key, performed_by: userId,
      })
    }

    await supabase.from('assets').update({ images: keys }).eq('id', assetId)
    setUploadingImages(false)
    return keys
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (assetNoError) return
    setSaving(true)
    const supabase = createClient()
    const payload = { ...form, emp_id: form.emp_id || null, purchase_date: form.purchase_date || null }

    if (isEdit) {
      await supabase.from('assets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', initial!.id!)
      await supabase.from('asset_logs').insert({ asset_id: initial!.id!, action: 'updated', performed_by: userId })
      onSave?.(initial!.id!)
    } else {
      const { data, error } = await supabase.from('assets').insert({ ...payload, images: [], created_by: userId }).select().single()
      if (error) {
        alert('เพิ่ม Asset ไม่สำเร็จ: ' + error.message)
        setSaving(false)
        return
      }
      if (data) {
        await supabase.from('asset_logs').insert({ asset_id: data.id, action: 'created', performed_by: userId })
        try {
          await uploadImages(data.id, data.asset_no)
        } catch (e) {
          console.error('Upload image failed:', e)
          alert('บันทึก Asset สำเร็จ แต่ upload รูปไม่ได้ — กรุณาตรวจสอบ CORS ของ R2')
        }
        router.push(`/assets/${data.id}`)
      }
    }
    setSaving(false)
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <>
      {scanner && <BarcodeScannerModal target={scanner} onResult={onScanResult} onClose={() => setScanner(null)} />}
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Asset No */}
        <div>
          <label className={lbl}>Asset No. *</label>
          <div className="flex gap-2">
            <input value={form.asset_no} onChange={set('asset_no')} required placeholder="e.g. NTB-2024-001" className={`${inp} flex-1`} />
            <button type="button" onClick={() => setScanner('asset_no')} className="px-3 border border-gray-300 rounded-lg hover:bg-gray-50">
              <ScanLine size={16} className="text-gray-500" />
            </button>
          </div>
          {assetNoError && <p className="text-red-500 text-xs mt-1">{assetNoError}</p>}
        </div>

        {/* Name */}
        <div>
          <label className={lbl}>ชื่อ Asset *</label>
          <input value={form.name} onChange={set('name')} required className={inp} />
        </div>

        {/* Category */}
        <div>
          <label className={lbl}>ประเภท *</label>
          <select value={form.category} onChange={set('category')} className={inp}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className={lbl}>สถานะ</label>
          <select value={form.status} onChange={set('status')} className={inp}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Brand */}
        <div>
          <label className={lbl}>ยี่ห้อ</label>
          <input value={form.brand} onChange={set('brand')} className={inp} />
        </div>

        {/* Model */}
        <div>
          <label className={lbl}>รุ่น</label>
          <input value={form.model} onChange={set('model')} className={inp} />
        </div>

        {/* Serial No */}
        <div>
          <label className={lbl}>Serial No.</label>
          <div className="flex gap-2">
            <input value={form.serial_no} onChange={set('serial_no')} className={`${inp} flex-1`} />
            <button type="button" onClick={() => setScanner('serial_no')} className="px-3 border border-gray-300 rounded-lg hover:bg-gray-50">
              <ScanLine size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Purchase Date */}
        <div>
          <label className={lbl}>วันที่ซื้อ</label>
          <input type="date" value={form.purchase_date} onChange={set('purchase_date')} className={inp} />
        </div>

        {/* Location */}
        <div>
          <label className={lbl}>Location</label>
          <input value={form.location} onChange={set('location')} className={inp} />
        </div>

        {/* Emp ID */}
        <div>
          <label className={lbl}>รหัสพนักงาน</label>
          <input value={form.emp_id} onChange={set('emp_id')} placeholder="EMP-00142" className={inp} />
          {employee && (
            <p className="text-xs text-indigo-600 mt-1">{employee.full_name_th} · {employee.department}</p>
          )}
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <label className={lbl}>หมายเหตุ</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={inp} />
        </div>

        {/* รูปภาพ — เฉพาะ Add mode */}
        {!isEdit && (
          <div className="md:col-span-2">
            <label className={lbl}>รูปภาพ (สูงสุด 5 รูป)</label>

            {/* Preview รูปที่เลือก */}
            {previewUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    <button type="button" onClick={() => removePending(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ปุ่มถ่ายรูป / เลือกรูป */}
            {pendingFiles.length < 5 && (
              <div className="flex gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Camera size={15} /> ถ่ายรูป
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Upload size={15} /> เลือกรูป
                </button>
                <span className="text-xs text-gray-400 self-center">{pendingFiles.length}/5</span>
              </div>
            )}

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => e.target.files && addPendingFiles(e.target.files)} />
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => e.target.files && addPendingFiles(e.target.files)} />
          </div>
        )}

        {/* Buttons */}
        <div className="md:col-span-2 flex gap-3 justify-end">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || uploadingImages || !!assetNoError}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {(saving || uploadingImages) && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'กำลังบันทึก...' : uploadingImages ? 'กำลัง upload รูป...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่ม Asset'}
          </button>
        </div>
      </form>
    </>
  )
}
