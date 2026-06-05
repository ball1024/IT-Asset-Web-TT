'use client'
import { use, useEffect, useState } from 'react'
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
import { ArrowLeftRight, Trash2, Pencil, ChevronRight, Plus, Clock, Info, Image as ImageIcon, X, MoreHorizontal, AlertTriangle, TrendingDown } from 'lucide-react'

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
  const [lightbox, setLightbox] = useState<string | null>(null)
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

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">Loading...</div>
  if (!asset) return <div className="text-gray-400 dark:text-gray-500 text-sm p-6">ไม่พบ Asset</div>

  const employee = asset.employees as unknown as Employee | null
  const status = STATUS_MAP[asset.status] ?? { label: asset.status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white"><X size={24} /></button>
          <img src={`${R2_PUBLIC}/${lightbox}`} className="max-w-full max-h-full rounded-lg" />
        </div>
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

      <div className="max-w-5xl mx-auto space-y-4">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <button onClick={() => router.push('/assets')} className="hover:text-indigo-600">All Assets</button>
            <ChevronRight size={14} />
            <span className="text-gray-800 dark:text-gray-100 font-medium">{asset.asset_no}</span>
          </div>
          <div className="flex items-center gap-2">
            {canDelete(role) && (
              <button onClick={del} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 size={14} /> ลบ
              </button>
            )}
            {canEdit(role) && (
              <button onClick={() => setEditing(e => !e)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                <Pencil size={14} /> {editing ? 'ยกเลิก' : 'แก้ไข'}
              </button>
            )}
            {canTransfer(role) && !editing && (
              <button onClick={() => setShowMore(v => !v)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 relative">
                <MoreHorizontal size={16} />
                {showMore && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 w-36 overflow-hidden">
                    <button onClick={() => { setShowMore(false); setShowTransfer(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <ArrowLeftRight size={14} /> โอนย้าย
                    </button>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">แก้ไข Asset</h3>
            <AssetForm initial={asset} userId={userId ?? ''} onSave={() => { setEditing(false); load() }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* ซ้าย: ข้อมูลหลัก */}
            <div className="lg:col-span-3 space-y-4">
              {/* Asset Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-3xl shrink-0">
                    {CAT_ICON[asset.category] ?? '📦'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">{asset.asset_no || '—'}</p>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{asset.name}</h2>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{asset.category}</span>
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
                  {[
                    ['ยี่ห้อ', asset.brand],
                    ['รุ่น', asset.model],
                    ['Serial No.', asset.serial_no],
                    ['วันที่ซื้อ', asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('th-TH') : null],
                    ['วันที่ได้รับ', asset.received_date ? new Date(asset.received_date).toLocaleDateString('th-TH') : null],
                    ['ที่ตั้ง', asset.location],
                    ['รหัสพนักงาน', asset.emp_id],
                    ['แผนก', (asset as any).department],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{k}</p>
                      <p className={`text-sm font-semibold mt-0.5 ${v ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                        {v || '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">หมายเหตุ</p>
                  <p className={`text-sm ${asset.notes ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                    {asset.notes || '—'}
                  </p>
                </div>
              </div>

              {/* รูปภาพ */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <ImageIcon size={15} /> รูปถ่ายอุปกรณ์
                  </div>
                  {canEdit(role) && asset.images.length < 5 && (
                    <label className="flex items-center gap-1 text-xs text-indigo-600 hover:underline cursor-pointer">
                      <Plus size={13} /> เพิ่มรูป
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={async e => {
                          if (!e.target.files) return
                          const { compressImage } = await import('@/lib/compressImage')
                          const { assetImageKey, getNextImageIndex } = await import('@/lib/r2')
                          const supabase = createClient()
                          const newKeys = [...asset.images]
                          for (const file of Array.from(e.target.files)) {
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
                          setAsset(a => a ? { ...a, images: newKeys } : a)
                        }} />
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {[0,1,2,3,4].map(i => {
                    const key = asset.images[i]
                    return key ? (
                      <div key={i} className="relative group aspect-square">
                        <img src={`${R2_PUBLIC}/${key}`} onClick={() => setLightbox(key)}
                          className="w-full h-full object-cover rounded-xl border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-90 transition-opacity" />
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
                            setAsset(a => a ? { ...a, images: newKeys } : a)
                          }})} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={i} className={`aspect-square rounded-xl border-2 border-dashed flex items-center justify-center ${i === asset.images.length && canEdit(role) ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'}`}>
                        {i === asset.images.length && canEdit(role) ? <Plus size={16} className="text-indigo-400" /> : <ImageIcon size={14} className="text-gray-200 dark:text-gray-600" />}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{asset.images.length} / 5 รูป · คลิกรูปเพื่อดูขนาดเต็ม</p>
              </div>
            </div>

            {/* ขวา: employee + log + system info */}
            <div className="lg:col-span-2 space-y-4">
              {/* ผู้ใช้งาน */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span>👤</span> ผู้ใช้งานปัจจุบัน
                  </p>
                  {canTransfer(role) && employee && (
                    <button onClick={() => setShowTransfer(true)} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                      <ArrowLeftRight size={12} /> โอนย้าย
                    </button>
                  )}
                </div>
                {employee ? (
                  <div>
                    <button onClick={() => setShowEmployee(true)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-300 text-sm shrink-0">
                        {employee.full_name_th.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{employee.full_name_th}</p>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                            employee.status === 'active'    ? 'bg-green-100 text-green-700' :
                            employee.status === 'probation' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {employee.status === 'active' ? 'Active' : employee.status === 'probation' ? 'Probation' : 'Resign'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{employee.emp_id} · {employee.department}</p>
                      </div>
                    </button>
                    {canEdit(role) && (
                      <button
                        onClick={() => setAlertDialog({
                          title: 'เอาผู้ใช้งานออก',
                          message: `ถอด ${employee.full_name_th} ออกจาก Asset นี้ใช่ไหม?`,
                          onConfirm: async () => {
                            const supabase = createClient()
                            await supabase.from('assets').update({ emp_id: null, status: 'available', updated_at: new Date().toISOString() }).eq('id', id)
                            // ไม่ล้าง department เผื่อ asset นี้ถูกส่งต่อให้แผนกเดิม
                            await insertAssetLog({ asset_id: id, action: 'unassigned', performed_by: userId, detail: `${employee.emp_id} ${employee.full_name_th}` })
                            load()
                          },
                        })}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <X size={12} /> เอาผู้ใช้งานออก
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3 space-y-2">
                    <p className="text-sm text-gray-400 dark:text-gray-500">ยังไม่ได้มอบหมาย</p>
                    {canTransfer(role) && (
                      <button onClick={() => setShowTransfer(true)}
                        className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                        <ArrowLeftRight size={12} /> เพิ่มผู้ใช้งาน
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Activity Log */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
                  <Clock size={14} /> ประวัติการเปลี่ยนแปลง
                </p>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {logs.map(log => {
                    const a = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-400' }
                    return (
                      <div key={log.id} className="flex gap-2.5 text-sm">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.color}`} />
                        <div>
                          <p className="text-gray-800 dark:text-gray-100 font-medium leading-snug">
                            {a.label}
                            {log.detail && log.action === 'transferred' && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">{log.detail.replace('โอนย้ายจาก ', '')}</span>
                            )}
                            {log.action === 'assigned' && log.detail && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">({log.detail})</span>
                            )}
                            {log.action === 'received' && log.detail && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">· {log.detail}</span>
                            )}
                            {log.action === 'updated' && log.detail && (
                              <ul className="mt-1 space-y-0.5">
                                {log.detail.split('\n').map((line, i) => (
                                  <li key={i} className="text-xs text-gray-500 dark:text-gray-400 font-normal">{line}</li>
                                ))}
                              </ul>
                            )}
                            {log.action === 'unassigned' && log.detail && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">· {log.detail}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{new Date(log.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                            {log.performed_by && (
                              <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-xs">
                                {userNames[log.performed_by] ?? '...'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {!logs.length && <p className="text-gray-400 dark:text-gray-500 text-xs">ยังไม่มี activity</p>}
                </div>
              </div>

              {/* มูลค่าทรัพย์สิน */}
              {asset.original_price != null && asset.original_price > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
                    <TrendingDown size={14} /> มูลค่าทรัพย์สิน
                  </p>
                  {(() => {
                    const baseDate = asset.purchase_date
                    if (!baseDate) {
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400 dark:text-gray-500">มูลค่าเริ่มต้น</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-100">
                              {asset.original_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                            </span>
                          </div>
                          <p className="text-xs text-amber-500">กรุณากรอกวันที่ซื้อเพื่อคำนวณค่าเสื่อม</p>
                        </div>
                      )
                    }
                    const dep = calcDepreciation(asset.original_price, baseDate)
                    return (
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400 dark:text-gray-500">มูลค่าเริ่มต้น</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {asset.original_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">อายุเครื่อง</span>
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">{dep.ageLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 dark:text-gray-500">ค่าเสื่อม/เดือน</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {dep.monthly.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ฿
                          </span>
                        </div>
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div className="flex justify-between mb-1.5">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Book Valued ปัจจุบัน</span>
                            <span className={`font-bold text-base ${dep.bookValue > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>
                              {dep.bookValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${dep.pct > 50 ? 'bg-green-500' : dep.pct > 20 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${dep.pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                            เหลือ {dep.pct.toFixed(1)}% · ตัดค่าเสื่อมไปแล้ว {dep.depMonths}/60 เดือน
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ข้อมูลระบบ */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
                  <Info size={14} /> ข้อมูลระบบ
                </p>
                <div className="space-y-2 text-sm">
                  {[
                    ['ID', asset.id.slice(0, 8) + '...'],
                    ['สร้างเมื่อ', asset.created_at ? new Date(asset.created_at).toLocaleDateString('th-TH') : '-'],
                    ['แก้ไขล่าสุด', asset.updated_at ? new Date(asset.updated_at).toLocaleDateString('th-TH') : '-'],
                    ['รูปภาพ (R2)', `${asset.images.length} ไฟล์`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-400 dark:text-gray-500">{k}</span>
                      <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">{v}</span>
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
