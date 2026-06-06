'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { RepairRequest } from '@/lib/supabase'
import { getRepairsByAsset } from '@/services/repairService'
import { useRouter } from 'next/navigation'
import { canRepair, canResolveRepair } from '@/lib/permissions'
import NewRepairModal from '@/components/repairs/NewRepairModal'
import RepairDetailModal from '@/components/repairs/RepairDetailModal'
import ResolveRepairModal from '@/components/repairs/ResolveRepairModal'
import { Plus, Clock, Package } from 'lucide-react'

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

export default function RepairSection({ assetId, role, userId, onAssetChange }: { assetId: string; role: string | null; userId: string | null; onAssetChange?: () => void }) {
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
