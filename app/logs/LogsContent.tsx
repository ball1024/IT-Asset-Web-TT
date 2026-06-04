'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUserNames } from '@/hooks/useUserNames'
import { useRole } from '@/hooks/useRole'
import { canDelete } from '@/lib/permissions'

const ASSET_ACTION: Record<string, { label: string; color: string }> = {
  created:       { label: 'เพิ่ม Asset',    color: 'bg-green-100 text-green-700' },
  updated:       { label: 'แก้ไข Asset',    color: 'bg-blue-100 text-blue-700' },
  transferred:   { label: 'โอนย้าย',        color: 'bg-indigo-100 text-indigo-700' },
  assigned:      { label: 'มอบหมาย',        color: 'bg-purple-100 text-purple-700' },
  image_added:   { label: 'เพิ่มรูป',       color: 'bg-teal-100 text-teal-700' },
  image_removed: { label: 'ลบรูป',          color: 'bg-orange-100 text-orange-700' },
  imported:      { label: 'Import Asset',   color: 'bg-amber-100 text-amber-700' },
  deleted:       { label: 'ลบ Asset',       color: 'bg-red-100 text-red-700' },
}

const EMP_ACTION: Record<string, { label: string; color: string }> = {
  created:  { label: 'เพิ่มพนักงาน',       color: 'bg-green-100 text-green-700' },
  updated:  { label: 'แก้ไขพนักงาน',       color: 'bg-blue-100 text-blue-700' },
  deleted:  { label: 'ลบพนักงาน',          color: 'bg-red-100 text-red-700' },
  imported: { label: 'Import พนักงาน',     color: 'bg-amber-100 text-amber-700' },
}

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

export default function LogsContent() {
  const { role, loading: roleLoading } = useRole()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'asset' | 'employee'>('all')

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('asset_logs').select('*, assets(asset_no, name)').order('created_at', { ascending: false }).limit(200),
      supabase.from('employee_logs').select('*, employees(emp_id, full_name_th)').order('created_at', { ascending: false }).limit(200),
    ]).then(([{ data: aLogs }, { data: eLogs }]) => {
      const assetRows: LogRow[] = (aLogs ?? []).map(l => ({
        id: `a-${l.id}`, action: l.action, detail: l.detail,
        performed_by: l.performed_by, created_at: l.created_at, type: 'asset',
        title: l.assets?.name ?? 'Asset',
        sub: l.assets?.asset_no,
      }))
      const empRows: LogRow[] = (eLogs ?? []).map(l => ({
        id: `e-${l.id}`, action: l.action, detail: l.detail,
        performed_by: l.performed_by, created_at: l.created_at, type: 'employee',
        title: l.employees?.full_name_th ?? l.detail ?? 'พนักงาน',
        sub: l.employees?.emp_id,
      }))
      const all = [...assetRows, ...empRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setLogs(all)
      setLoading(false)
    })
  }, [])

  const userNames = useUserNames(logs.map(l => l.performed_by))

  if (roleLoading) return <div className="text-gray-400 text-sm">Loading...</div>
  if (!canDelete(role)) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-gray-600 font-medium">ไม่มีสิทธิ์เข้าถึง</p>
      <p className="text-gray-400 text-sm mt-1">เฉพาะ Admin ขึ้นไปเท่านั้น</p>
    </div>
  )

  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Activity Log</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'asset', 'employee'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${filter === f ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'all' ? 'ทั้งหมด' : f === 'asset' ? 'Asset' : 'พนักงาน'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? <div className="p-6 text-gray-400 text-sm">Loading...</div> : (
          <div className="divide-y divide-gray-100">
            {filtered.map(log => {
              const actionMap = log.type === 'asset' ? ASSET_ACTION : EMP_ACTION
              const a = actionMap[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* ประเภท entity */}
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.type === 'asset' ? 'bg-indigo-50 text-indigo-500' : 'bg-violet-50 text-violet-500'}`}>
                        {log.type === 'asset' ? 'Asset' : 'พนักงาน'}
                      </span>
                      {/* action */}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.color}`}>
                        {a.label}
                      </span>
                      {/* ชื่อ */}
                      <span className="text-sm font-medium text-gray-800">{log.title}</span>
                      {log.sub && <span className="text-xs text-gray-400 font-mono">{log.sub}</span>}
                    </div>
                    {log.detail && log.action !== 'created' && log.action !== 'imported' && (
                      <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('th-TH', {
                        day: 'numeric', month: 'short', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    {log.performed_by && (
                      <p className="text-xs font-medium text-indigo-600 mt-0.5">
                        {userNames[log.performed_by] ?? '...'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            {!filtered.length && <p className="text-center py-10 text-gray-400">ยังไม่มี activity</p>}
          </div>
        )}
      </div>
    </div>
  )
}
