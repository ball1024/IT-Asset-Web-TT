'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Asset } from '@/lib/supabase'
import { getAssets } from '@/services/assetService'
import { getVendors } from '@/services/vendorService'
import { searchAssets } from '@/lib/fuzzySearch'
import AssetTable from '@/components/assets/AssetTable'
import ImportExcelModal from '@/components/assets/ImportExcelModal'
import BarcodeScannerModal from '@/components/assets/BarcodeScannerModal'
import { useRole } from '@/hooks/useRole'
import { canImportExport, canEdit } from '@/lib/permissions'
import { Search, Download, Upload, ScanLine, X, Plus, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'

const CATEGORIES = ['ทั้งหมด', 'Notebook', 'MacBook', 'PC Desktop', 'iMac', 'Android', 'iOS', 'iPad', 'Monitor', 'Printer', 'TV', 'Network', 'Other']
const STATUSES = [
  { value: '',          label: 'ทุกสถานะ' },
  { value: 'available', label: 'ว่าง' },
  { value: 'issued',    label: 'จ่าย' },
  { value: 'returned',  label: 'รับคืน' },
  { value: 'damaged',   label: 'ชำรุด' },
  { value: 'repair',    label: 'ส่งซ่อม' },
  { value: 'writeoff',  label: 'Write Off' },
  { value: 'hold',      label: 'Hold' },
  { value: 'spare',     label: 'Spare' },
]

export default function AssetsPageContent() {
  const { role, userId } = useRole()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('ทั้งหมด')
  const [status, setStatus] = useState('')
  const [dept, setDept] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // vendor filter จาก query param (จาก Vendor page)
  const vendorIdParam   = searchParams.get('vendor_id') ?? ''
  const vendorNameParam = searchParams.get('vendor_name') ?? ''

  // sync query param → dropdown เมื่อมาจากหน้า Vendors
  useEffect(() => {
    if (vendorIdParam) setVendorFilter(vendorIdParam)
  }, [vendorIdParam])

  const onScanResult = useCallback((value: string, _target: 'asset_no' | 'serial_no') => {
    setQ(value)
    setShowScanner(false)
  }, [])

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(() => {
    getAssets().then(data => { setAssets(data); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getVendors().then(data => setVendors(data))
  }, [])

  // Realtime: อัพเดต asset list ทันทีเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('assets-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const depts = useMemo(() => {
    const s = new Set(assets.map(a => (a.employees as any)?.department).filter(Boolean))
    return ['ทุกแผนก', ...Array.from(s)]
  }, [assets])

  const filtered = useMemo(() => {
    let list = searchAssets(assets, q)
    if (cat !== 'ทั้งหมด') list = list.filter(a => a.category === cat)
    if (status) list = list.filter(a => a.status === status)
    if (dept && dept !== 'ทุกแผนก') list = list.filter(a => (a.employees as any)?.department === dept)
    if (vendorFilter) list = list.filter(a => (a as any).vendor_id === vendorFilter)
    return list
  }, [assets, q, cat, status, dept, vendorFilter])

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

  const syncFromSheets = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch(`/api/sheets-sync?secret=${process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_SECRET ?? ''}&userId=${userId ?? ''}`)
      const json = await res.json()
      if (json.ok) {
        setSyncMsg(`✅ Sync สำเร็จ: เพิ่ม ${json.created} อัพเดต ${json.updated} ลบ ${json.deleted} ข้าม ${json.skipped}`)
        load()
      } else {
        setSyncMsg(`❌ ${json.error ?? 'Sync ล้มเหลว'}`)
      }
    } catch {
      setSyncMsg('❌ เชื่อมต่อไม่ได้')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 5000)
    }
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
          <div className="flex gap-2 items-center">
            {syncMsg && (
              <span className="text-xs text-gray-600 dark:text-gray-300">{syncMsg}</span>
            )}
            {(role === 'admin' || role === 'master_admin') && (
              <button
                onClick={syncFromSheets}
                disabled={syncing}
                title="Sync จาก Google Sheets"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'กำลัง Sync...' : 'Sync Sheets'}
              </button>
            )}
            {canEdit(role) && (
              <button onClick={() => router.push('/assets/new')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Plus size={14} /> Add Asset
              </button>
            )}
            {canImportExport(role) && (
              <>
                <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Upload size={14} /> Import
                </button>
                <button onClick={exportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Download size={14} /> Export
                </button>
              </>
            )}
          </div>
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
          <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); router.push('/assets') }} className={sel}>
            <option value="">ทุก Vendor</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading...' : `${filtered.length} รายการ`}
          </div>
          <AssetTable assets={filtered} role={role} userId={userId ?? ''} onDelete={() => load()} />
        </div>
      </div>
    </>
  )
}
