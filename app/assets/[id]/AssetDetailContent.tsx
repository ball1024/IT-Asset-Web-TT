'use client'
import { use, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, AssetLog, Employee, Vendor, ConditionCheck } from '@/lib/supabase'
import { getAssetById, deleteAsset, updateAsset, updateAssetImages } from '@/services/assetService'
import { getAssetLogs } from '@/services/logService'
import { getLastHandoverByAsset } from '@/services/conditionCheckService'
import { CONDITION_ITEM_LABELS, ACCESSORY_LABELS } from '@/lib/supabase'
import { ACTION_LABELS } from '@/lib/assetConstants'
import { insertAssetLog } from '@/lib/logging'
import { useRole } from '@/hooks/useRole'
import { useUserNames } from '@/hooks/useUserNames'
import { canEdit, canDelete, canTransfer } from '@/lib/permissions'
import AssetForm from '@/components/assets/AssetForm'
import EmployeeProfilePopup from '@/components/assets/EmployeeProfilePopup'
import VendorPopup from '@/components/assets/VendorPopup'
import TransferModal from '@/components/assets/TransferModal'
import ConditionCheckModal from '@/components/assets/ConditionCheckModal'
import RepairSection from '@/components/assets/RepairSection'
import LicenseSection from '@/components/assets/LicenseSection'
import ActivityLog from '@/components/assets/ActivityLog'
import GalleryLightbox from '@/components/assets/GalleryLightbox'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Trash2, Pencil, ChevronRight, Plus, Clock, Image as ImageIcon, X, MoreHorizontal, AlertTriangle, Camera, Upload, ClipboardCheck } from 'lucide-react'

function calcDepreciation(originalPrice: number, receivedDate: string) {
  const received = new Date(receivedDate)
  const now = new Date()

  let elapsedMonths = (now.getFullYear() - received.getFullYear()) * 12 + (now.getMonth() - received.getMonth())
  if (now.getDate() < received.getDate()) elapsedMonths -= 1
  elapsedMonths = Math.max(0, elapsedMonths)

  const ageYears = Math.floor(elapsedMonths / 12)
  const ageMonths = elapsedMonths % 12
  const ageLabel = [ageYears > 0 ? `${ageYears} ปี` : '', ageMonths > 0 ? `${ageMonths} เดือน` : ''].filter(Boolean).join(' ') || 'น้อยกว่า 1 เดือน'

  const depMonths = Math.min(elapsedMonths, 60)
  const monthly = originalPrice / 60
  const bookValue = Math.max(0, originalPrice - depMonths * monthly)
  const pct = (bookValue / originalPrice) * 100

  return { bookValue, elapsedMonths, depMonths, monthly, ageLabel, pct }
}

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  available: { label: 'ว่าง',      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  issued:    { label: 'จ่าย',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  returned:  { label: 'รับคืน',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  damaged:   { label: 'ชำรุด',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  repair:    { label: 'ส่งซ่อม',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  writeoff:  { label: 'Write Off', cls: 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-300' },
  hold:      { label: 'Hold',      cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  spare:     { label: 'Spare',     cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400' },
  active:    { label: 'จ่าย',     cls: 'bg-green-100 text-green-700' },
  storage:   { label: 'ว่าง',     cls: 'bg-gray-100 text-gray-600' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 2)
  const masked = '*'.repeat(Math.max(local.length - 2, 3))
  return `${visible}${masked}@${domain}`
}

function AppleIdField({ appleId, isAdmin }: { appleId?: string; isAdmin: boolean }) {
  const [revealed, setRevealed] = useState(false)
  if (!appleId) return <p className="text-sm font-semibold text-gray-300 dark:text-gray-600">—</p>
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 font-mono">
        {revealed ? appleId : maskEmail(appleId)}
      </p>
      {isAdmin && (
        <button
          onClick={() => setRevealed(v => !v)}
          className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          {revealed ? 'ซ่อน' : 'ดูเต็ม'}
        </button>
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
  const [showVendor, setShowVendor] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [conditionCheck, setConditionCheck] = useState<{ type: 'handover' | 'return'; empId?: string; initialData?: ConditionCheck } | null>(null)
  const [lastHandover, setLastHandover] = useState<ConditionCheck | null>(null)
  const [showConditionDetail, setShowConditionDetail] = useState(false)
  const [logDetailPopup, setLogDetailPopup] = useState<AssetLog | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    const [a, l, cc] = await Promise.all([
      getAssetById(id),
      getAssetLogs(id),
      getLastHandoverByAsset(id),
    ])
    setAsset(a)
    setLogs(l)
    setLastHandover(cc)
    setLoading(false)
  }

  const debouncedLoad = () => {
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current)
    loadDebounceRef.current = setTimeout(() => { load() }, 150)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`asset-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string }
          if (row?.id === id) debouncedLoad()
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'asset_logs' }, () => debouncedLoad())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  const userNames = useUserNames(logs.map(l => l.performed_by))

  const del = () => {
    setAlertDialog({
      title: 'ยืนยันการลบ Asset',
      message: `${asset?.asset_no ? asset.asset_no + ' · ' : ''}${asset?.name}`,
      onConfirm: async () => {
        await insertAssetLog({ asset_id: id, action: 'deleted', performed_by: userId, detail: `${asset?.name}|${asset?.asset_no ?? ''}` })
        await deleteAsset(id)
        router.push('/assets')
      },
    })
  }

  const handleUploadFiles = async (files: FileList) => {
    if (!asset) return
    const { compressImage } = await import('@/lib/compressImage')
    const { assetImageKey, getNextImageIndex } = await import('@/lib/r2')
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
    await updateAssetImages(asset.id, newKeys)
    await load()
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">Loading...</div>
  if (!asset) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">ไม่พบ Asset</div>

  const employee = asset.employees as unknown as Employee | null
  const status = STATUS_MAP[asset.status] ?? { label: asset.status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <>
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
      {showConditionDetail && lastHandover && (() => {
        const ratingMap: Record<string, string> = { new: 'ใหม่', good: 'ดี', fair: 'พอใช้', poor: 'แย่' }
        const overallMap: Record<string, string> = { new: '✨ ใหม่', good: '✅ ดี', fair: '⚠️ พอใช้', poor: '❌ แย่' }
        const itemEntries = Object.entries(lastHandover.condition_items ?? {})
        const accEntries = Object.entries(lastHandover.accessories ?? {})
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowConditionDetail(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">สภาพตอนส่งมอบ</span>
                <button onClick={() => setShowConditionDetail(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                {new Date(lastHandover.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{new Date(lastHandover.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                {lastHandover.emp_id && <span className="ml-1">· {lastHandover.emp_id}</span>}
              </p>
              <div className="space-y-2">
                {lastHandover.overall_condition && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">สภาพโดยรวม</span>
                    <span className="font-medium">{overallMap[lastHandover.overall_condition]}</span>
                  </div>
                )}
                {itemEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{CONDITION_ITEM_LABELS[k] ?? k}</span>
                    <span className="font-medium">
                      {ratingMap[v] ?? v}
                      {k === 'battery' && lastHandover.item_details?.['battery_pct'] && <span className="ml-1 text-gray-400">({lastHandover.item_details['battery_pct']}%)</span>}
                      {k === 'screen' && lastHandover.item_details?.['screen_detail'] && <span className="ml-1 text-gray-400">({({ normal:'ปกติ', scratch:'รอยขีด', dead_pixel:'จุดเสีย', cracked:'แตกร้าว' } as Record<string,string>)[lastHandover.item_details['screen_detail']] ?? lastHandover.item_details['screen_detail']})</span>}
                      {k === 'body' && lastHandover.item_details?.['body_detail'] && <span className="ml-1 text-gray-400">({({ normal:'ปกติ', minor_scratch:'รอยขีดเล็กน้อย', heavy_scratch:'รอยขีดมาก', dented:'บุบ/บิ่น' } as Record<string,string>)[lastHandover.item_details['body_detail']] ?? lastHandover.item_details['body_detail']})</span>}
                    </span>
                  </div>
                ))}
                {accEntries.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">อุปกรณ์ที่มาด้วย</p>
                    {accEntries.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{ACCESSORY_LABELS[k] ?? k}</span>
                        <span className={v ? 'text-green-600 dark:text-green-400' : 'text-red-400'}>
                          {v ? 'มี ✓' : 'ไม่มี'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {lastHandover.notes && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">หมายเหตุ</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 italic">"{lastHandover.notes}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
      {logDetailPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLogDetailPopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${ACTION_LABELS[logDetailPopup.action]?.color ?? 'bg-gray-400'}`} />
                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                  {ACTION_LABELS[logDetailPopup.action]?.label ?? logDetailPopup.action}
                </span>
              </div>
              <button onClick={() => setLogDetailPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              {new Date(logDetailPopup.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}{new Date(logDetailPopup.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              {logDetailPopup.performed_by && <span className="ml-1">· {userNames[logDetailPopup.performed_by] ?? '...'}</span>}
            </p>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2.5 space-y-1.5">
              {logDetailPopup.detail?.split('\n').map((line, i) => (
                <p key={i} className={`text-xs ${i === 0 ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}
      {showVendor && asset.vendors && (
        <VendorPopup vendor={asset.vendors as unknown as Vendor} onClose={() => setShowVendor(false)} />
      )}
      {showTransfer && userId && (
        <TransferModal asset={asset} userId={userId} mode={employee ? 'transfer' : 'assign'} onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); load() }}
          onDoneWithCondition={(empId) => { setShowTransfer(false); setConditionCheck({ type: 'handover', empId }) }} />
      )}
      {conditionCheck && userId && (
        <ConditionCheckModal asset={asset} checkType={conditionCheck.type} empId={conditionCheck.empId}
          userId={userId} onDone={() => { setConditionCheck(null); load() }}
          initialData={conditionCheck.initialData} />
      )}

      {/* Mobile Bottom Sheet */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-t-2xl px-4 pt-3 pb-8 animate-slide-up">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-5" />
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-1">
              {asset.asset_no} · {asset.name}
            </p>
            <div className="space-y-1">
              {canEdit(role) && (
                <button onClick={() => { setShowMobileMenu(false); setConditionCheck({ type: asset.emp_id ? 'handover' : 'return', empId: asset.emp_id ?? undefined, initialData: lastHandover ?? undefined }) }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-800 dark:text-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                    <ClipboardCheck size={17} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">ตรวจสภาพเครื่อง</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">บันทึกสภาพก่อน/หลังใช้งาน</p>
                  </div>
                </button>
              )}
              {canTransfer(role) && (
                <button onClick={() => { setShowMobileMenu(false); setShowTransfer(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-800 dark:text-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <ArrowLeftRight size={17} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">โอนย้าย</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">มอบหมายหรือโอนให้พนักงาน</p>
                  </div>
                </button>
              )}
              {canEdit(role) && (
                <button onClick={() => { setShowMobileMenu(false); setEditing(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <Pencil size={17} className="text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">แก้ไขข้อมูล</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">แก้ไขรายละเอียด Asset</p>
                  </div>
                </button>
              )}
              {canDelete(role) && (
                <>
                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                  <button onClick={() => { setShowMobileMenu(false); del() }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                      <Trash2 size={17} className="text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">ลบ Asset</p>
                      <p className="text-xs text-red-400 dark:text-red-500">ลบออกจากระบบถาวร</p>
                    </div>
                  </button>
                </>
              )}
            </div>
            <button onClick={() => setShowMobileMenu(false)}
              className="mt-4 w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-4">

        {/* Header bar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-5 sm:py-4">

          {/* Mobile: 2 rows */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => router.push('/assets')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium">
                <span>Asset All</span>
                <ChevronRight size={13} />
              </button>
              <button onClick={() => setShowMobileMenu(true)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-2xl shrink-0">
                {CAT_ICON[asset.category] ?? '📦'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold font-mono tracking-wide text-indigo-600 dark:text-indigo-400 leading-tight">{asset.asset_no || '—'}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{asset.name}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{asset.category}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                  {asset.location && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">{asset.location}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: 1 row */}
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
                <h2 className="text-lg font-bold font-mono tracking-wide text-indigo-600 dark:text-indigo-400 leading-tight">{asset.asset_no || '—'}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{asset.name}</p>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{asset.category}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                  {asset.location && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">{asset.location}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit(role) && !editing && (
                <button onClick={() => setConditionCheck({ type: asset.emp_id ? 'handover' : 'return', empId: asset.emp_id ?? undefined, initialData: lastHandover ?? undefined })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors">
                  <ClipboardCheck size={14} /> ตรวจสภาพ
                </button>
              )}
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
            <AssetForm initial={asset} userId={userId ?? ''} onSave={() => { setEditing(false); load() }} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* คอลัมน์ซ้าย (3/5) */}
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
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Vendor</p>
                    {(asset.vendors as any)?.name ? (
                      <button onClick={() => setShowVendor(true)}
                        className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline text-left">
                        {(asset.vendors as any).name}
                      </button>
                    ) : (
                      <p className="text-sm font-semibold text-gray-300 dark:text-gray-600">—</p>
                    )}
                  </div>
                  {['MacBook','iMac','iOS','iPad'].includes(asset.category) && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 flex items-center gap-1">
                        🍎 Apple ID
                      </p>
                      <AppleIdField appleId={asset.apple_id} isAdmin={canDelete(role)} />
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">หมายเหตุ</p>
                  <p className={`text-sm ${asset.notes ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                    {asset.notes || '—'}
                  </p>
                </div>
              </div>

              <LicenseSection assetId={asset.id} role={role} userId={userId ?? null} onLogChange={load} />

              <RepairSection assetId={asset.id} role={role} userId={userId ?? null} onAssetChange={load} />

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
                <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => e.target.files && handleUploadFiles(e.target.files)} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files && handleUploadFiles(e.target.files)} />

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
                              await fetch('/api/r2/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
                              const newKeys = asset.images.filter(k => k !== key)
                              await updateAssetImages(asset.id, newKeys)
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

            {/* คอลัมน์ขวา (2/5) */}
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
                    {lastHandover ? (() => {
                      const overallEmoji: Record<string, string> = { new: '✨', good: '✅', fair: '⚠️', poor: '❌' }
                      const overallLabel: Record<string, string> = { new: 'ใหม่', good: 'ดี', fair: 'พอใช้', poor: 'แย่' }
                      const ratingEmoji: Record<string, string> = { new: '✨', good: '✅', fair: '⚠️', poor: '❌' }
                      const itemEntries = Object.entries(lastHandover.condition_items ?? {})
                      const accEntries = Object.entries(lastHandover.accessories ?? {})
                      const accPresent = accEntries.filter(([, v]) => v).length
                      const batPct = lastHandover.item_details?.['battery_pct']
                      return (
                        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">สภาพตอนส่งมอบ</span>
                              {lastHandover.overall_condition && (
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                  {overallEmoji[lastHandover.overall_condition]} {overallLabel[lastHandover.overall_condition]}
                                </span>
                              )}
                            </div>
                            <button onClick={() => setShowConditionDetail(true)}
                              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline">
                              รายละเอียด
                            </button>
                          </div>
                          {(itemEntries.length > 0 || accEntries.length > 0) && (
                            <div className="flex flex-wrap gap-1">
                              {itemEntries.map(([k, v]) => (
                                <span key={k} className="inline-flex items-center gap-0.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 rounded-full text-gray-600 dark:text-gray-300">
                                  {CONDITION_ITEM_LABELS[k] ?? k} {ratingEmoji[v]}
                                  {k === 'battery' && batPct && <span className="text-gray-400"> {batPct}%</span>}
                                </span>
                              ))}
                              {accEntries.length > 0 && (
                                <span className={`inline-flex items-center text-xs border px-1.5 py-0.5 rounded-full ${accPresent === accEntries.length ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'}`}>
                                  อุปกรณ์ {accPresent}/{accEntries.length}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })() : (
                      <button onClick={() => setConditionCheck({ type: 'handover', empId: employee.emp_id })}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                        + บันทึกสภาพเครื่องตอนส่งมอบ
                      </button>
                    )}
                    {canEdit(role) && (
                      <button onClick={() => setAlertDialog({
                        title: 'เอาผู้ใช้งานออก',
                        message: `ถอด ${employee.full_name_th} ออกจาก Asset นี้ใช่ไหม?`,
                        onConfirm: async () => {
                          const oldEmpId = employee.emp_id
                          await updateAsset(id, { emp_id: null, status: 'returned' })
                          await insertAssetLog({ asset_id: id, action: 'unassigned', performed_by: userId, detail: `${employee.emp_id} ${employee.full_name_th}` })
                          setConditionCheck({ type: 'return', empId: oldEmpId })
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

              <ActivityLog logs={logs} userNames={userNames} onShowDetail={setLogDetailPopup} />

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
