'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, Employee } from '@/lib/supabase'
import { createRepairRequest } from '@/services/repairService'
import { X, Wrench, Loader2, ChevronDown } from 'lucide-react'
import Fuse from 'fuse.js'

interface Props {
  userId?: string
  presetAssetId?: string
  onDone: () => void
  onClose: () => void
}

export default function NewRepairModal({ userId, presetAssetId, onDone, onClose }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])

  // asset search
  const [assetQuery, setAssetQuery] = useState('')
  const [assetResults, setAssetResults] = useState<Asset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [showAssetDrop, setShowAssetDrop] = useState(false)
  const [activeRepairWarning, setActiveRepairWarning] = useState('')

  // reporter search
  const [empQuery, setEmpQuery] = useState('')
  const [empResults, setEmpResults] = useState<Employee[]>([])
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [showEmpDrop, setShowEmpDrop] = useState(false)
  const empRef = useRef<HTMLDivElement>(null)

  const [issue, setIssue] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    // ดึง asset ทุก status ยกเว้น writeoff
    supabase.from('assets').select('id,asset_no,name,category,status,emp_id')
      .not('status', 'eq', 'writeoff').order('asset_no')
      .then(({ data }) => {
        const list = (data ?? []) as Asset[]
        setAssets(list)
        if (presetAssetId) {
          const found = list.find(a => a.id === presetAssetId)
          if (found) {
            setSelectedAsset(found)
            setAssetQuery(`${found.asset_no} — ${found.name}`)
          }
        }
      })
    supabase.from('employees').select('emp_id,full_name_th,full_name_en,nickname,department')
      .eq('status', 'active').order('full_name_th')
      .then(({ data }) => setAllEmployees((data ?? []) as Employee[]))
  }, [presetAssetId])

  // asset fuzzy search
  useEffect(() => {
    if (!assetQuery.trim() || selectedAsset) { setAssetResults([]); return }
    const fuse = new Fuse(assets, { keys: ['asset_no', 'name'], threshold: 0.35 })
    setAssetResults(fuse.search(assetQuery).slice(0, 8).map(r => r.item))
  }, [assetQuery, assets, selectedAsset])

  // auto-fill reporter จาก emp ของ asset ที่เลือก
  useEffect(() => {
    if (!selectedAsset?.emp_id) return
    const emp = allEmployees.find(e => e.emp_id === selectedAsset.emp_id)
    if (emp) { setSelectedEmp(emp); setEmpQuery(emp.full_name_th) }
  }, [selectedAsset, allEmployees])

  // employee fuzzy search
  useEffect(() => {
    if (!empQuery.trim() || selectedEmp) { setEmpResults([]); return }
    const fuse = new Fuse(allEmployees, { keys: ['emp_id', 'full_name_th', 'full_name_en', 'nickname'], threshold: 0.35 })
    setEmpResults(fuse.search(empQuery).slice(0, 8).map(r => r.item))
  }, [empQuery, allEmployees, selectedEmp])

  // ปิด emp dropdown เมื่อคลิกนอก
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (empRef.current && !empRef.current.contains(e.target as Node)) setShowEmpDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearEmp = () => { setSelectedEmp(null); setEmpQuery(''); setEmpResults([]) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAsset) { setError('กรุณาเลือก Asset'); return }
    if (!issue.trim()) { setError('กรุณาระบุอาการ/ปัญหา'); return }
    setError('')
    setSaving(true)
    try {
      const { data, error: repairError } = await createRepairRequest({
        asset_id: selectedAsset.id,
        reported_by: selectedEmp?.emp_id || undefined,
        issue: issue.trim(),
        notes: notes.trim() || undefined,
        performed_by: userId,
      })
      if (repairError) { setError(repairError); return }
      if (!data) { setError('บันทึกไม่สำเร็จ — กรุณาลองใหม่'); return }
      onDone()
    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Wrench size={16} /> แจ้งซ่อม
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">

          {/* Asset search */}
          <div className="relative">
            <label className={lbl}>Asset *</label>
            <input
              value={assetQuery}
              onChange={e => { setAssetQuery(e.target.value); setSelectedAsset(null); setShowAssetDrop(true) }}
              onFocus={() => { if (assetQuery && !selectedAsset) setShowAssetDrop(true) }}
              placeholder="ค้นหา Asset No. หรือชื่อ..."
              className={inp}
              disabled={!!presetAssetId}
            />
            {showAssetDrop && assetResults.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {assetResults.map(a => (
                  <li key={a.id}>
                    <button type="button"
                      onMouseDown={async e => {
                        e.preventDefault()
                        setSelectedAsset(a)
                        setAssetQuery(`${a.asset_no} — ${a.name}`)
                        setShowAssetDrop(false)
                        setActiveRepairWarning('')
                        // เช็คว่ามี repair เปิดอยู่ไหม
                        const { getActiveRepairByAsset } = await import('@/services/repairService')
                        const active = await getActiveRepairByAsset(a.id)
                        if (active) setActiveRepairWarning(`เครื่องนี้มีการแจ้งซ่อมที่ยังดำเนินการอยู่ (${active.status === 'pending' ? 'รอดำเนินการ' : 'กำลังซ่อม'}) — ต้องรอซ่อมเสร็จก่อน`)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm flex items-center gap-2">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 text-xs">{a.asset_no}</span>
                      <span className="text-gray-700 dark:text-gray-200 truncate">{a.name}</span>
                      <span className="ml-auto text-xs text-gray-400 shrink-0">{a.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {activeRepairWarning && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 mt-1 flex items-center gap-1.5">
                ⚠️ {activeRepairWarning}
              </p>
            )}
            {selectedAsset && !activeRepairWarning && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                {selectedAsset.category} · สถานะ: {selectedAsset.status}
              </p>
            )}
          </div>

          {/* Reporter search combobox */}
          <div ref={empRef} className="relative">
            <label className={lbl}>ผู้แจ้งซ่อม</label>
            <div className="relative">
              <input
                value={empQuery}
                onChange={e => { setEmpQuery(e.target.value); setSelectedEmp(null); setShowEmpDrop(true) }}
                onFocus={() => { if (empQuery && !selectedEmp) setShowEmpDrop(true) }}
                placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัสพนักงาน..."
                className={`${inp} pr-8`}
                autoComplete="off"
              />
              {selectedEmp
                ? <button type="button" onClick={clearEmp}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <X size={14} />
                  </button>
                : <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              }
            </div>
            {selectedEmp && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                <span className="font-mono bg-indigo-50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">{selectedEmp.emp_id}</span>
                {selectedEmp.department && <span className="text-gray-400">· {selectedEmp.department}</span>}
              </p>
            )}
            {showEmpDrop && empResults.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {empResults.map(emp => (
                  <li key={emp.emp_id}>
                    <button type="button"
                      onMouseDown={e => { e.preventDefault(); setSelectedEmp(emp); setEmpQuery(emp.full_name_th); setShowEmpDrop(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {emp.full_name_th.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-100 truncate">
                          {emp.full_name_th}
                          {emp.nickname && <span className="text-gray-400 font-normal"> ({emp.nickname})</span>}
                        </p>
                        <p className="text-xs text-gray-400">{emp.emp_id}{emp.department ? ` · ${emp.department}` : ''}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* อาการ */}
          <div>
            <label className={lbl}>อาการ / ปัญหา *</label>
            <textarea value={issue} onChange={e => setIssue(e.target.value)} rows={3}
              placeholder="เช่น เปิดเครื่องไม่ติด, จอดับ, แบตเสื่อม..."
              className={inp} />
          </div>

          {/* หมายเหตุ */}
          <div>
            <label className={lbl}>หมายเหตุ</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inp} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving || !!activeRepairWarning}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'กำลังบันทึก...' : 'แจ้งซ่อม'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
