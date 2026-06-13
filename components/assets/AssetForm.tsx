'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, Employee, Vendor } from '@/lib/supabase'
import BarcodeScannerModal from './BarcodeScannerModal'
import { compressImage } from '@/lib/compressImage'
import { assetImageKey, getNextImageIndex, r2PublicUrl } from '@/lib/r2'
import { insertAssetLog } from '@/lib/logging'
import { ScanLine, Camera, Upload, X, Loader2, ChevronDown, Wand2 } from 'lucide-react'

const CATEGORY_TO_CODE: Record<string, string> = {
  'notebook': '01', 'macbook': '02', 'pc desktop': '03', 'imac': '04',
  'android': '05', 'ios': '06', 'ipad': '07', 'monitor': '08',
  'printer': '09', 'tv': '10', 'network': '11', 'other': '12',
}
import { useRouter } from 'next/navigation'
import Fuse from 'fuse.js'

const CATEGORIES = ['Notebook', 'MacBook', 'PC Desktop', 'iMac', 'Android', 'iOS', 'iPad', 'Monitor', 'Printer', 'TV', 'Network', 'Other']
const STATUSES = [
  { value: 'available', label: 'ว่าง' },
  { value: 'issued',    label: 'จ่าย' },
  { value: 'returned',  label: 'รับคืน' },
  { value: 'damaged',   label: 'ชำรุด' },
  { value: 'repair',    label: 'ส่งซ่อม' },
  { value: 'writeoff',  label: 'Write Off' },
  { value: 'hold',      label: 'Hold' },
  { value: 'spare',     label: 'Spare' },
]

interface Props {
  initial?: Partial<Asset>
  userId: string
  onSave?: (id: string) => void
  onCancel?: () => void
}

export default function AssetForm({ initial, userId, onSave, onCancel }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    asset_no:       initial?.asset_no ?? '',
    name:           initial?.name ?? '',
    category:       initial?.category ?? CATEGORIES[0],
    brand:          initial?.brand ?? '',
    model:          initial?.model ?? '',
    serial_no:      initial?.serial_no ?? '',
    status:         initial?.status ?? 'available',
    location:       initial?.location ?? '',
    purchase_date:  initial?.purchase_date ?? '',
    received_date:  initial?.received_date ?? '',
    original_price: initial?.original_price?.toString() ?? '',
    vendor_id:      initial?.vendor_id ?? '',
    apple_id:       initial?.apple_id ?? '',
    notes:          initial?.notes ?? '',
    emp_id:         initial?.emp_id ?? '',
    department:     (initial as any)?.department ?? '',
    // Spec fields (optional)
    account_category: (initial as any)?.account_category ?? 'IT',
    stored_at:      (initial as any)?.stored_at ?? '',
    cpu:            (initial as any)?.cpu ?? '',
    ram:            (initial as any)?.ram ?? '',
    storage_spec:   (initial as any)?.storage_spec ?? '',
    mac_ethernet:   (initial as any)?.mac_ethernet ?? '',
    mac_wifi:       (initial as any)?.mac_wifi ?? '',
    branch:         (initial as any)?.branch ?? '',
    quantity:       (initial as any)?.quantity?.toString() ?? '1',
  })

  const APPLE_CATEGORIES = ['MacBook', 'iMac', 'iOS', 'iPad']
  const isAppleDevice = APPLE_CATEGORIES.includes(form.category)

  // toggle section สเปค
  const hasSpecData = !!(
    (initial as any)?.cpu || (initial as any)?.ram ||
    (initial as any)?.storage_spec || (initial as any)?.mac_ethernet || (initial as any)?.mac_wifi
  )
  const [showSpec, setShowSpec] = useState(hasSpecData)

  const [deptFromEmp, setDeptFromEmp] = useState(true)
  const [vendors, setVendors] = useState<Vendor[]>([])

  useEffect(() => {
    createClient().from('vendors').select('id, name, phone, email').order('name')
      .then(({ data }) => setVendors(data ?? []))
  }, [])

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [empQuery, setEmpQuery] = useState('')
  const [empResults, setEmpResults] = useState<Employee[]>([])
  const [showEmpDrop, setShowEmpDrop] = useState(false)
  const empRef = useRef<HTMLDivElement>(null)
  const [assetNoError, setAssetNoError] = useState('')
  const [scanner, setScanner] = useState<'asset_no' | 'serial_no' | null>(null)
  const [saving, setSaving] = useState(false)

  // auto-generate asset_no
  const now = new Date()
  const defaultThaiYear = ((now.getFullYear() + 543) % 100).toString().padStart(2, '0')
  const defaultMonth    = (now.getMonth() + 1).toString().padStart(2, '0')
  const [autoGen, setAutoGen]     = useState(!isEdit)
  const [genYear, setGenYear]     = useState(defaultThaiYear)
  const [genMonth, setGenMonth]   = useState(defaultMonth)
  const [genLoading, setGenLoading] = useState(false)

  const generateAssetNo = async (category: string, year: string, month: string) => {
    const catCode = CATEGORY_TO_CODE[category.toLowerCase()]
    if (!catCode || !year || !month) return
    setGenLoading(true)
    try {
      const res  = await fetch(`/api/assets/next-asset-no?catCode=${catCode}&year=${year}&month=${month}`)
      const json = await res.json()
      if (json.assetNo) {
        setForm(f => ({ ...f, asset_no: json.assetNo }))
        setAssetNoError('')
      }
    } finally {
      setGenLoading(false)
    }
  }

  // รูปที่เลือกไว้ก่อน save
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)

  // Edit mode: รูปปัจจุบันที่อยู่ใน R2
  const [existingImages, setExistingImages] = useState<string[]>(
    (initial as any)?.images ?? []
  )
  const MAX_IMAGES = 10

  // โหลด employees ทั้งหมดครั้งเดียว
  useEffect(() => {
    createClient().from('employees').select('emp_id,full_name_th,full_name_en,nickname,department').order('full_name_th')
      .then(({ data }) => {
        const emps = (data ?? []) as Employee[]
        setAllEmployees(emps)
        // ถ้า edit mode และมี emp_id อยู่แล้ว ให้ set employee ด้วย
        if (initial?.emp_id) {
          const found = emps.find(e => e.emp_id === initial.emp_id)
          if (found) {
            setEmployee(found)
            setEmpQuery(found.full_name_th)
          }
        }
      })
  }, [])

  // Fuse search เมื่อ query เปลี่ยน
  useEffect(() => {
    if (!empQuery.trim()) { setEmpResults([]); return }
    const fuse = new Fuse(allEmployees, {
      keys: ['emp_id', 'full_name_th', 'full_name_en', 'nickname'],
      threshold: 0.35,
    })
    setEmpResults(fuse.search(empQuery).slice(0, 8).map(r => r.item))
  }, [empQuery, allEmployees])

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (empRef.current && !empRef.current.contains(e.target as Node)) setShowEmpDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectEmployee = (emp: Employee) => {
    setEmployee(emp)
    setForm(f => ({ ...f, emp_id: emp.emp_id, status: 'issued', ...(deptFromEmp ? { department: emp.department ?? '' } : {}) }))
    setEmpQuery(emp.full_name_th)
    setShowEmpDrop(false)
  }

  const clearEmployee = () => {
    setEmployee(null)
    setForm(f => ({ ...f, emp_id: '', status: 'returned', ...(deptFromEmp ? { department: '' } : {}) }))
    setEmpQuery('')
    setEmpResults([])
  }

  const checkAssetNo = async (val: string) => {
    if (!val || (isEdit && val === initial?.asset_no)) { setAssetNoError(''); return }
    const { data } = await createClient().from('assets').select('id').eq('asset_no', val).maybeSingle()
    setAssetNoError(data ? 'Asset No. นี้มีอยู่แล้ว' : '')
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    // ถ้าเปลี่ยน category แล้วเปิด autoGen ให้ล้าง asset_no พร้อมกันเลย
    if (k === 'category' && !isEdit && autoGen) {
      setForm(f => ({ ...f, category: val, asset_no: '' }))
    } else {
      setForm(f => ({ ...f, [k]: val }))
    }
    if (k === 'asset_no') checkAssetNo(val)
  }

  const onScanResult = useCallback((value: string, target: 'asset_no' | 'serial_no') => {
    setForm(f => ({ ...f, [target]: value }))
    if (target === 'asset_no') checkAssetNo(value)
  }, [])

  const addPendingFiles = (files: FileList) => {
    const total = existingImages.length + pendingFiles.length + files.length
    if (total > MAX_IMAGES) { alert(`สูงสุด ${MAX_IMAGES} รูป`); return }
    const newFiles = Array.from(files)
    setPendingFiles(prev => [...prev, ...newFiles])
    newFiles.forEach(f => setPreviewUrls(prev => [...prev, URL.createObjectURL(f)]))
  }

  const removePending = (i: number) => {
    URL.revokeObjectURL(previewUrls[i])
    setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
    setPreviewUrls(prev => prev.filter((_, idx) => idx !== i))
  }

  // ลบรูปเก่าออกจาก R2 + Supabase (Edit mode)
  const removeExisting = async (key: string) => {
    const res = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (!res.ok) {
      alert('ลบรูปไม่สำเร็จ กรุณาลองใหม่')
      return
    }
    const updated = existingImages.filter(k => k !== key)
    setExistingImages(updated)
    await createClient().from('assets').update({ images: updated }).eq('id', initial!.id!)
    await insertAssetLog({ asset_id: initial!.id!, action: 'image_removed', detail: key, performed_by: userId })
  }

  const backupToDrive = (compressed: File, key: string, assetNo: string) => {
    const form = new FormData()
    form.append('file', compressed, `${key.replace(/\//g, '_')}.webp`)
    form.append('assetNo', assetNo)
    form.append('filename', `${key.replace(/\//g, '_')}.webp`)
    fetch('/api/drive/backup', { method: 'POST', body: form }).catch(() => {})
  }

  // upload รูปใหม่ไปที่ R2 + backup Drive
  // Edit mode: ต่อจาก existingImages | Add mode: เริ่มใหม่
  const uploadImages = async (assetId: string, assetNo: string) => {
    if (!pendingFiles.length) return existingImages
    setUploadingImages(true)
    const supabase = createClient()

    // ถ้า Edit: ลบรูปที่เหลืออยู่ใน R2 ก่อน (รูปที่ user ลบไปแล้วก่อนหน้า ถูก removeExisting จัดการไปแล้ว)
    if (isEdit && existingImages.length > 0) {
      await Promise.allSettled(
        existingImages.map(key =>
          fetch('/api/r2/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
          })
        )
      )
    }

    const newKeys: string[] = []
    try {
      for (const file of pendingFiles) {
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

        await insertAssetLog({ asset_id: assetId, action: 'image_added', detail: key, performed_by: userId })
        backupToDrive(compressed, key, assetNo)
      }

      // R2 เก็บแค่รูปใหม่ (ล้างเก่าแล้ว)
      await supabase.from('assets').update({ images: newKeys }).eq('id', assetId)
      setExistingImages(newKeys)
    } finally {
      setUploadingImages(false)
    }
    return newKeys
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (assetNoError) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      ...form,
      emp_id:         form.emp_id || null,
      purchase_date:  form.purchase_date || null,
      received_date:  form.received_date || null,
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      vendor_id:      form.vendor_id || null,
      apple_id:       isAppleDevice ? (form.apple_id || null) : null,
      department:     form.department || null,
      // spec fields
      account_category: form.account_category || 'IT',
      stored_at:      form.stored_at || null,
      cpu:            form.cpu || null,
      ram:            form.ram || null,
      storage_spec:   form.storage_spec || null,
      mac_ethernet:   form.mac_ethernet || null,
      mac_wifi:       form.mac_wifi || null,
      branch:         form.branch || null,
      quantity:       form.quantity ? parseInt(form.quantity) : 1,
    }

    if (isEdit) {
      const FIELD_LABELS: Record<string, string> = {
        asset_no: 'Asset No.', name: 'ชื่อ', category: 'ประเภท', brand: 'ยี่ห้อ',
        model: 'รุ่น', serial_no: 'Serial No.', status: 'สถานะ', location: 'ที่ตั้ง',
        purchase_date: 'วันที่ซื้อ', received_date: 'วันที่ได้รับ',
        original_price: 'มูลค่าเริ่มต้น', vendor_id: 'Vendor', notes: 'หมายเหตุ', emp_id: 'พนักงาน',
        apple_id: 'Apple ID',
      }
      // field ที่ไม่แสดงค่า (sensitive)
      const CENSORED_FIELDS = new Set(['apple_id'])
      const DATE_FIELDS = new Set(['purchase_date', 'received_date'])
      const STATUS_LABELS: Record<string, string> = {
        available: 'ว่าง', issued: 'จ่าย', returned: 'รับคืน',
        damaged: 'ชำรุด', repair: 'ส่งซ่อม', writeoff: 'Write Off',
        hold: 'Hold', spare: 'Spare',
        active: 'จ่าย', storage: 'ว่าง', // legacy
      }
      // map vendor_id → vendor name
      const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]))
      const formatVal = (k: string, v: string) => {
        if (!v) return '(ว่าง)'
        if (DATE_FIELDS.has(k)) return new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        if (k === 'status') return STATUS_LABELS[v] ?? v
        if (k === 'vendor_id') return vendorMap[v] ?? v
        return v
      }
      const normalize = (k: string, v: string) => DATE_FIELDS.has(k) ? v.slice(0, 10) : v
      const changedLines = (Object.keys(form) as (keyof typeof form)[])
        .filter(k => k in FIELD_LABELS)
        .filter(k => normalize(k, String(form[k] ?? '')) !== normalize(k, String(initial?.[k] ?? '')))
        .map(k => {
          const label = FIELD_LABELS[k]
          if (CENSORED_FIELDS.has(k)) return `แก้ไข ${label}`
          const oldVal = formatVal(k, String(initial?.[k] ?? ''))
          const newVal = formatVal(k, String(form[k] ?? ''))
          return `${label}: ${oldVal} → ${newVal}`
        })
      const detail = changedLines.length ? changedLines.join('\n') : undefined
      await supabase.from('assets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', initial!.id!)
      await insertAssetLog({ asset_id: initial!.id!, action: 'updated', performed_by: userId, detail })
      // upload รูปใหม่ (ถ้ามี) → ลบเก่าใน R2, backup Drive
      if (pendingFiles.length > 0) {
        try {
          await uploadImages(initial!.id!, initial!.asset_no!)
        } catch (e) {
          console.error('Upload image failed (edit):', e)
          alert('บันทึกข้อมูลสำเร็จ แต่ upload รูปไม่ได้ — กรุณาตรวจสอบการเชื่อมต่อ')
        }
      }
      // sync to Google Sheets (fire-and-forget)
      fetch('/api/sheets-sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: initial!.id! }),
      }).catch(() => {})
      onSave?.(initial!.id!)
    } else {
      // double-check duplicate asset_no before insert
      if (form.asset_no) {
        const { data: dup } = await supabase.from('assets').select('id').eq('asset_no', form.asset_no.trim()).maybeSingle()
        if (dup) {
          setAssetNoError('Asset No. นี้มีอยู่แล้ว')
          setSaving(false)
          return
        }
      }
      const { data, error } = await supabase.from('assets').insert({ ...payload, images: [], created_by: userId }).select().single()
      if (error) {
        alert('เพิ่ม Asset ไม่สำเร็จ: ' + error.message)
        setSaving(false)
        return
      }
      if (data) {
        await insertAssetLog({ asset_id: data.id, action: 'created', performed_by: userId })
        try {
          await uploadImages(data.id, data.asset_no)
        } catch (e) {
          console.error('Upload image failed:', e)
          alert('บันทึก Asset สำเร็จ แต่ upload รูปไม่ได้ — กรุณาตรวจสอบ CORS ของ R2')
        }
        // sync to Google Sheets (fire-and-forget)
        fetch('/api/sheets-sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: data.id }),
        }).catch(() => {})
        router.push(`/assets/${data.id}`)
      }
    }
    setSaving(false)
  }

  const inp = 'w-full border border-gray-300 dark:border-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-400'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'

  const sec = 'md:col-span-2 pt-4 mt-2 border-t border-gray-100 dark:border-gray-700'
  const secLabel = 'text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3'

  return (
    <>
      {scanner && <BarcodeScannerModal target={scanner} onResult={onScanResult} onClose={() => setScanner(null)} />}
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">

        {/* ── ข้อมูลหลัก ── */}
        {/* Asset No */}
        <div className={!isEdit ? 'md:col-span-2' : ''}>
          <div className="flex items-center justify-between mb-1">
            <label className={lbl + ' mb-0'}>Asset No. *</label>
            {!isEdit && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoGen}
                  onChange={e => setAutoGen(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-600"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">สร้างเลขอัตโนมัติ</span>
              </label>
            )}
          </div>

          {/* auto-generate controls */}
          {!isEdit && autoGen && (
            <div className="flex flex-wrap gap-2 mb-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">ปี พ.ศ. (2 หลัก)</span>
                <input
                  type="text"
                  maxLength={2}
                  value={genYear}
                  onChange={e => setGenYear(e.target.value.replace(/\D/g, ''))}
                  placeholder="69"
                  className="w-14 border border-gray-300 dark:border-gray-500 rounded px-2 py-1 text-sm text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600 dark:text-gray-300">เดือน</span>
                <select
                  value={genMonth}
                  onChange={e => setGenMonth(e.target.value)}
                  className="border border-gray-300 dark:border-gray-500 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = (i + 1).toString().padStart(2, '0')
                    const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
                    return <option key={m} value={m}>{m} {names[i]}</option>
                  })}
                </select>
              </div>
              <button
                type="button"
                onClick={() => generateAssetNo(form.category, genYear, genMonth)}
                disabled={genLoading || genYear.length !== 2}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {genLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                Generate
              </button>
              {!CATEGORY_TO_CODE[form.category.toLowerCase()] && (
                <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                  ประเภท "{form.category}" ยังไม่มี category code — กรุณากรอก Asset No. เอง
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={form.asset_no}
              onChange={set('asset_no')}
              required
              readOnly={!isEdit && autoGen && !!form.asset_no}
              placeholder={autoGen ? 'กด Generate เพื่อสร้างเลข' : 'e.g. IT-6906-01-0001'}
              className={`${inp} flex-1 ${!isEdit && autoGen && form.asset_no ? 'bg-gray-50 dark:bg-gray-800 cursor-default' : ''}`}
            />
            {(!autoGen || isEdit) && (
              <button type="button" onClick={() => setScanner('asset_no')} className="px-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                <ScanLine size={16} className="text-gray-500 dark:text-gray-400" />
              </button>
            )}
            {!isEdit && autoGen && form.asset_no && (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, asset_no: '' }))}
                title="ล้างเพื่อ generate ใหม่"
                className="px-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <X size={16} className="text-gray-400" />
              </button>
            )}
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
            <button type="button" onClick={() => setScanner('serial_no')} className="px-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <ScanLine size={16} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Apple ID — เฉพาะ Apple device */}
        {isAppleDevice && (
          <div>
            <label className={lbl}>
              Apple ID
              <span className="ml-1.5 text-xs text-gray-400 font-normal">(iCloud email)</span>
            </label>
            <input
              type="email"
              value={form.apple_id}
              onChange={set('apple_id')}
              placeholder="example@icloud.com"
              className={inp}
              autoComplete="off"
            />
          </div>
        )}

        {/* Location */}
        <div>
          <label className={lbl}>Location</label>
          <input value={form.location} onChange={set('location')} className={inp} />
        </div>

        {/* Branch */}
        <div>
          <label className={lbl}>Branch / สาขา</label>
          <input value={form.branch} onChange={set('branch')} placeholder="เช่น HQ, สาขา 1" className={inp} />
        </div>

        {/* Stored At + Quantity */}
        <div>
          <label className={lbl}>เก็บไว้ที่</label>
          <input value={form.stored_at} onChange={set('stored_at')} placeholder="เช่น ตู้ Server ชั้น 2" className={inp} />
        </div>
        <div>
          <label className={lbl}>จำนวน</label>
          <input type="number" min="1" value={form.quantity} onChange={set('quantity')} className={inp} />
        </div>

        {/* Account Category */}
        <div>
          <label className={lbl}>หมวดบัญชี</label>
          <select value={form.account_category} onChange={set('account_category')} className={inp}>
            <option value="IT">IT</option>
            <option value="FA">FA</option>
          </select>
        </div>

        {/* ── การมอบหมาย ── */}
        <div className={sec}>
          <p className={secLabel}>การมอบหมาย</p>
        </div>

        {/* Employee search combobox */}
        <div ref={empRef} className="relative md:col-span-2">
          <label className={lbl}>พนักงาน</label>
          <div className="relative">
            <input
              value={empQuery}
              onChange={e => { setEmpQuery(e.target.value); setShowEmpDrop(true); if (!e.target.value) clearEmployee() }}
              onFocus={() => { if (empQuery) setShowEmpDrop(true) }}
              placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัสพนักงาน..."
              className={`${inp} pr-8`}
              autoComplete="off"
            />
            {employee
              ? <button type="button" onClick={clearEmployee} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={14} /></button>
              : <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            }
          </div>

          {/* Selected badge */}
          {employee && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <span className="font-mono bg-indigo-50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">{employee.emp_id}</span>
              {employee.nickname && <span>({employee.nickname})</span>}
              {employee.department && <span className="text-gray-400 dark:text-gray-500">· {employee.department}</span>}
            </p>
          )}

          {/* Dropdown results */}
          {showEmpDrop && empResults.length > 0 && (
            <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {empResults.map(emp => (
                <li key={emp.emp_id}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectEmployee(emp) }}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center gap-3 text-sm"
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                      {emp.full_name_th.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-gray-100 truncate">
                        {emp.full_name_th}
                        {emp.nickname && <span className="text-gray-400 dark:text-gray-500 font-normal"> ({emp.nickname})</span>}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {emp.emp_id}{emp.full_name_en ? ` · ${emp.full_name_en}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Department */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={lbl}>แผนก</label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deptFromEmp}
                onChange={e => {
                  setDeptFromEmp(e.target.checked)
                  if (e.target.checked && employee?.department) setForm(f => ({ ...f, department: employee.department ?? '' }))
                }}
                className="w-3.5 h-3.5 accent-indigo-600"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">อ้างอิงจากพนักงาน</span>
            </label>
          </div>
          <select
            value={form.department}
            onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
            disabled={deptFromEmp}
            className={`${inp} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">— ไม่ระบุ —</option>
            {[...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort().map(d => (
              <option key={d!} value={d!}>{d}</option>
            ))}
          </select>
        </div>

        {/* Received Date — อยู่ใต้แผนก ในกลุ่มการมอบหมาย */}
        <div>
          <label className={lbl}>วันที่ได้รับ</label>
          <input type="date" value={form.received_date} onChange={set('received_date')} className={inp} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">วันที่พนักงานรับเครื่องไป</p>
        </div>

        {/* ── มูลค่าและวันที่ซื้อ ── */}
        <div className={sec}>
          <p className={secLabel}>มูลค่าและวันที่ซื้อ</p>
        </div>

        {/* Vendor */}
        <div className="md:col-span-2">
          <label className={lbl}>Vendor / ซื้อจาก</label>
          <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))} className={inp}>
            <option value="">— ไม่ระบุ —</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>{v.name}{v.phone ? ` · ${v.phone}` : ''}</option>
            ))}
          </select>
          {form.vendor_id && (() => {
            const v = vendors.find(v => v.id === form.vendor_id)
            return v?.email ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                📧 {v.email}
              </p>
            ) : null
          })()}
        </div>

        {/* Original Price */}
        <div>
          <label className={lbl}>มูลค่าทรัพย์สิน (บาท)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.original_price}
            onChange={set('original_price')}
            placeholder="0.00"
            className={inp}
          />
          {form.original_price && parseFloat(form.original_price) > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              ตัดค่าเสื่อม {(parseFloat(form.original_price) / 60).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท/เดือน
            </p>
          )}
        </div>

        {/* Purchase Date */}
        <div>
          <label className={lbl}>วันที่ซื้อ</label>
          <input type="date" value={form.purchase_date} onChange={set('purchase_date')} className={inp} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ใช้คำนวณ Book Valued</p>
        </div>

        {/* ── ข้อมูลสเปค (optional toggle) ── */}
        <div className={sec}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSpec}
              onChange={e => setShowSpec(e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className={secLabel + ' mb-0'}>ข้อมูลสเปค (CPU / RAM / Storage / Mac Address)</span>
          </label>
        </div>

        {showSpec && (
          <>
            {/* CPU + RAM */}
            <div>
              <label className={lbl}>CPU</label>
              <input value={form.cpu} onChange={set('cpu')} placeholder="เช่น Intel Core i7-1165G7" className={inp} />
            </div>
            <div>
              <label className={lbl}>RAM</label>
              <input value={form.ram} onChange={set('ram')} placeholder="เช่น 16GB DDR4" className={inp} />
            </div>

            {/* Storage */}
            <div>
              <label className={lbl}>Storage</label>
              <input value={form.storage_spec} onChange={set('storage_spec')} placeholder="เช่น SSD 512GB" className={inp} />
            </div>

            {/* Mac Addresses */}
            <div>
              <label className={lbl}>Mac Address (Ethernet)</label>
              <input value={form.mac_ethernet} onChange={set('mac_ethernet')} placeholder="xx:xx:xx:xx:xx:xx" className={inp} />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>Mac Address (Wifi)</label>
              <input value={form.mac_wifi} onChange={set('mac_wifi')} placeholder="xx:xx:xx:xx:xx:xx" className={inp} />
            </div>
          </>
        )}

        {/* ── หมายเหตุ ── */}
        <div className={sec}>
          <p className={secLabel}>หมายเหตุ</p>
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="หมายเหตุเพิ่มเติม..." className={inp} />
        </div>

        {/* รูปภาพ */}
        <div className="md:col-span-2">
          <label className={lbl}>
            รูปภาพ (สูงสุด {MAX_IMAGES} รูป)
            {isEdit && <span className="ml-2 text-xs text-gray-400 font-normal">· เลือกรูปใหม่จะแทนที่รูปเดิมทั้งหมดใน R2 (Drive เก็บประวัติไว้)</span>}
          </label>

          {/* รูปปัจจุบันใน R2 (Edit mode) */}
          {isEdit && existingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {existingImages.map((key) => (
                <div key={key} className="relative w-20 h-20 group">
                  <img
                    src={r2PublicUrl(key)}
                    alt=""
                    className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => removeExisting(key)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Preview รูปที่กำลังจะ upload */}
          {previewUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative w-20 h-20">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-lg border-2 border-indigo-400" />
                  <button type="button" onClick={() => removePending(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
                    <X size={11} />
                  </button>
                  <span className="absolute bottom-1 left-1 text-[9px] bg-indigo-600 text-white px-1 rounded">ใหม่</span>
                </div>
              ))}
            </div>
          )}

          {/* ปุ่มถ่ายรูป / เลือกรูป */}
          {existingImages.length + pendingFiles.length < MAX_IMAGES && (
            <div className="flex gap-2">
              <button type="button" onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Camera size={15} /> ถ่ายรูป
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Upload size={15} /> เลือกรูป
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500 self-center">
                {existingImages.length + pendingFiles.length}/{MAX_IMAGES}
              </span>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => e.target.files && addPendingFiles(e.target.files)} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => e.target.files && addPendingFiles(e.target.files)} />
        </div>

        {/* Buttons */}
        <div className="md:col-span-2 flex gap-3 justify-end">
          <button type="button" onClick={() => onCancel ? onCancel() : router.back()}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
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
