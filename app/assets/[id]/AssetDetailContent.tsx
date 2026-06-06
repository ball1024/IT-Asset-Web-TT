'use client'
import { use, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, AssetLog, AssetLicense, Employee, Vendor } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import { useRole } from '@/hooks/useRole'
import { useUserNames } from '@/hooks/useUserNames'
import { canEdit, canDelete, canTransfer } from '@/lib/permissions'
import AssetForm from '@/components/assets/AssetForm'
import EmployeeProfilePopup from '@/components/assets/EmployeeProfilePopup'
import VendorPopup from '@/components/assets/VendorPopup'
import TransferModal from '@/components/assets/TransferModal'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Trash2, Pencil, ChevronRight, Plus, Clock, Info, Image as ImageIcon, X, MoreHorizontal, AlertTriangle, TrendingDown, Camera, Upload, Search, Lock, Copy, Check, KeyRound, Download, Wrench, Package } from 'lucide-react'
import { getRepairsByAsset } from '@/services/repairService'
import type { RepairRequest } from '@/lib/supabase'
import NewRepairModal from '@/components/repairs/NewRepairModal'
import RepairDetailModal from '@/components/repairs/RepairDetailModal'
import ResolveRepairModal from '@/components/repairs/ResolveRepairModal'
import { canRepair, canResolveRepair } from '@/lib/permissions'
import * as XLSX from 'xlsx'

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
  available: { label: 'ว่าง',      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  issued:    { label: 'จ่าย',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  returned:  { label: 'รับคืน',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  damaged:   { label: 'ชำรุด',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  repair:    { label: 'ส่งซ่อม',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  writeoff:  { label: 'Write Off', cls: 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-300' },
  hold:      { label: 'Hold',      cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  spare:     { label: 'Spare',     cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400' },
  // legacy
  active:    { label: 'จ่าย',     cls: 'bg-green-100 text-green-700' },
  storage:   { label: 'ว่าง',     cls: 'bg-gray-100 text-gray-600' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created:          { label: 'เพิ่ม Asset เข้าระบบ',     color: 'bg-green-500' },
  updated:          { label: 'แก้ไขข้อมูล',               color: 'bg-blue-500' },
  assigned:         { label: 'มอบหมายให้',                color: 'bg-indigo-500' },
  transferred:      { label: 'โอนย้าย',                   color: 'bg-purple-500' },
  image_added:      { label: 'อัปโหลดรูปถ่าย',            color: 'bg-teal-500' },
  image_removed:    { label: 'ลบรูปภาพ',                  color: 'bg-red-400' },
  imported:         { label: 'นำเข้าจาก Import',          color: 'bg-gray-400' },
  deleted:          { label: 'ลบ Asset',                  color: 'bg-red-600' },
  unassigned:       { label: 'เอาผู้ใช้งานออก',           color: 'bg-orange-400' },
  received:         { label: 'รับเครื่อง',                color: 'bg-cyan-500' },
  repair_requested: { label: 'แจ้งซ่อม',                  color: 'bg-amber-500' },
  repair_resolved:  { label: 'ซ่อมเสร็จ',                 color: 'bg-green-600' },
  spare_assigned:   { label: 'จ่าย Spare ระหว่างซ่อม',    color: 'bg-blue-400' },
  spare_returned:   { label: 'คืน Spare',                  color: 'bg-teal-400' },
  writeoff:         { label: 'ตัดจำหน่าย',                color: 'bg-red-700' },
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

const REPAIR_STATUS_MAP = {
  pending:     { label: 'รอดำเนินการ', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  in_progress: { label: 'กำลังซ่อม',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  resolved:    { label: 'เสร็จสิ้น',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}
const REPAIR_RESOLUTION_MAP: Record<string, string> = {
  repaired:       'ซ่อมได้',
  replaced_spare: 'ใช้ spare แทน',
  replaced_new:   'ซื้อเครื่องใหม่แล้ว',
  waiting_new:    '⏳ รอเครื่องใหม่',
}

function RepairSection({ assetId, role, userId, onAssetChange }: { assetId: string; role: string | null; userId: string | null; onAssetChange?: () => void }) {
  const router = useRouter()
  const [repairs, setRepairs] = useState<RepairRequest[]>([])
  const [spareMap, setSpareMap] = useState<Record<string, { asset_no: string; name: string; id: string }>>({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [resolving, setResolving] = useState<RepairRequest | null>(null)
  const [viewing, setViewing] = useState<{ repair: RepairRequest; no: number } | null>(null)

  const load = async () => {
    setLoading(true)
    const data = await getRepairsByAsset(assetId)
    setRepairs(data)

    // โหลด spare asset สำหรับแต่ละ repair ที่มี spare_asset_id
    const spareIds = [...new Set(data.map(r => r.spare_asset_id).filter(Boolean))] as string[]
    if (spareIds.length) {
      const { data: spares } = await createClient()
        .from('assets').select('id,asset_no,name').in('id', spareIds)
      const map: Record<string, { asset_no: string; name: string; id: string }> = {}
      ;(spares ?? []).forEach((s: any) => { map[s.id] = s })
      setSpareMap(map)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [assetId])

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
  const days = (a: string, b?: string) => Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 86400000)
  const active = repairs.filter(r => r.status !== 'resolved')

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">ประวัติการซ่อม</p>
          {repairs.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs rounded-full font-medium">
              🔧 {repairs.length} ครั้ง
            </span>
          )}
          {active.length > 0 && (
            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs rounded-full font-medium animate-pulse">
              กำลังดำเนินการ
            </span>
          )}
        </div>
        {canRepair(role as any) && (
          active.length > 0 ? (
            <span className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-lg">
              ⚠️ รอซ่อมเสร็จก่อน
            </span>
          ) : (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40">
              <Plus size={12} /> แจ้งซ่อม
            </button>
          )
        )}
      </div>

      {/* Banner: spare ที่กำลังใช้อยู่ */}
      {(() => {
        const activeWithSpare = active.find(r => r.spare_asset_id && spareMap[r.spare_asset_id])
        if (!activeWithSpare) return null
        const spare = spareMap[activeWithSpare.spare_asset_id!]
        return (
          <div className="mb-4 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3">
            <Package size={15} className="text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Spare ที่จ่ายให้ระหว่างซ่อม</p>
              <button onClick={() => router.push(`/assets/${spare.id}`)}
                className="text-sm text-blue-600 dark:text-blue-300 hover:underline font-medium">
                {spare.asset_no} — {spare.name}
              </button>
            </div>
          </div>
        )
      })()}

      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : repairs.length === 0 ? (
        <p className="text-sm text-gray-300 dark:text-gray-600">ไม่มีประวัติการซ่อม</p>
      ) : (
        <div className="space-y-3">
          {repairs.map((r, i) => (
            <div key={r.id} className={`rounded-xl border p-3 ${r.status === 'resolved' ? 'border-gray-100 dark:border-gray-700' : 'border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">#{repairs.length - i}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REPAIR_STATUS_MAP[r.status].cls}`}>
                      {REPAIR_STATUS_MAP[r.status].label}
                    </span>
                    {r.resolution && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">→ {REPAIR_RESOLUTION_MAP[r.resolution]}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{r.issue}</p>
                  {r.spare_asset_id && spareMap[r.spare_asset_id] && (
                    <button
                      onClick={() => router.push(`/assets/${r.spare_asset_id}`)}
                      className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      <Package size={11} />
                      Spare: <span className="font-mono font-medium">{spareMap[r.spare_asset_id].asset_no}</span>
                      <span className="text-gray-400">— {spareMap[r.spare_asset_id].name}</span>
                    </button>
                  )}
                  {r.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span>แจ้ง {fmt(r.reported_at)}</span>
                    {r.status === 'resolved'
                      ? <span>· ใช้เวลา {days(r.reported_at, r.resolved_at)} วัน</span>
                      : <span className="flex items-center gap-1"><Clock size={11} /> {days(r.reported_at)} วันแล้ว</span>
                    }
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setViewing({ repair: r, no: repairs.length - i })}
                    className="text-xs px-2.5 py-1 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap">
                    ดูข้อมูล
                  </button>
                  {canResolveRepair(role as any) && r.status !== 'resolved' && (
                    <button onClick={() => setResolving(r)}
                      className="text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 whitespace-nowrap">
                      จัดการ
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewRepairModal presetAssetId={assetId} userId={userId ?? undefined} onDone={() => { setShowNew(false); load(); onAssetChange?.() }} onClose={() => setShowNew(false)} />
      )}
      {resolving && (
        <ResolveRepairModal repair={resolving} userId={userId ?? undefined} onDone={() => { setResolving(null); load(); onAssetChange?.() }} onClose={() => setResolving(null)} />
      )}
      {viewing && (
        <RepairDetailModal repair={viewing.repair} repairNo={viewing.no} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

function LicenseSection({ assetId, role, userId }: { assetId: string; role: string | null; userId: string | null }) {
  const [licenses, setLicenses] = useState<AssetLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', license_key: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [myRequests, setMyRequests] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>({})
  const [confirmDelete, setConfirmDelete] = useState<AssetLicense | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState<'add' | 'update'>('add')
  const [importRows, setImportRows] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  // openedAt: timestamp เมื่อ user กดเปิดดู key (เก็บใน localStorage ด้วย)
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({})
  const [remaining, setRemaining] = useState<Record<string, number>>({})

  const OPEN_DURATION = 10 * 60 * 1000    // 10 นาที
  const APPROVAL_TTL  = 4 * 60 * 60 * 1000 // 4 ชั่วโมง

  const canManage = role === 'admin' || role === 'master_admin'
  const canReveal = role === 'admin' || role === 'master_admin'
  const canRequest = role === 'user'

  const load = async () => {
    const { data } = await createClient().from('asset_licenses').select('*').eq('asset_id', assetId).order('created_at')
    setLicenses(data ?? [])
    setLoading(false)
  }

  const loadMyRequests = async () => {
    if (!userId || !canRequest) return
    const { data } = await createClient()
      .from('license_view_requests')
      .select('license_id, status, approved_at')
      .eq('requested_by', userId)
    const map: Record<string, 'pending' | 'approved' | 'rejected'> = {}
    const expiredIds: string[] = []
    ;(data ?? []).forEach((r: any) => {
      if (r.status === 'approved' && r.approved_at) {
        const age = Date.now() - new Date(r.approved_at).getTime()
        if (age > APPROVAL_TTL) {
          expiredIds.push(r.license_id)
          return // ข้ามไป ถือว่า expire
        }
      }
      map[r.license_id] = r.status
    })
    // ลบ request ที่ expire ออกจาก DB
    if (expiredIds.length) {
      await createClient()
        .from('license_view_requests')
        .delete()
        .in('license_id', expiredIds)
        .eq('requested_by', userId)
    }
    setMyRequests(map)
  }

  // โหลด open sessions จาก localStorage เมื่อ mount
  useEffect(() => {
    if (!canRequest) return
    const stored: Record<string, number> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('lic_open_')) {
        const ts = parseInt(localStorage.getItem(k) ?? '0')
        const id = k.replace('lic_open_', '')
        if (Date.now() - ts < OPEN_DURATION) stored[id] = ts
        else localStorage.removeItem(k)
      }
    }
    if (Object.keys(stored).length) setOpenedAt(stored)
  }, [canRequest])

  // countdown timer
  useEffect(() => {
    if (!Object.keys(openedAt).length) return
    const timer = setInterval(() => {
      const now = Date.now()
      const newRemaining: Record<string, number> = {}
      const newOpened = { ...openedAt }
      let changed = false
      const expiredLicenseIds: string[] = []
      for (const [id, ts] of Object.entries(openedAt)) {
        const left = OPEN_DURATION - (now - ts)
        if (left <= 0) {
          delete newOpened[id]
          localStorage.removeItem(`lic_open_${id}`)
          expiredLicenseIds.push(id)
          changed = true
        } else {
          newRemaining[id] = Math.ceil(left / 1000)
        }
      }
      // ลบ request ออก → ต้องขอใหม่
      if (expiredLicenseIds.length && userId) {
        createClient()
          .from('license_view_requests')
          .delete()
          .in('license_id', expiredLicenseIds)
          .eq('requested_by', userId)
          .then(() => {
            setMyRequests(m => {
              const next = { ...m }
              expiredLicenseIds.forEach(id => delete next[id])
              return next
            })
          })
      }
      setRemaining(newRemaining)
      if (changed) setOpenedAt(newOpened)
    }, 1000)
    return () => clearInterval(timer)
  }, [openedAt])

  const openKey = (licenseId: string) => {
    const ts = Date.now()
    localStorage.setItem(`lic_open_${licenseId}`, String(ts))
    setOpenedAt(m => ({ ...m, [licenseId]: ts }))
    setRemaining(m => ({ ...m, [licenseId]: OPEN_DURATION / 1000 }))
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  useEffect(() => { load(); loadMyRequests() }, [assetId])

  // Poll ทุก 5 วินาที ถ้ามี pending request อยู่
  useEffect(() => {
    if (!userId || !canRequest) return
    const hasPending = Object.values(myRequests).some(s => s === 'pending')
    if (!hasPending) return
    const interval = setInterval(() => { loadMyRequests() }, 5000)
    return () => clearInterval(interval)
  }, [userId, canRequest, myRequests])

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()
    if (editId) {
      await supabase.from('asset_licenses').update({ name: form.name, license_key: form.license_key || null, notes: form.notes || null }).eq('id', editId)
      setEditId(null)
    } else {
      await supabase.from('asset_licenses').insert({ asset_id: assetId, name: form.name, license_key: form.license_key || null, notes: form.notes || null, created_by: userId })
      setAdding(false)
    }
    setForm({ name: '', license_key: '', notes: '' })
    setSaving(false)
    load()
  }

  const remove = async (id: string) => {
    await createClient().from('asset_licenses').delete().eq('id', id)
    setConfirmDelete(null)
    load()
  }

  const startEdit = (lic: AssetLicense) => {
    setEditId(lic.id)
    setAdding(false)
    setForm({ name: lic.name, license_key: lic.license_key ?? '', notes: lic.notes ?? '' })
  }

  const sendRequest = async (licenseId: string) => {
    if (!userId) return
    await createClient().from('license_view_requests').upsert(
      { license_id: licenseId, requested_by: userId, status: 'pending' },
      { onConflict: 'license_id,requested_by' }
    )
    setMyRequests(m => ({ ...m, [licenseId]: 'pending' }))
  }

  const copy = (id: string, key: string) => {
    navigator.clipboard.writeText(key)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ name: 'Microsoft Word', license_key: 'XXXXX-XXXXX-XXXXX', notes: '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Licenses')
    XLSX.writeFile(wb, 'licenses_template.xlsx')
  }

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setImportRows(XLSX.utils.sheet_to_json(ws) as any[])
    }
    reader.readAsBinaryString(file)
  }

  const runImport = async () => {
    if (!importRows.length) return
    setImporting(true)
    const nameMap = Object.fromEntries(licenses.map(l => [l.name.trim().toLowerCase(), l.id]))
    let added = 0, updated = 0, skipped = 0
    for (const row of importRows) {
      const name = String(row.name ?? '').trim()
      if (!name) { skipped++; continue }
      const payload = { name, license_key: row.license_key ? String(row.license_key) : null, notes: row.notes ? String(row.notes) : null }
      const existId = nameMap[name.toLowerCase()]
      if (existId) {
        if (importMode === 'update') {
          await createClient().from('asset_licenses').update(payload).eq('id', existId)
          updated++
        } else { skipped++ }
      } else {
        await createClient().from('asset_licenses').insert({ ...payload, asset_id: assetId, created_by: userId })
        added++
      }
    }
    setImportResult({ added, updated, skipped })
    setImporting(false)
    load()
  }

  const inp = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400'

  if (loading) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">

      {/* Confirm delete license */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setConfirmDelete(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">ลบ License</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">ลบ <span className="font-semibold">{confirmDelete.name}</span> ออกจาก Asset นี้ใช่ไหม?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                ยกเลิก
              </button>
              <button onClick={() => remove(confirmDelete.id)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Upload size={15} /> Import Programs</h3>
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <button onClick={downloadTemplate} className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                <Download size={14} /> ดาวน์โหลด Template
              </button>
              <div className="grid grid-cols-2 gap-2">
                {([['add', 'เพิ่มใหม่', 'ชื่อซ้ำจะข้าม'], ['update', 'เพิ่ม + อัปเดต', 'ชื่อซ้ำจะอัปเดต']] as const).map(([k, t, d]) => (
                  <button key={k} onClick={() => setImportMode(k)}
                    className={`text-left p-2.5 rounded-xl border-2 transition-colors ${importMode === k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
                    <p className={`text-xs font-medium ${importMode === k ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200'}`}>{t}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} />
              <button onClick={() => importRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors">
                <Upload size={14} /> {importRows.length ? `เลือกแล้ว · ${importRows.length} แถว` : 'เลือกไฟล์ .xlsx / .csv'}
              </button>
              {importResult && (() => {
                const hasSuccess = importResult.added > 0 || importResult.updated > 0
                const allSkipped = importResult.skipped > 0 && !hasSuccess
                return (
                  <div className={`p-3 rounded-xl text-xs space-y-1.5 ${hasSuccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <p className={`font-medium ${hasSuccess ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {hasSuccess ? 'Import สำเร็จ' : 'ไม่มีรายการถูก Import'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {importResult.added > 0 && (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
                          ✓ เพิ่มใหม่ {importResult.added}
                        </span>
                      )}
                      {importResult.updated > 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                          ↻ อัปเดต {importResult.updated}
                        </span>
                      )}
                      {importResult.skipped > 0 && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                          – ข้าม {importResult.skipped}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2 justify-end px-5 pb-4">
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {importResult ? 'ปิด' : 'ยกเลิก'}
              </button>
              {!importResult && (
                <button onClick={runImport} disabled={!importRows.length || importing}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {importing ? 'กำลัง Import...' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <KeyRound size={13} /> Programs & Licenses
        </p>
        {canManage && !adding && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowImport(true); setImportResult(null) }}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 transition-colors">
              <Upload size={12} /> Import
            </button>
            <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: '', license_key: '', notes: '' }) }}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              <Plus size={13} /> เพิ่ม
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit form */}
      {(adding || editId) && canManage && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อโปรแกรม เช่น Microsoft Word *" className={inp} />
          <input value={form.license_key} onChange={e => setForm(f => ({ ...f, license_key: e.target.value }))}
            placeholder="License Key (ถ้ามี)" className={inp} />
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="หมายเหตุ (ถ้ามี)" className={inp} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setEditId(null) }}
              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              ยกเลิก
            </button>
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* License list */}
      {licenses.length === 0 && !adding ? (
        <div className="text-center py-6">
          <KeyRound size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-400 dark:text-gray-500">ยังไม่มีโปรแกรมหรือ License</p>
        </div>
      ) : (
        <div className="space-y-2">
          {licenses.map(lic => {
            const isRevealed = revealed.has(lic.id)
            return (
              <div key={lic.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {lic.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{lic.name}</p>

                  {/* License key */}
                  {lic.license_key && (
                    <div className="mt-1 flex items-center gap-1.5">
                      {canReveal ? (
                        <>
                          <code className={`text-xs font-mono text-gray-600 dark:text-gray-300 ${!isRevealed ? 'blur-sm select-none' : ''} transition-all`}>
                            {lic.license_key}
                          </code>
                          <button onClick={() => setRevealed(s => { const n = new Set(s); isRevealed ? n.delete(lic.id) : n.add(lic.id); return n })}
                            className="text-gray-400 hover:text-indigo-500 shrink-0">
                            <Lock size={11} />
                          </button>
                          {isRevealed && (
                            <button onClick={() => copy(lic.id, lic.license_key!)}
                              className="text-gray-400 hover:text-indigo-500 shrink-0">
                              {copied === lic.id ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                            </button>
                          )}
                        </>
                      ) : canRequest ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const status = myRequests[lic.id]
                            const isOpen = !!openedAt[lic.id]
                            const secs = remaining[lic.id] ?? 0

                            if (status === 'approved' && isOpen) {
                              // กำลังดูอยู่ — แสดง key + countdown + copy
                              return (
                                <>
                                  <code className="text-xs font-mono text-gray-700 dark:text-gray-200 break-all">
                                    {lic.license_key}
                                  </code>
                                  <button onClick={() => copy(lic.id, lic.license_key!)}
                                    className="text-gray-400 hover:text-indigo-500 shrink-0">
                                    {copied === lic.id ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                                  </button>
                                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${secs <= 60 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                    ⏱ {formatCountdown(secs)}
                                  </span>
                                </>
                              )
                            }

                            if (status === 'approved' && !isOpen) {
                              // ได้รับอนุมัติแล้ว ยังไม่เปิด
                              return (
                                <>
                                  <code className="text-xs font-mono text-gray-300 dark:text-gray-600 blur-sm select-none">
                                    {lic.license_key}
                                  </code>
                                  <button onClick={() => openKey(lic.id)}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shrink-0">
                                    <Lock size={10} /> เปิดดู (10 นาที)
                                  </button>
                                </>
                              )
                            }

                            if (status === 'rejected') {
                              return (
                                <span className="text-xs text-red-400 flex items-center gap-1">
                                  <Lock size={10} /> คำขอถูกปฏิเสธ
                                </span>
                              )
                            }

                            // pending หรือยังไม่ขอ
                            return (
                              <>
                                <code className="text-xs font-mono text-gray-300 dark:text-gray-600 blur-sm select-none">
                                  {lic.license_key}
                                </code>
                                <button
                                  onClick={() => sendRequest(lic.id)}
                                  disabled={status === 'pending'}
                                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors shrink-0 ${status === 'pending' ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100'}`}>
                                  <Lock size={10} />
                                  {status === 'pending' ? 'รอการอนุมัติ' : 'ขอดู'}
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600">
                          <Lock size={10} /> <span>ไม่มีสิทธิ์ดู</span>
                        </div>
                      )}
                    </div>
                  )}

                  {lic.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{lic.notes}</p>}
                </div>

                {/* Admin actions */}
                {canManage && editId !== lic.id && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(lic)} className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => setConfirmDelete(lic)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X size={13} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const FILTER_CHIPS: { key: string; label: string; color: string }[] = [
  { key: 'all',        label: 'ทั้งหมด', color: 'bg-gray-400' },
  { key: 'transfer',   label: 'โอนย้าย', color: 'bg-purple-500' },
  { key: 'assign',     label: 'มอบหมาย', color: 'bg-cyan-500' },
  { key: 'updated',    label: 'แก้ไข',   color: 'bg-blue-500' },
  { key: 'image',      label: 'รูปภาพ',  color: 'bg-teal-500' },
]

function ActivityLog({ logs, userNames }: { logs: AssetLog[]; userNames: Record<string, string> }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = logs.filter(log => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'transfer' && ['transferred', 'assigned'].includes(log.action)) ||
      (filter === 'assign'   && ['received', 'unassigned'].includes(log.action)) ||
      (filter === 'image'    && ['image_added', 'image_removed'].includes(log.action)) ||
      (filter === 'updated'  && log.action === 'updated')
    if (!matchFilter) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    const dateStr = new Date(log.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    const actionLabel = (ACTION_LABELS[log.action]?.label ?? log.action).toLowerCase()
    const userName = (userNames[log.performed_by ?? ''] ?? '').toLowerCase()
    return (
      actionLabel.includes(q) ||
      (log.detail ?? '').toLowerCase().includes(q) ||
      dateStr.includes(q) ||
      userName.includes(q)
    )
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">ประวัติการเปลี่ยนแปลง</p>

      {/* Search */}
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="ค้นหา action, รายละเอียด, วันที่, ผู้ทำ..."
          className="w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {FILTER_CHIPS.map(c => {
          const count = c.key === 'all'
            ? logs.length
            : c.key === 'transfer'
            ? logs.filter(l => ['transferred','assigned'].includes(l.action)).length
            : c.key === 'assign'
            ? logs.filter(l => ['received','unassigned'].includes(l.action)).length
            : c.key === 'image'
            ? logs.filter(l => ['image_added','image_removed'].includes(l.action)).length
            : logs.filter(l => l.action === c.key).length
          const isActive = filter === c.key
          return (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white dark:bg-gray-900' : c.color}`} />
              {c.label}
              {count > 0 && (
                <span className={`text-xs tabular-nums ${isActive ? 'text-white/70 dark:text-gray-900/70' : 'text-gray-400 dark:text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Log list */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {filtered.map((log, idx) => {
          const a = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-400' }
          const isLast = idx === filtered.length - 1
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
                  {(log.action === 'assigned' || log.action === 'unassigned') && log.detail && (
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
        {!filtered.length && (
          <div className="text-center py-6">
            <Clock size={24} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-gray-400 dark:text-gray-500 text-xs">
              {query || filter !== 'all' ? 'ไม่พบรายการที่ตรงกัน' : 'ยังไม่มี activity'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
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
  const [showVendor, setShowVendor] = useState(false)
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
      supabase.from('assets').select('*, employees(*), vendors(*)').eq('id', id).single(),
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
      {showVendor && asset.vendors && (
        <VendorPopup vendor={asset.vendors as unknown as Vendor} onClose={() => setShowVendor(false)} />
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
            <AssetForm initial={asset} userId={userId ?? ''} onSave={() => { setEditing(false); load() }} onCancel={() => setEditing(false)} />
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
                  {/* Vendor — กดดูได้ */}
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

                  {/* Apple ID — เฉพาะ Apple device */}
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

              <LicenseSection assetId={asset.id} role={role} userId={userId ?? null} />

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
                          await supabase.from('assets').update({ emp_id: null, status: 'returned', updated_at: new Date().toISOString() }).eq('id', id)
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
              <ActivityLog logs={logs} userNames={userNames} />

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
