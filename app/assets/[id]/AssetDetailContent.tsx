'use client'
import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, AssetLog, Employee } from '@/lib/supabase'
import { useRole } from '@/hooks/useRole'
import { useUserNames } from '@/hooks/useUserNames'
import { canEdit, canDelete, canTransfer } from '@/lib/permissions'
import AssetForm from '@/components/assets/AssetForm'
import EmployeeProfilePopup from '@/components/assets/EmployeeProfilePopup'
import TransferModal from '@/components/assets/TransferModal'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Trash2, Pencil, ChevronRight, Plus, Clock, Info, Image as ImageIcon, X, MoreHorizontal } from 'lucide-react'

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:  { label: 'ใช้งาน',   cls: 'bg-green-100 text-green-700' },
  repair:  { label: 'ซ่อม',     cls: 'bg-amber-100 text-amber-700' },
  storage: { label: 'สต็อก',    cls: 'bg-blue-100 text-blue-700' },
  retired: { label: 'ปลดระวาง', cls: 'bg-gray-100 text-gray-600' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', Desktop: '🖥️', iMac: '🖥️',
  Monitor: '🖥️', Printer: '🖨️', Network: '🌐', Other: '📦',
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

  const del = async () => {
    if (!confirm(`ลบ "${asset?.name}"?`)) return
    const supabase = createClient()
    await supabase.from('asset_logs').insert({ asset_id: id, action: 'deleted', performed_by: userId })
    await supabase.from('assets').delete().eq('id', id)
    router.push('/assets')
  }

  if (loading) return <div className="text-gray-400 text-sm p-6">Loading...</div>
  if (!asset) return <div className="text-gray-400 text-sm p-6">ไม่พบ Asset</div>

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

      {showEmployee && employee && (
        <EmployeeProfilePopup employee={employee} onClose={() => setShowEmployee(false)} />
      )}
      {showTransfer && userId && (
        <TransferModal asset={asset} userId={userId} onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); load() }} />
      )}

      <div className="max-w-5xl space-y-4">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <button onClick={() => router.push('/assets')} className="hover:text-indigo-600">All Assets</button>
            <ChevronRight size={14} />
            <span className="text-gray-800 font-medium">{asset.asset_no}</span>
          </div>
          <div className="flex items-center gap-2">
            {canDelete(role) && (
              <button onClick={del} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50">
                <Trash2 size={14} /> ลบ
              </button>
            )}
            {canEdit(role) && (
              <button onClick={() => setEditing(e => !e)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                <Pencil size={14} /> {editing ? 'ยกเลิก' : 'แก้ไข'}
              </button>
            )}
            {canTransfer(role) && !editing && (
              <button onClick={() => setShowMore(v => !v)} className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 relative">
                <MoreHorizontal size={16} />
                {showMore && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 w-36 overflow-hidden">
                    <button onClick={() => { setShowMore(false); setShowTransfer(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                      <ArrowLeftRight size={14} /> โอนย้าย
                    </button>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">แก้ไข Asset</h3>
            <AssetForm initial={asset} userId={userId ?? ''} onSave={() => { setEditing(false); load() }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* ซ้าย: ข้อมูลหลัก */}
            <div className="lg:col-span-3 space-y-4">
              {/* Asset Card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center text-3xl shrink-0">
                    {CAT_ICON[asset.category] ?? '📦'}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800">{asset.name}</h2>
                    <p className="text-sm text-gray-400 font-mono">{asset.asset_no}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">{asset.category}</span>
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${status.cls}`}>{status.label}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-4 border-t border-gray-100">
                  {[
                    ['ยี่ห้อ', asset.brand],
                    ['รุ่น', asset.model],
                    ['Serial No.', asset.serial_no],
                    ['วันที่ซื้อ', asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('th-TH') : null],
                    ['ที่ตั้ง', asset.location],
                    ['รหัสพนักงาน', asset.emp_id],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xs text-gray-400">{k}</p>
                      <p className={`text-sm font-semibold mt-0.5 ${v ? 'text-gray-800' : 'text-gray-300'}`}>
                        {v || '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">หมายเหตุ</p>
                  <p className={`text-sm ${asset.notes ? 'text-gray-700' : 'text-gray-300'}`}>
                    {asset.notes || '—'}
                  </p>
                </div>
              </div>

              {/* รูปภาพ */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
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
                            await supabase.from('asset_logs').insert({ asset_id: asset.id, action: 'image_added', detail: key, performed_by: userId })
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
                          className="w-full h-full object-cover rounded-xl border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                        {canEdit(role) && (
                          <button onClick={async () => {
                            if (!confirm('ลบรูปนี้?')) return
                            const supabase = createClient()
                            await fetch('/api/r2/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
                            const newKeys = asset.images.filter(k => k !== key)
                            await supabase.from('assets').update({ images: newKeys }).eq('id', asset.id)
                            await supabase.from('asset_logs').insert({ asset_id: asset.id, action: 'image_removed', detail: key, performed_by: userId })
                            setAsset(a => a ? { ...a, images: newKeys } : a)
                          }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={i} className={`aspect-square rounded-xl border-2 border-dashed flex items-center justify-center ${i === asset.images.length && canEdit(role) ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'}`}>
                        {i === asset.images.length && canEdit(role) ? <Plus size={16} className="text-indigo-400" /> : <ImageIcon size={14} className="text-gray-200" />}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">{asset.images.length} / 5 รูป · คลิกรูปเพื่อดูขนาดเต็ม</p>
              </div>
            </div>

            {/* ขวา: employee + log + system info */}
            <div className="lg:col-span-2 space-y-4">
              {/* ผู้ใช้งาน */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <span>👤</span> ผู้ใช้งานปัจจุบัน
                  </p>
                  {canTransfer(role) && (
                    <button onClick={() => setShowTransfer(true)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <ArrowLeftRight size={12} /> โอนย้าย
                    </button>
                  )}
                </div>
                {employee ? (
                  <button onClick={() => setShowEmployee(true)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors text-left">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm shrink-0">
                      {employee.full_name_th.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800">{employee.full_name_th}</p>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          employee.status === 'active'    ? 'bg-green-100 text-green-700' :
                          employee.status === 'probation' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {employee.status === 'active' ? 'Active' : employee.status === 'probation' ? 'Probation' : 'Resign'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{employee.emp_id} · {employee.department}</p>
                    </div>
                  </button>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">ยังไม่ได้มอบหมาย</p>
                )}
              </div>

              {/* Activity Log */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                  <Clock size={14} /> ประวัติการเปลี่ยนแปลง
                </p>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {logs.map(log => {
                    const a = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-400' }
                    return (
                      <div key={log.id} className="flex gap-2.5 text-sm">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.color}`} />
                        <div>
                          <p className="text-gray-800 font-medium leading-snug">
                            {a.label}
                            {log.detail && log.action === 'transferred' && (
                              <span className="font-normal text-gray-500 ml-1">{log.detail.replace('โอนย้ายจาก ', '')}</span>
                            )}
                            {log.action === 'assigned' && log.detail && (
                              <span className="font-normal text-gray-500 ml-1">({log.detail})</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{new Date(log.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                            {log.performed_by && (
                              <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs">
                                {userNames[log.performed_by] ?? '...'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {!logs.length && <p className="text-gray-400 text-xs">ยังไม่มี activity</p>}
                </div>
              </div>

              {/* ข้อมูลระบบ */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
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
                      <span className="text-gray-400">{k}</span>
                      <span className="text-gray-700 font-mono text-xs">{v}</span>
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
