'use client'
import { use, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, AssetLog, Employee } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import { useRole } from '@/hooks/useRole'
import { useUserNames } from '@/hooks/useUserNames'
import { canEdit, canDelete, canTransfer } from '@/lib/permissions'
import AssetForm from '@/components/assets/AssetForm'
import EmployeeProfilePopup from '@/components/assets/EmployeeProfilePopup'
import TransferModal from '@/components/assets/TransferModal'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Trash2, Pencil, ChevronRight, Plus, Clock, Info, Image as ImageIcon, X, MoreHorizontal, AlertTriangle, TrendingDown, Camera, Upload } from 'lucide-react'

function calcDepreciation(originalPrice: number, receivedDate: string) {
  const received = new Date(receivedDate)
  const now = new Date()

  // นับเดือนจริงโดยคำนึงถึงวัน
  let elapsedMonths = (now.getFullYear() - received.getFullYear()) * 12 + (now.getMonth() - received.getMonth())
  if (now.getDate() < received.getDate()) elapsedMonths -= 1
  elapsedMonths = Math.max(0, elapsedMonths)

  // อายุเครื่องจริง (ไม่จำกัด 60)
  const ageYears = Math.floor(elapsedMonths / 12)
  const ageMonths = elapsedMonths % 12
  const ageLabel = [ageYears > 0 ? `${ageYears} ปี` : '', ageMonths > 0 ? `${ageMonths} เดือน` : ''].filter(Boolean).join(' ') || 'น้อยกว่า 1 เดือน'

  // ค่าเสื่อมใช้เดือนจำกัดที่ 60
  const depMonths = Math.min(elapsedMonths, 60)
  const monthly = originalPrice / 60
  const bookValue = Math.max(0, originalPrice - depMonths * monthly)
  const pct = (bookValue / originalPrice) * 100

  return { bookValue, elapsedMonths, depMonths, monthly, ageLabel, pct }
}

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:    { label: 'ใช้งาน', cls: 'bg-green-100 text-green-700' },
  available: { label: 'ว่าง',   cls: 'bg-gray-100 text-gray-600' },
  repair:    { label: 'ซ่อม',   cls: 'bg-amber-100 text-amber-700' },
  storage:   { label: 'Stock',  cls: 'bg-blue-100 text-blue-700' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created:       { label: 'เพิ่ม Asset เข้าระบบ',     color: 'bg-green-500' },
  updated:       { label: 'แก้ไขข้อมูล',               color: 'bg-blue-500' },
  assigned:      { label: 'มอบหมายให้',                color: 'bg-indigo-500' },
  transferred:   { label: 'โอนย้าย',                   color: 'bg-purple-500' },
  image_added:   { label: 'อัปโหลดรูปถ่าย',            color: 'bg-teal-500' },
  image_removed: { label: 'ลบรูปภาพ',                  color: 'bg-red-400' },
  imported:      { label: 'นำเข้าจาก Import',          color: 'bg-gray-400' },
  deleted:       { label: 'ลบ Asset',                  color: 'bg-red-600' },
  unassigned:    { label: 'เอาผู้ใช้งานออก',           color: 'bg-orange-400' },
  received:      { label: 'รับเครื่อง',                color: 'bg-cyan-500' },
}

function GalleryLightbox({ images, index, r2Public, onClose, onChange }: {
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
      {/* ปุ่มปิด */}
      <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={onClose}>
        <X size={24} />
      </button>
      {/* counter */}
      <p className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-sm">{index + 1} / {images.length}</p>

      {/* ปุ่มซ้าย */}
      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onChange(index - 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors">
          <ChevronRight size={24} className="rotate-180" />
        </button>
      )}

      {/* รูปหลัก */}
      <img
        src={`${r2Public}/${images[index]}`}
        className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg select-none"
        onClick={e => e.stopPropagation()}
      />

      {/* ปุ่มขวา */}
      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onChange(index + 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors">
          <ChevronRight size={24} />
        </button>
      )}

      {/* thumbnail strip */}
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

export default function AssetDetailContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id } = use(paramsPromise)
  const { role, userId } = useRole()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [logs, setLogs] = useState<AssetLog[]>([])
  const [showEmployee, setShowEmployee] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [showMore, setShowMore] = useState(false)
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  const load = async () => {
    const supabase = createClient()
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase.from('assets').select('*, employees(*)').eq('id', id).single(),
      supabase.from('asset_logs').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
    ])
    setAsset(a as Asset)
    setLogs(l ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const userNames = useUserNames(logs.map(l => l.performed_by))

  const del = () => {
    setAlertDialog({
      title: 'ยืนยันการลบ Asset',
      message: `${asset?.asset_no ? asset.asset_no + ' · ' : ''}${asset?.name}`,
      onConfirm: async () => {
        const supabase = createClient()
        await insertAssetLog({ asset_id: id, action: 'deleted', performed_by: userId, detail: `${asset?.name}|${asset?.asset_no ?? ''}` })
        await supabase.from('assets').delete().eq('id', id)
        router.push('/assets')
      },
    })
  }

  const handleUploadFiles = async (files: FileList) => {
    if (!asset) return
    const { compressImage } = await import('@/lib/compressImage')
    const { assetImageKey, getNextImageIndex } = await import('@/lib/r2')
    const supabase = createClient()
    const newKeys = [...asset.images]
    for (const file of Array.from(files)) {
      if (newKeys.length >= 5) break
      const compressed = await compressImage(file)
      const idx = await getNextImageIndex(newKeys)
      const key = assetImageKey(asset.asset_no, idx)
      const { url } = await fetch('/api/r2/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).then(r => r.json())
      await fetch(url, { method: 'PUT', body: compressed, headers: { 'Content-Type': 'image/webp' } })
      newKeys.push(key)
      await insertAssetLog({ asset_id: asset.id, action: 'image_added', detail: key, performed_by: userId })
    }
    await supabase.from('assets').update({ images: newKeys }).eq('id', asset.id)
    await load()
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">Loading...</div>
  if (!asset) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">ไม่พบ Asset</div>

  const employee = asset.employees as unknown as Employee | null
  const status = STATUS_MAP[asset.status] ?? { label: asset.status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <>
      {/* Gallery Lightbox */}
      {lightbox !== null && asset && (
        <GalleryLightbox
          images={asset.images}
          index={lightbox}
          r2Public={R2_PUBLIC}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}

      {alertDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAlertDialog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAlertDialog(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{alertDialog.title}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">{alertDialog.message}</p>
            <div className="flex gap-2">
              <button onClick={() => setAlertDialog(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                ยกเลิก
              </button>
              <button onClick={() => { alertDialog.onConfirm(); setAlertDialog(null) }}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmployee && employee && (
        <EmployeeProfilePopup employee={employee} onClose={() => setShowEmployee(false)} />
      )}
      {showTransfer && userId && (
        <TransferModal asset={asset} userId={userId} mode={employee ? 'transfer' : 'assign'} onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); load() }} />
      )}

      <div className="max-w-6xl mx-auto space-y-4">

        {/* ── Header bar ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-5 sm:py-4">

          {/* Mobile: 2 rows */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => router.push('/assets')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium">
                <span>Asset All</span>
                <ChevronRight size={13} />
              </button>
              <div className="flex items-center gap-2">
                {canTransfer(role) && !editing && (
                  <button onClick={() => setShowTransfer(true)}
                    className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-lg">
                    <ArrowLeftRight size={15} />
                  </button>
                )}
                {canEdit(role) && (
                  <button onClick={() => setEditing(e => !e)}
                    className="p-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Pencil size={15} />
                  </button>
                )}
                {canDelete(role) && (
                  <button onClick={del}
                    className="p-2 border border-red-200 dark:border-red-800 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-2xl shrink-0">
                {CAT_ICON[asset.category] ?? '📦'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono font-semibold text-indigo-500 dark:text-indigo-400">{asset.asset_no || '—'}</p>
                <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">{asset.name}</h2>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{asset.category}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                  {asset.location && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">{asset.location}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: 1 row เหมือนเดิม */}
          <div className="hidden sm:flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.push('/assets')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0 text-sm font-medium">
                <span>Asset All</span>
                <ChevronRight size={14} />
              </button>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-2xl shrink-0">
                {CAT_ICON[asset.category] ?? '📦'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono font-semibold text-indigo-500 dark:text-indigo-400">{asset.asset_no || '—'}</p>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 truncate">{asset.name}</h2>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{asset.category}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                  {asset.location && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">{asset.location}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canTransfer(role) && !editing && (
                <button onClick={() => setShowTransfer(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                  <ArrowLeftRight size={14} /> โอนย้าย
                </button>
              )}
              {canEdit(role) && (
                <button onClick={() => setEditing(e => !e)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Pencil size={14} /> {editing ? 'ยกเลิก' : 'แก้ไข'}
                </button>
              )}
              {canDelete(role) && (
                <button onClick={del}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-800 text-red-500 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {editing ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">แก้ไข Asset</h3>
            <AssetForm initial={asset} userId={userId ?? ''} onSave={() => { setEditing(false); load() }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* ── คอลัมน์ซ้าย (3/5) ── */}
            <div className="lg:col-span-3 space-y-4">

              {/* ข้อมูลอุปกรณ์ */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">ข้อมูลอุปกรณ์</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    ['ยี่ห้อ', asset.brand],
                    ['รุ่น', asset.model],
                    ['Serial No.', asset.serial_no],
                    ['Location', asset.location],
                    ['แผนก', (asset as any).department],
                    ['วันที่ซื้อ', asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : null],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{k}</p>
                      <p className={`text-sm font-semibold ${v ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                        {v || '—'}
                      </p>
                    </div>
                  ))}
                </div>
                {asset.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">หมายเหตุ</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{asset.notes}</p>
                  </div>
                )}
              </div>

              {/* Book Valued */}
              {asset.original_price != null && asset.original_price > 0 && (() => {
                const baseDate = asset.purchase_date
                const dep = baseDate ? calcDepreciation(asset.original_price, baseDate) : null
                return (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">มูลค่าทรัพย์สิน</p>
                    {!dep ? (
                      <p className="text-xs text-amber-500">กรุณากรอกวันที่ซื้อเพื่อคำนวณค่าเสื่อม</p>
                    ) : (
                      <div>
                        {/* 3 stat boxes */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">มูลค่าเริ่มต้น</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                              {asset.original_price.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ฿
                            </p>
                          </div>
                          <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-3 text-center">
                            <p className="text-xs text-indigo-400 dark:text-indigo-400 mb-1">อายุเครื่อง</p>
                            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{dep.ageLabel}</p>
                          </div>
                          <div className={`rounded-xl p-3 text-center ${dep.pct > 50 ? 'bg-green-50 dark:bg-green-900/20' : dep.pct > 20 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                            <p className={`text-xs mb-1 ${dep.pct > 50 ? 'text-green-500' : dep.pct > 20 ? 'text-amber-500' : 'text-red-400'}`}>Book Valued</p>
                            <p className={`text-sm font-bold ${dep.pct > 50 ? 'text-green-700 dark:text-green-300' : dep.pct > 20 ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400'}`}>
                              {dep.bookValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ฿
                            </p>
                          </div>
                        </div>
                        {/* progress */}
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                            <span>ตัดค่าเสื่อมไปแล้ว {dep.depMonths} เดือน</span>
                            <span>เหลือ {dep.pct.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${dep.pct > 50 ? 'bg-green-500' : dep.pct > 20 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${dep.pct}%` }} />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                            ค่าเสื่อม {dep.monthly.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ฿/เดือน · ครบกำหนด 60 เดือน
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* รูปภาพ */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* hidden inputs */}
                <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => e.target.files && handleUploadFiles(e.target.files)} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files && handleUploadFiles(e.target.files)} />

                {/* รูปหลัก */}
                {asset.images.length > 0 ? (
                  <div className="relative aspect-video bg-gray-100 dark:bg-gray-900 cursor-pointer group"
                    onClick={() => setLightbox(0)}>
                    <img src={`${R2_PUBLIC}/${asset.images[0]}`} className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-all bg-black/30 px-3 py-1 rounded-full">
                        คลิกเพื่อดูทั้งหมด
                      </span>
                    </div>
                  </div>
                ) : canEdit(role) ? (
                  <div className="aspect-video bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-3">
                    <ImageIcon size={36} className="text-gray-200 dark:text-gray-700" />
                    <p className="text-xs text-gray-400 dark:text-gray-500">ยังไม่มีรูปภาพ</p>
                    <div className="flex gap-2">
                      <button onClick={() => cameraRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                        <Camera size={13} /> ถ่ายรูป
                      </button>
                      <button onClick={() => uploadRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <Upload size={13} /> เลือกรูป
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-2">
                    <ImageIcon size={36} className="text-gray-200 dark:text-gray-700" />
                    <p className="text-xs text-gray-300 dark:text-gray-600">ยังไม่มีรูปภาพ</p>
                  </div>
                )}

                {/* thumbnail strip */}
                <div className="p-3 flex gap-2">
                  {[0,1,2,3,4].map(i => {
                    const key = asset.images[i]
                    const isEmpty = !key
                    const isNextSlot = isEmpty && i === asset.images.length && canEdit(role) && asset.images.length < 5
                    return key ? (
                      <div key={i} className="relative group w-14 h-14 shrink-0">
                        <img src={`${R2_PUBLIC}/${key}`} onClick={() => setLightbox(i)}
                          className="w-full h-full object-cover rounded-lg border-2 border-transparent hover:border-indigo-400 cursor-pointer transition-all" />
                        {canEdit(role) && (
                          <button onClick={() => setAlertDialog({
                            title: 'ลบรูปภาพ',
                            message: 'ต้องการลบรูปนี้ออกจาก Asset ใช่ไหม?',
                            onConfirm: async () => {
                              const supabase = createClient()
                              await fetch('/api/r2/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
                              const newKeys = asset.images.filter(k => k !== key)
                              await supabase.from('assets').update({ images: newKeys }).eq('id', asset.id)
                              await insertAssetLog({ asset_id: asset.id, action: 'image_removed', detail: key, performed_by: userId })
                              await load()
                            },
                          })} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow">
                            <X size={9} />
                          </button>
                        )}
                      </div>
                    ) : isNextSlot ? (
                      <button key={i} onClick={() => uploadRef.current?.click()}
                        className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 flex items-center justify-center transition-colors"
                        title="อัปโหลดรูป">
                        <Plus size={16} className="text-indigo-400" />
                      </button>
                    ) : (
                      <div key={i} className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-gray-100 dark:border-gray-700" />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── คอลัมน์ขวา (2/5) ── */}
            <div className="lg:col-span-2 space-y-4">

              {/* ผู้ใช้งาน */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">ผู้ใช้งานปัจจุบัน</p>
                  {canTransfer(role) && employee && (
                    <button onClick={() => setShowTransfer(true)}
                      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                      <ArrowLeftRight size={11} /> โอนย้าย
                    </button>
                  )}
                </div>
                {employee ? (
                  <div className="space-y-2">
                    <button onClick={() => setShowEmployee(true)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-300 text-sm shrink-0">
                        {employee.full_name_th.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{employee.full_name_th}</p>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${employee.status === 'active' ? 'bg-green-100 text-green-700' : employee.status === 'probation' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                            {employee.status === 'active' ? 'Active' : employee.status === 'probation' ? 'Probation' : 'Resign'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{employee.emp_id} · {employee.department}</p>
                      </div>
                    </button>
                    {asset.received_date && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                        <Clock size={12} className="text-cyan-500 shrink-0" />
                        <p className="text-xs text-cyan-700 dark:text-cyan-300">
                          รับเครื่องเมื่อ {new Date(asset.received_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    )}
                    {canEdit(role) && (
                      <button onClick={() => setAlertDialog({
                        title: 'เอาผู้ใช้งานออก',
                        message: `ถอด ${employee.full_name_th} ออกจาก Asset นี้ใช่ไหม?`,
                        onConfirm: async () => {
                          const supabase = createClient()
                          await supabase.from('assets').update({ emp_id: null, status: 'available', updated_at: new Date().toISOString() }).eq('id', id)
                          await insertAssetLog({ asset_id: id, action: 'unassigned', performed_by: userId, detail: `${employee.emp_id} ${employee.full_name_th}` })
                          load()
                        },
                      })}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <X size={12} /> เอาผู้ใช้งานออก
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto">
                      <span className="text-2xl">👤</span>
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-500">ยังไม่ได้มอบหมาย</p>
                    {canTransfer(role) && (
                      <button onClick={() => setShowTransfer(true)}
                        className="flex items-center gap-1.5 mx-auto px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                        <ArrowLeftRight size={12} /> เพิ่มผู้ใช้งาน
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Activity Log */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">ประวัติการเปลี่ยนแปลง</p>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {logs.map((log, idx) => {
                    const a = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-400' }
                    const isLast = idx === logs.length - 1
                    return (
                      <div key={log.id} className="flex gap-3">
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-2 h-2 rounded-full mt-1.5 ${a.color}`} />
                          {!isLast && <div className="w-px flex-1 bg-gray-100 dark:bg-gray-700 mt-1" />}
                        </div>
                        <div className="pb-3 flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
                            {a.label}
                            {log.detail && log.action === 'transferred' && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1 text-xs">{log.detail}</span>
                            )}
                            {log.action === 'assigned' && log.detail && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1 text-xs">· {log.detail}</span>
                            )}
                            {log.action === 'unassigned' && log.detail && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1 text-xs">· {log.detail}</span>
                            )}
                          </p>
                          {log.action === 'updated' && log.detail && (
                            <ul className="mt-1 space-y-0.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                              {log.detail.split('\n').map((line, i) => (
                                <li key={i} className="text-xs text-gray-500 dark:text-gray-400">{line}</li>
                              ))}
                            </ul>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
                            <span>{new Date(log.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                            {log.performed_by && (
                              <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">
                                {userNames[log.performed_by] ?? '...'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {!logs.length && (
                    <div className="text-center py-6">
                      <Clock size={24} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                      <p className="text-gray-400 dark:text-gray-500 text-xs">ยังไม่มี activity</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ข้อมูลระบบ */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">ข้อมูลระบบ</p>
                <div className="space-y-2 text-xs">
                  {[
                    ['Asset ID', asset.id.slice(0, 8) + '...'],
                    ['สร้างเมื่อ', asset.created_at ? new Date(asset.created_at).toLocaleDateString('th-TH') : '-'],
                    ['แก้ไขล่าสุด', asset.updated_at ? new Date(asset.updated_at).toLocaleDateString('th-TH') : '-'],
                    ['รูปภาพ', `${asset.images.length} / 5 ไฟล์`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="text-gray-400 dark:text-gray-500">{k}</span>
                      <span className="text-gray-600 dark:text-gray-300 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
