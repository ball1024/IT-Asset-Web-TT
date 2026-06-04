'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset } from '@/lib/supabase'
import { searchAssets } from '@/lib/fuzzySearch'
import AssetTable from '@/components/assets/AssetTable'
import ImportExcelModal from '@/components/assets/ImportExcelModal'
import BarcodeScannerModal from '@/components/assets/BarcodeScannerModal'
import { useRole } from '@/hooks/useRole'
import { canImportExport } from '@/lib/permissions'
import { Search, Download, Upload, ScanLine } from 'lucide-react'
import * as XLSX from 'xlsx'

const CATEGORIES = ['ทั้งหมด', 'Notebook', 'MacBook', 'PC Desktop', 'iMac', 'Android', 'iOS', 'iPad', 'Monitor', 'Printer', 'TV', 'Network', 'Other']
const STATUSES = [
  { value: '', label: 'ทุกสถานะ' }, { value: 'active', label: 'ใช้งาน' },
  { value: 'available', label: 'ว่าง' }, { value: 'repair', label: 'ซ่อม' }, { value: 'storage', label: 'Stock' },
]

export default function AssetsPageContent() {
  const { role, userId } = useRole()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('ทั้งหมด')
  const [status, setStatus] = useState('')
  const [dept, setDept] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const onScanResult = useCallback((value: string, _target: 'asset_no' | 'serial_no') => {
    setQ(value)
    setShowScanner(false)
  }, [])

  const load = () => {
    createClient().from('assets').select('*, employees(full_name_th, full_name_en, department)').order('created_at', { ascending: false })
      .then(({ data }) => { setAssets(data as Asset[] ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const depts = useMemo(() => {
    const s = new Set(assets.map(a => (a.employees as any)?.department).filter(Boolean))
    return ['ทุกแผนก', ...Array.from(s)]
  }, [assets])

  const filtered = useMemo(() => {
    let list = searchAssets(assets, q)
    if (cat !== 'ทั้งหมด') list = list.filter(a => a.category === cat)
    if (status) list = list.filter(a => a.status === status)
    if (dept && dept !== 'ทุกแผนก') list = list.filter(a => (a.employees as any)?.department === dept)
    return list
  }, [assets, q, cat, status, dept])

  const exportXlsx = () => {
    const data = filtered.map(a => ({
      asset_no: a.asset_no, name: a.name, category: a.category, brand: a.brand, model: a.model,
      serial_no: a.serial_no, status: a.status, location: a.location, purchase_date: a.purchase_date,
      emp_id: a.emp_id, notes: a.notes,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assets')
    XLSX.writeFile(wb, `assets_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const sel = 'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'

  return (
    <>
      {showImport && userId && (
        <ImportExcelModal type="assets" userId={userId} onDone={() => { setShowImport(false); load() }} onClose={() => setShowImport(false)} />
      )}
      {showScanner && (
        <BarcodeScannerModal target="asset_no" onResult={onScanResult} onClose={() => setShowScanner(false)} />
      )}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">All Assets</h2>
          {canImportExport(role) && (
            <div className="flex gap-2">
              <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Upload size={14} /> Import
              </button>
              <button onClick={exportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Download size={14} /> Export
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหา Asset No., ชื่อ, พนักงาน..."
              className="pl-8 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => setShowScanner(true)}
              title="Scan บาร์โค้ด"
              className="absolute right-2 text-gray-400 hover:text-indigo-600 transition-colors"
            >
              <ScanLine size={16} />
            </button>
          </div>
          <select value={cat} onChange={e => setCat(e.target.value)} className={sel}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={sel}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={dept} onChange={e => setDept(e.target.value)} className={sel}>
            {depts.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading...' : `${filtered.length} รายการ`}
          </div>
          <AssetTable assets={filtered} role={role} userId={userId ?? ''} onDelete={id => setAssets(a => a.filter(x => x.id !== id))} />
        </div>
      </div>
    </>
  )
}
