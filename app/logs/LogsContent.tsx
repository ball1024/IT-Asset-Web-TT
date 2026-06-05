'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUserNames } from '@/hooks/useUserNames'
import { useRole } from '@/hooks/useRole'
import { canDelete } from '@/lib/permissions'
import { Search, X } from 'lucide-react'

const ASSET_ACTION: Record<string, { label: string; color: string }> = {
  created:       { label: 'เพิ่ม Asset',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  updated:       { label: 'แก้ไข Asset',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  transferred:   { label: 'โอนย้าย',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' },
  assigned:      { label: 'มอบหมาย',        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  image_added:   { label: 'เพิ่มรูป',       color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400' },
  image_removed: { label: 'ลบรูป',          color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  imported:      { label: 'Import Asset',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  deleted:       { label: 'ลบ Asset',         color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  unassigned:    { label: 'เอาผู้ใช้งานออก', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
}

const EMP_ACTION: Record<string, { label: string; color: string }> = {
  created:  { label: 'เพิ่มพนักงาน',   color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  updated:  { label: 'แก้ไขพนักงาน',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  deleted:  { label: 'ลบพนักงาน',      color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  imported: { label: 'Import พนักงาน', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
}

const ALL_ACTIONS = [
  { value: '', label: 'ทุก Action' },
  { value: 'created',       label: 'เพิ่ม' },
  { value: 'updated',       label: 'แก้ไข' },
  { value: 'deleted',       label: 'ลบ' },
  { value: 'transferred',   label: 'โอนย้าย' },
  { value: 'imported',      label: 'Import' },
  { value: 'image_added',   label: 'เพิ่มรูป' },
  { value: 'image_removed', label: 'ลบรูป' },
  { value: 'unassigned',    label: 'เอาผู้ใช้งานออก' },
]

interface LogRow {
  id: string
  action: string
  detail?: string
  performed_by?: string
  created_at: string
  type: 'asset' | 'employee'
  title: string
  sub?: string
}

const inp = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400 dark:placeholder-gray-500'

const LOG_PAGE_SIZE = 15

function LogPagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / LOG_PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-sm">
      <span className="text-gray-400 dark:text-gray-500 text-xs">
        {(page - 1) * LOG_PAGE_SIZE + 1}–{Math.min(page * LOG_PAGE_SIZE, total)} จาก {total} รายการ
      </span>
      <div className="flex gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">‹</button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
          .reduce<(number | '...')[]>((acc, p, i, arr) => {
            if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
            acc.push(p); return acc
          }, [])
          .map((p, i) => p === '...'
            ? <span key={`e${i}`} className="px-2 py-1 text-gray-400">…</span>
            : <button key={p} onClick={() => onChange(p as number)}
                className={`px-2.5 py-1 rounded border text-xs ${page === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{p}</button>
          )}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">›</button>
      </div>
    </div>
  )
}

export default function LogsContent() {
  const { role, loading: roleLoading } = useRole()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'asset' | 'employee'>('all')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [performerSearch, setPerformerSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('asset_logs').select('*, assets(asset_no, name)').order('created_at', { ascending: false }).limit(500),
      supabase.from('employee_logs').select('*, employees(emp_id, full_name_th)').order('created_at', { ascending: false }).limit(500),
    ]).then(([{ data: aLogs }, { data: eLogs }]) => {
      const assetRows: LogRow[] = (aLogs ?? []).map(l => {
        const [detailName, detailNo] = l.action === 'deleted' && !l.assets && l.detail
          ? l.detail.split('|') : [null, null]
        return {
          id: `a-${l.id}`, action: l.action, detail: l.action === 'deleted' ? undefined : l.detail,
          performed_by: l.performed_by, created_at: l.created_at, type: 'asset',
          title: l.assets?.name ?? detailName ?? 'Asset',
          sub: l.assets?.asset_no ?? detailNo ?? undefined,
        }
      })
      const empRows: LogRow[] = (eLogs ?? []).map(l => ({
        id: `e-${l.id}`, action: l.action, detail: l.detail,
        performed_by: l.performed_by, created_at: l.created_at, type: 'employee',
        title: l.employees?.full_name_th ?? l.detail ?? 'พนักงาน',
        sub: l.employees?.emp_id,
      }))
      setLogs([...assetRows, ...empRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      setLoading(false)
    })
  }, [])

  const userNames = useUserNames(logs.map(l => l.performed_by))

  const filtered = useMemo(() => {
    let result = logs
    if (typeFilter !== 'all') result = result.filter(l => l.type === typeFilter)
    if (actionFilter) result = result.filter(l => l.action === actionFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) ||
        (l.sub ?? '').toLowerCase().includes(q) ||
        (l.detail ?? '').toLowerCase().includes(q)
      )
    }
    if (performerSearch.trim()) {
      const q = performerSearch.trim().toLowerCase()
      result = result.filter(l => {
        const name = l.performed_by ? (userNames[l.performed_by] ?? '').toLowerCase() : ''
        return name.includes(q)
      })
    }
    if (dateFrom) result = result.filter(l => new Date(l.created_at) >= new Date(dateFrom))
    if (dateTo) result = result.filter(l => new Date(l.created_at) <= new Date(dateTo + 'T23:59:59'))
    return result
  }, [logs, typeFilter, actionFilter, search, performerSearch, dateFrom, dateTo, userNames])

  const hasFilter = typeFilter !== 'all' || actionFilter || search || performerSearch || dateFrom || dateTo
  const clearAll = () => { setTypeFilter('all'); setActionFilter(''); setSearch(''); setPerformerSearch(''); setDateFrom(''); setDateTo(''); setPage(1) }

  useEffect(() => { setPage(1) }, [typeFilter, actionFilter, search, performerSearch, dateFrom, dateTo])

  const pagedLogs = filtered.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE)

  const loggingOff = typeof window !== 'undefined' && localStorage.getItem('logging_enabled') === 'false'

  if (roleLoading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
  if (!canDelete(role)) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-gray-600 dark:text-gray-300 font-medium">ไม่มีสิทธิ์เข้าถึง</p>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">เฉพาะ Admin ขึ้นไปเท่านั้น</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Logging off banner */}
      {loggingOff && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <span>⚠️</span>
          <span>การบันทึก Log ถูกปิดอยู่ — กิจกรรมใหม่จะไม่ถูกเก็บ</span>
          <a href="/settings" className="ml-auto underline underline-offset-2 text-xs whitespace-nowrap">ไปที่ Settings</a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Activity Log</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} รายการ</span>

      </div>

      {/* Filter box */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        {/* Row 1: search + performer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ Asset / พนักงาน / รายละเอียด..."
              className={`${inp} pl-8`} />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input value={performerSearch} onChange={e => setPerformerSearch(e.target.value)}
              placeholder="ค้นหาผู้ดำเนินการ..."
              className={`${inp} pl-8`} />
          </div>
        </div>

        {/* Row 2: type + action + date range */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className={inp}>
            <option value="all">ทุกประเภท</option>
            <option value="asset">Asset</option>
            <option value="employee">พนักงาน</option>
          </select>

          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={inp}>
            {ALL_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>

          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            placeholder="ตั้งแต่วันที่" className={inp} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            placeholder="ถึงวันที่" className={inp} />
        </div>

        {/* Clear */}
        {hasFilter && (
          <div className="flex justify-end">
            <button onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
              <X size={12} /> ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? <div className="p-6 text-gray-400 dark:text-gray-500 text-sm">Loading...</div> : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {pagedLogs.map(log => {
              const actionMap = log.type === 'asset' ? ASSET_ACTION : EMP_ACTION
              const a = actionMap[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.type === 'asset' ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-500 dark:text-indigo-400' : 'bg-violet-50 dark:bg-violet-900/40 text-violet-500 dark:text-violet-400'}`}>
                        {log.type === 'asset' ? 'Asset' : 'พนักงาน'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.color}`}>{a.label}</span>
                      {log.type === 'asset' ? (
                        <>
                          {log.sub && <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 font-mono">{log.sub}</span>}
                          <span className="text-sm text-gray-500 dark:text-gray-400">{log.title}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{log.title}</span>
                          {log.sub && <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{log.sub}</span>}
                        </>
                      )}
                    </div>
                    {log.detail && log.action !== 'created' && log.action !== 'imported' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{log.detail}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('th-TH', {
                        day: 'numeric', month: 'short', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    {log.performed_by && (
                      <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {userNames[log.performed_by] ?? '...'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            {!filtered.length && (
              <div className="py-14 text-center">
                <p className="text-gray-400 dark:text-gray-500 text-sm">ไม่พบรายการที่ตรงกับเงื่อนไข</p>
                {hasFilter && (
                  <button onClick={clearAll} className="mt-2 text-xs text-indigo-500 hover:underline">ล้างตัวกรอง</button>
                )}
              </div>
            )}
          </div>
        )}
        <LogPagination page={page} total={filtered.length} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      </div>
    </div>
  )
}
