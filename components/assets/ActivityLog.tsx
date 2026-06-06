'use client'
import { useState } from 'react'
import type { AssetLog } from '@/lib/supabase'
import { ACTION_LABELS } from '@/lib/assetConstants'
import { Search, X, Clock } from 'lucide-react'

const FILTER_CHIPS: { key: string; label: string; color: string }[] = [
  { key: 'all',            label: 'ทั้งหมด',           color: 'bg-gray-400' },
  { key: 'transfer',       label: 'โอนย้าย',           color: 'bg-purple-500' },
  { key: 'assign',         label: 'มอบหมาย',           color: 'bg-cyan-500' },
  { key: 'updated',        label: 'แก้ไข',             color: 'bg-blue-500' },
  { key: 'image',          label: 'รูปภาพ',            color: 'bg-teal-500' },
  { key: 'condition_check', label: 'ตรวจสภาพเครื่อง', color: 'bg-violet-500' },
]

export default function ActivityLog({ logs, userNames, onShowDetail }: { logs: AssetLog[]; userNames: Record<string, string>; onShowDetail: (log: AssetLog) => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = logs.filter(log => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'transfer' && ['transferred', 'assigned'].includes(log.action)) ||
      (filter === 'assign'   && ['received', 'unassigned'].includes(log.action)) ||
      (filter === 'image'    && ['image_added', 'image_removed'].includes(log.action)) ||
      (filter === 'updated'  && log.action === 'updated') ||
      (filter === 'condition_check' && log.action === 'condition_check')
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
                  {['license_added', 'license_updated', 'license_removed'].includes(log.action) && log.detail
                    ? log.detail.split('\n')[0]
                    : a.label}
                  {log.detail && (log.action === 'transferred') && (
                    <span className="font-normal text-gray-500 dark:text-gray-400 ml-1 text-xs">{log.detail}</span>
                  )}
                  {(log.action === 'assigned' || log.action === 'unassigned') && log.detail && (
                    <span className="font-normal text-gray-500 dark:text-gray-400 ml-1 text-xs">· {log.detail}</span>
                  )}
                </p>
                {(log.action === 'updated' || log.action === 'condition_check' || log.action === 'license_updated') && log.detail && (() => {
                  const allLines = log.detail.split('\n')
                  const lines = log.action === 'license_updated' ? allLines.slice(1) : allLines
                  const preview = lines.slice(0, 2)
                  const hasMore = lines.length > 2
                  return (
                    <div className="mt-1">
                      <ul className="space-y-0.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                        {preview.map((line, i) => (
                          <li key={i} className="text-xs text-gray-500 dark:text-gray-400">{line}</li>
                        ))}
                      </ul>
                      {hasMore && (
                        <button onClick={() => onShowDetail(log)}
                          className="mt-1 text-xs text-indigo-500 dark:text-indigo-400 hover:underline">
                          ดูเพิ่มเติม ({lines.length - 2} รายการ)
                        </button>
                      )}
                    </div>
                  )
                })()}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
                  <span>{new Date(log.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} · {new Date(log.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
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
