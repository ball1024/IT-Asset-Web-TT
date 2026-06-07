'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Asset } from '@/lib/supabase'
import { getDamagedAssets, writeoffAsset } from '@/services/writeoffService'
import { useRole } from '@/hooks/useRole'
import { canDelete } from '@/lib/permissions'
import { Trash2, AlertTriangle, X, Search, ExternalLink, PackageX } from 'lucide-react'

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

export default function WriteoffContent() {
  const router = useRouter()
  const { role, userId } = useRole()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSingle, setConfirmSingle] = useState<Asset | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getDamagedAssets().then(data => { setAssets(data); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!q.trim()) return assets
    const lq = q.toLowerCase()
    return assets.filter(a =>
      a.asset_no?.toLowerCase().includes(lq) ||
      a.name.toLowerCase().includes(lq) ||
      a.category.toLowerCase().includes(lq) ||
      (a.brand ?? '').toLowerCase().includes(lq) ||
      ((a.employees as any)?.full_name_th ?? '').toLowerCase().includes(lq)
    )
  }, [assets, q])

  const allFilteredIds = useMemo(() => filtered.map(a => a.id), [filtered])
  const allSelected = filtered.length > 0 && allFilteredIds.every(id => selected.has(id))
  const someSelected = allFilteredIds.some(id => selected.has(id))
  const selectedCount = allFilteredIds.filter(id => selected.has(id)).length

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); allFilteredIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // single write-off
  const handleWriteoffSingle = async () => {
    if (!confirmSingle) return
    setSaving(true)
    await writeoffAsset(confirmSingle.id, userId ?? undefined)
    setSaving(false)
    setConfirmSingle(null)
    setSelected(prev => { const n = new Set(prev); n.delete(confirmSingle.id); return n })
    load()
  }

  // bulk write-off
  const handleWriteoffBulk = async () => {
    setSaving(true)
    const ids = allFilteredIds.filter(id => selected.has(id))
    await Promise.all(ids.map(id => writeoffAsset(id, userId ?? undefined)))
    setSaving(false)
    setConfirmBulk(false)
    setSelected(new Set())
    load()
  }

  if (!canDelete(role) && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">เฉพาะ Admin ขึ้นไปเท่านั้น</p>
      </div>
    )
  }

  // --- Confirm: single ---
  const ConfirmSingle = confirmSingle && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => !saving && setConfirmSingle(null)}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-red-400 to-orange-400" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">ยืนยัน Write Off</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">การกระทำนี้ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <button onClick={() => setConfirmSingle(null)} disabled={saving}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Asset ที่จะตัดจำหน่าย</p>
            <div className="flex items-center gap-2 flex-wrap">
              {confirmSingle.asset_no && (
                <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{confirmSingle.asset_no}</span>
              )}
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{confirmSingle.name}</span>
            </div>
            {confirmSingle.category && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {confirmSingle.category}{confirmSingle.brand ? ` · ${confirmSingle.brand}` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmSingle(null)} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              ยกเลิก
            </button>
            <button onClick={handleWriteoffSingle} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />กำลังบันทึก...</>
                : <><Trash2 size={14} />ยืนยัน Write Off</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // --- Confirm: bulk ---
  const bulkAssets = filtered.filter(a => selected.has(a.id))
  const ConfirmBulk = confirmBulk && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => !saving && setConfirmBulk(false)}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">ยืนยัน Write Off {selectedCount} รายการ</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">การกระทำนี้ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <button onClick={() => setConfirmBulk(false)} disabled={saving}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 mb-5 max-h-40 overflow-y-auto space-y-1.5">
            {bulkAssets.map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{a.asset_no || '—'}</span>
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{a.name}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setConfirmBulk(false)} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              ยกเลิก
            </button>
            <button onClick={handleWriteoffBulk} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />กำลังบันทึก...</>
                : <><Trash2 size={14} />Write Off {selectedCount} รายการ</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {ConfirmSingle}
      {ConfirmBulk}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <PackageX size={20} className="text-orange-500" />
              ของชำรุด / รอ Write Off
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              รายการ Asset สถานะชำรุด — ตรวจสอบแล้วยืนยันตัดจำหน่าย
            </p>
          </div>
          {!loading && assets.length > 0 && (
            <div className="flex flex-col items-center shrink-0">
              <span className="text-2xl font-black text-orange-500 leading-none">{assets.length}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">รายการ</span>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหา Asset No, ชื่อ, ประเภท..."
              className="w-full pl-8 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <span className="text-sm font-medium text-red-600 dark:text-red-400">เลือก {selectedCount} รายการ</span>
              <button
                onClick={() => setConfirmBulk(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                <Trash2 size={12} /> Write Off ทั้งหมด
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-0.5">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
                  <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-800 shrink-0" />
                  <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                  </div>
                  <div className="w-20 h-7 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <PackageX size={36} className="mb-3 opacity-25" />
              <p className="font-medium text-sm">
                {q ? 'ไม่พบรายการที่ตรงกัน' : 'ไม่มีของชำรุดในระบบ 🎉'}
              </p>
              {!q && <p className="text-xs mt-1 opacity-70">Asset ทุกชิ้นอยู่ในสภาพดี</p>}
            </div>
          ) : (
            <>
              {/* Table header with select-all */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative w-4 h-4 shrink-0">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleAll}
                      className="peer w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-red-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {allSelected ? 'ยกเลิกทั้งหมด' : `เลือกทั้งหมด (${filtered.length})`}
                  </span>
                </label>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((a, idx) => {
                  const emp = (a.employees as any)
                  const icon = CAT_ICON[a.category] ?? '📦'
                  const isSelected = selected.has(a.id)
                  return (
                    <div key={a.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors group cursor-pointer
                        ${isSelected
                          ? 'bg-red-50 dark:bg-red-900/15'
                          : 'hover:bg-orange-50/40 dark:hover:bg-orange-900/10'}`}
                      onClick={() => toggleOne(a.id)}>

                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(a.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-red-500 cursor-pointer shrink-0"
                      />

                      {/* Icon */}
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-colors
                          ${isSelected ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                          {icon}
                        </div>
                        <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-orange-400 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={e => { e.stopPropagation(); router.push(`/assets/${a.id}`) }}
                            className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                            {a.asset_no || '—'}
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{a.name}</span>
                          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs rounded-full font-medium shrink-0">
                            {a.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                          {[a.brand, a.model].filter(Boolean).join(' ') && (
                            <span>{[a.brand, a.model].filter(Boolean).join(' ')}</span>
                          )}
                          {emp?.full_name_th && (
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                              ผู้ใช้งานล่าสุด: <span className="text-gray-600 dark:text-gray-300 font-medium">{emp.full_name_th}</span>
                            </span>
                          )}
                          {a.updated_at && (
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                              {new Date(a.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Write Off button */}
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmSingle(a) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 border transition-all
                          bg-white dark:bg-gray-800 border-red-200 dark:border-red-800 text-red-500 dark:text-red-400
                          hover:bg-red-500 hover:border-red-500 hover:text-white dark:hover:bg-red-600 dark:hover:border-red-600 dark:hover:text-white">
                        <Trash2 size={12} />
                        Write Off
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-600">
            คลิกที่แถวเพื่อเลือก หรือกด <span className="font-semibold">Write Off</span> ทีละรายการ — ดำเนินการโดย Admin เท่านั้น
          </p>
        )}
      </div>
    </>
  )
}
