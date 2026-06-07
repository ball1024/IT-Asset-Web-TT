'use client'
import { useState, useEffect } from 'react'
import type { Asset, Role } from '@/lib/supabase'
import { canDelete } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: 'ว่าง', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  issued:    { label: 'จ่ายแล้ว',  cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',       dot: 'bg-blue-500' },
  returned:  { label: 'รับคืน',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',   dot: 'bg-amber-500' },
  damaged:   { label: 'ชำรุด',     cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',              dot: 'bg-red-500' },
  repair:    { label: 'ส่งซ่อม',   cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  writeoff:  { label: 'Write Off',  cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border border-gray-300 dark:border-gray-700',           dot: 'bg-gray-400' },
  hold:      { label: 'Hold',       cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800', dot: 'bg-purple-500' },
  spare:     { label: 'Spare',      cls: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800',         dot: 'bg-teal-500' },
  // legacy
  active:    { label: 'จ่ายแล้ว',  cls: 'bg-blue-50 text-blue-700 border border-blue-200',   dot: 'bg-blue-500' },
  storage:   { label: 'พร้อมจ่าย', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

interface Props {
  assets: Asset[]
  role: Role | null
  userId: string
  onDelete: (id: string) => void
}

const PAGE_SIZE = 15

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm">
      <span className="text-gray-400 dark:text-gray-500 text-xs">
        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} จาก {total} รายการ
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

export default function AssetTable({ assets, role, userId, onDelete }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmAsset, setConfirmAsset] = useState<Asset | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [assets])

  const paged = assets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const goPage = (p: number) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const del = async () => {
    if (!confirmAsset) return
    setDeleting(confirmAsset.id)
    setConfirmAsset(null)
    const supabase = createClient()
    await insertAssetLog({ asset_id: confirmAsset.id, action: 'deleted', performed_by: userId, detail: `${confirmAsset.name}|${confirmAsset.asset_no ?? ''}` })
    await supabase.from('assets').delete().eq('id', confirmAsset.id)
    setDeleting(null)
    onDelete(confirmAsset.id)
  }

  return (
    <>
    {/* Confirm delete dialog */}
    {confirmAsset && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmAsset(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative" onClick={e => e.stopPropagation()}>
          <button onClick={() => setConfirmAsset(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">ยืนยันการลบ</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถกู้คืนได้</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">คุณต้องการลบ Asset นี้ใช่ไหม?</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-5">
            {confirmAsset.asset_no && <span className="font-mono text-indigo-600 dark:text-indigo-400 mr-2">{confirmAsset.asset_no}</span>}
            {confirmAsset.name}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmAsset(null)}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              ยกเลิก
            </button>
            <button onClick={del}
              className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
              ลบ
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <tr>
            {['Asset', 'ประเภท', 'ยี่ห้อ / รุ่น', 'พนักงาน', 'สถานะ', ''].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map(a => {
            const s = STATUS_MAP[a.status] ?? { label: a.status, cls: 'bg-gray-100 text-gray-600 border border-gray-200', dot: 'bg-gray-400' }
            return (
              <tr key={a.id}
                onClick={() => router.push(`/assets/${a.id}`)}
                className="border-t border-gray-100 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer group transition-colors">

                {/* Asset no + name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{CAT_ICON[a.category] ?? '📦'}</span>
                    <div>
                      <p className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{a.asset_no || '—'}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">{a.name}</p>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{a.category}</td>

                {/* Brand / Model */}
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{[a.brand, a.model].filter(Boolean).join(' ') || '-'}</td>

                {/* Employee */}
                <td className="px-4 py-3">
                  {(a.employees as any)?.full_name_th ? (
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{(a.employees as any).full_name_th}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{a.emp_id}</p>
                    </div>
                  ) : <span className="text-gray-400 dark:text-gray-500 text-sm">-</span>}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    {s.label}
                  </span>
                  {a.status === 'repair' && (() => {
                    const active = (a.repair_requests ?? []).find(r => r.status !== 'resolved')
                    return active?.case_no
                      ? <p className="text-xs font-mono text-orange-600 dark:text-orange-400 mt-0.5">{active.case_no}</p>
                      : null
                  })()}
                </td>

                {/* Delete */}
                <td className="px-4 py-3">
                  {canDelete(role) && (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmAsset(a) }}
                      disabled={deleting === a.id}
                      className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {!assets.length && (
            <tr><td colSpan={8} className="text-center py-12 text-gray-400 dark:text-gray-500">ไม่พบ Asset</td></tr>
          )}
        </tbody>
      </table>
      <Pagination page={page} total={assets.length} onChange={goPage} />
    </div>
    </>
  )
}
