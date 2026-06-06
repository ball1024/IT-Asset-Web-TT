'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { RepairRequest } from '@/lib/supabase'
import { getRepairRequests } from '@/services/repairService'
import { useRole } from '@/hooks/useRole'
import { canRepair, canResolveRepair } from '@/lib/permissions'
import { Wrench, Plus, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import NewRepairModal from '@/components/repairs/NewRepairModal'
import ResolveRepairModal from '@/components/repairs/ResolveRepairModal'
import RepairDetailModal from '@/components/repairs/RepairDetailModal'

const STATUS_MAP = {
  pending:     { label: 'รอดำเนินการ', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  in_progress: { label: 'กำลังซ่อม',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  resolved:    { label: 'เสร็จสิ้น',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}

const RESOLUTION_MAP: Record<string, string> = {
  repaired:       '✅ ซ่อมได้',
  replaced_spare: '🔄 ใช้ spare แทน',
  replaced_new:   '🛒 ซื้อเครื่องใหม่แล้ว',
  waiting_new:    '⏳ รอเครื่องใหม่',
}

export default function RepairsContent() {
  const router = useRouter()
  const { role, userId } = useRole()
  const [repairs, setRepairs] = useState<RepairRequest[]>([])
  const [empNames, setEmpNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'resolved'>('all')
  const [showNew, setShowNew] = useState(false)
  const [resolving, setResolving] = useState<RepairRequest | null>(null)
  const [viewing, setViewing] = useState<{ repair: RepairRequest; no: number } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const data = await getRepairRequests()
    setRepairs(data)

    // โหลดชื่อพนักงาน
    const empIds = [...new Set(data.map(r => r.reported_by).filter(Boolean))] as string[]
    if (empIds.length) {
      const { data: emps } = await createClient().from('employees').select('emp_id,full_name_th').in('emp_id', empIds)
      setEmpNames(Object.fromEntries((emps ?? []).map(e => [e.emp_id, e.full_name_th])))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() =>
    filter === 'all' ? repairs : repairs.filter(r => r.status === filter),
    [repairs, filter]
  )

  // group by asset_id
  const grouped = useMemo(() => {
    const map = new Map<string, { assetId: string; assetNo: string; assetName: string; rows: RepairRequest[] }>()
    filtered.forEach(r => {
      const assetId = r.asset_id
      if (!map.has(assetId)) {
        map.set(assetId, {
          assetId,
          assetNo: (r as any).assets?.asset_no ?? '—',
          assetName: (r as any).assets?.name ?? '—',
          rows: [],
        })
      }
      map.get(assetId)!.rows.push(r)
    })
    return [...map.values()].sort((a, b) => {
      // เรียง: asset ที่มี active repair ขึ้นก่อน
      const aActive = a.rows.some(r => r.status !== 'resolved')
      const bActive = b.rows.some(r => r.status !== 'resolved')
      if (aActive !== bActive) return aActive ? -1 : 1
      return a.assetNo.localeCompare(b.assetNo)
    })
  }, [filtered])

  const counts = useMemo(() => ({
    all:         repairs.length,
    pending:     repairs.filter(r => r.status === 'pending').length,
    in_progress: repairs.filter(r => r.status === 'in_progress').length,
    resolved:    repairs.filter(r => r.status === 'resolved').length,
  }), [repairs])

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
  const days = (a: string, b?: string) => Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 86400000)

  const toggleExpand = (assetId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(assetId) ? next.delete(assetId) : next.add(assetId)
      return next
    })
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Wrench size={22} /> Repair Requests
        </h2>
        {canRepair(role) && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={14} /> แจ้งซ่อม
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { key: 'all',         label: 'ทั้งหมด',     color: 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800' },
          { key: 'pending',     label: 'รอดำเนินการ', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
          { key: 'in_progress', label: 'กำลังซ่อม',  color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
          { key: 'resolved',    label: 'เสร็จสิ้น',  color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
        ] as const).map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`rounded-xl border p-4 text-left transition-all ${filter === c.key ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-800' : 'border-gray-200 dark:border-gray-700'} ${c.color}`}>
            <p className="text-2xl font-bold">{counts[c.key]}</p>
            <p className="text-xs mt-0.5 opacity-70">{c.label}</p>
          </button>
        ))}
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Wrench size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">ไม่มีรายการ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(group => {
            const isOpen = expanded.has(group.assetId)
            const activeCount = group.rows.filter(r => r.status !== 'resolved').length
            const totalCount = group.rows.length

            return (
              <div key={group.assetId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Asset header row */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 select-none"
                  onClick={() => toggleExpand(group.assetId)}>
                  <button className="text-gray-400 shrink-0">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={e => { e.stopPropagation(); router.push(`/assets/${group.assetId}`) }}
                        className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                        {group.assetNo}
                      </button>
                      <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{group.assetName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs rounded-full font-medium animate-pulse">
                        {activeCount} กำลังดำเนินการ
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">🔧 {totalCount} ครั้ง</span>
                  </div>
                </div>

                {/* Repair rows */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    {group.rows.map((r, i) => (
                      <div key={r.id} className={`px-4 py-3 ${r.status !== 'resolved' ? 'bg-amber-50/40 dark:bg-amber-900/5' : ''}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 w-5 shrink-0">
                            #{group.rows.length - i}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[r.status].cls}`}>
                                {STATUS_MAP[r.status].label}
                              </span>
                              {r.resolution && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">{RESOLUTION_MAP[r.resolution]}</span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{r.issue}</p>
                            {r.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.notes}</p>}
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                              <span>แจ้ง {fmt(r.reported_at)}</span>
                              {r.reported_by && (
                                <span>โดย {empNames[r.reported_by] ?? r.reported_by}</span>
                              )}
                              {r.status === 'resolved'
                                ? <span>· ใช้เวลา {days(r.reported_at, r.resolved_at)} วัน</span>
                                : <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
                                    <Clock size={11} /> {days(r.reported_at)} วันแล้ว
                                  </span>
                              }
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => setViewing({ repair: r, no: group.rows.length - i })}
                              className="text-xs px-2.5 py-1 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap">
                              ดูข้อมูล
                            </button>
                            {canResolveRepair(role) && r.status !== 'resolved' && (
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
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewRepairModal
          userId={userId ?? undefined}
          onDone={() => { setShowNew(false); load() }}
          onClose={() => setShowNew(false)}
        />
      )}
      {resolving && (
        <ResolveRepairModal
          repair={resolving}
          userId={userId ?? undefined}
          onDone={() => { setResolving(null); load() }}
          onClose={() => setResolving(null)}
        />
      )}
      {viewing && (
        <RepairDetailModal
          repair={viewing.repair}
          repairNo={viewing.no}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
