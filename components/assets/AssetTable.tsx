'use client'
import { useState } from 'react'
import type { Asset, Role } from '@/lib/supabase'
import { canDelete } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:  { label: 'ใช้งาน',    cls: 'bg-green-100 text-green-700' },
  repair:  { label: 'ซ่อม',      cls: 'bg-amber-100 text-amber-700' },
  storage: { label: 'สต็อก',     cls: 'bg-blue-100 text-blue-700' },
  retired: { label: 'ปลดระวาง',  cls: 'bg-gray-100 text-gray-600' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', Desktop: '🖥️', iMac: '🖥️',
  Monitor: '🖥️', Printer: '🖨️', Network: '🌐', Other: '📦',
}

interface Props {
  assets: Asset[]
  role: Role | null
  userId: string
  onDelete: (id: string) => void
}

export default function AssetTable({ assets, role, userId, onDelete }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  const del = async (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation()
    if (!confirm(`ลบ "${asset.name}"?`)) return
    setDeleting(asset.id)
    const supabase = createClient()
    await supabase.from('asset_logs').insert({ asset_id: asset.id, action: 'deleted', performed_by: userId })
    await supabase.from('assets').delete().eq('id', asset.id)
    setDeleting(null)
    onDelete(asset.id)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {['Asset', 'ประเภท', 'ยี่ห้อ / รุ่น', 'Location', 'พนักงาน', 'สถานะ', ''].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assets.map(a => {
            const s = STATUS_MAP[a.status] ?? { label: a.status, cls: 'bg-gray-100 text-gray-600' }
            return (
              <tr key={a.id}
                onClick={() => router.push(`/assets/${a.id}`)}
                className="border-t border-gray-100 hover:bg-indigo-50 cursor-pointer group transition-colors">

                {/* Asset name + no */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{CAT_ICON[a.category] ?? '📦'}</span>
                    <div>
                      <p className="font-medium text-gray-800">{a.name}</p>
                      <p className="text-xs font-mono text-indigo-600">{a.asset_no}</p>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="px-4 py-3 text-gray-600 text-sm">{a.category}</td>

                {/* Brand / Model */}
                <td className="px-4 py-3 text-gray-500 text-sm">{[a.brand, a.model].filter(Boolean).join(' ') || '-'}</td>

                {/* Location */}
                <td className="px-4 py-3 text-gray-500 text-sm">{a.location || '-'}</td>

                {/* Employee */}
                <td className="px-4 py-3">
                  {(a.employees as any)?.full_name_th ? (
                    <div>
                      <p className="text-sm font-medium text-gray-700">{(a.employees as any).full_name_th}</p>
                      <p className="text-xs text-gray-400">{a.emp_id}</p>
                    </div>
                  ) : <span className="text-gray-400 text-sm">-</span>}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                </td>

                {/* Delete */}
                <td className="px-4 py-3">
                  {canDelete(role) && (
                    <button onClick={e => del(e, a)} disabled={deleting === a.id}
                      className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {!assets.length && (
            <tr><td colSpan={7} className="text-center py-12 text-gray-400">ไม่พบ Asset</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
