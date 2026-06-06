'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset } from '@/lib/supabase'
import { Package, Wrench, Archive, ChevronRight, ArrowLeft, Plus } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useRouter } from 'next/navigation'

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4']

const STATUS_MAP: Record<string, { label: string; cls: string; bar: string }> = {
  issued:    { label: 'ใช้งาน',     cls: 'bg-green-100 text-green-700',   bar: 'bg-green-500' },
  available: { label: 'ว่าง',       cls: 'bg-gray-100 text-gray-600',     bar: 'bg-gray-400' },
  repair:    { label: 'ซ่อม',       cls: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-500' },
  spare:     { label: 'Stock',      cls: 'bg-blue-100 text-blue-700',     bar: 'bg-blue-500' },
  returned:  { label: 'คืนแล้ว',    cls: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500' },
  damaged:   { label: 'เสียหาย',    cls: 'bg-red-100 text-red-700',       bar: 'bg-red-500' },
  writeoff:  { label: 'ตัดจำหน่าย', cls: 'bg-gray-200 text-gray-500',    bar: 'bg-gray-500' },
  hold:      { label: 'พักใช้',     cls: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
}

const CAT_ICON: Record<string, string> = {
  Notebook: '💻', MacBook: '💻', 'PC Desktop': '🖥️', iMac: '🖥️',
  Android: '📱', iOS: '📱', iPad: '📲',
  Monitor: '🖥️', Printer: '🖨️', TV: '📺', Network: '🌐', Other: '📦',
}

const DEPT_ICON: Record<string, string> = {
  'ฝ่ายการตลาด':                  '📣',
  'ฝ่ายคลังสินค้า':               '📦',
  'ฝ่ายจัดซื้อ':                  '🛒',
  'ฝ่ายทรัพยากรบุคคล':            '👥',
  'ฝ่ายเทคโนโลยีสารสนเทศ':        '🖥️',
  'ฝ่ายบริหาร':                   '📋',
  'ฝ่ายบริหารกลาง':               '🏢',
  'ฝ่ายบัญชีและการเงิน':          '💰',
  'ฝ่ายปฏิบัติการ':               '⚙️',
  'ฝ่ายปฏิบัติการสาขา (DA)':      '🏪',
  'ฝ่ายปฏิบัติการสาขา (DC)':      '🏪',
  'ฝ่ายปฏิบัติการสาขา (OPB)':     '🏪',
  'ฝ่ายประกันคุณภาพ':             '✅',
  'ฝ่ายลูกค้าสัมพันธ์':           '🎧',
  'ฝ่ายออนไลน์':                  '🌐',
  'ไม่ระบุ':                      '❓',
}

const GROUP_OPTIONS = [
  { value: 'category', label: 'ตามประเภท' },
  { value: 'department', label: 'ตามแผนก' },
  { value: 'status', label: 'ตามสถานะ' },
]

export default function DashboardContent() {
  const router = useRouter()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [chartGroup, setChartGroup] = useState<'category' | 'department' | 'status'>('category')
  const [drillKey, setDrillKey] = useState<string | null>(null)

  useEffect(() => {
    createClient().from('assets').select('*, employees(full_name_th, department)').then(({ data }) => {
      setAssets(data as Asset[] ?? [])
      setLoading(false)
    })
  }, [])

  const counts = useMemo(() => ({
    total:     assets.length,
    active:    assets.filter(a => a.status === 'issued').length,
    available: assets.filter(a => a.status === 'available').length,
    repair:    assets.filter(a => a.status === 'repair').length,
    storage:   assets.filter(a => a.status === 'spare').length,
  }), [assets])

  // ตามประเภท
  const byCat = useMemo(() => {
    const m: Record<string, { total: number; active: number; available: number }> = {}
    assets.forEach(a => {
      if (!m[a.category]) m[a.category] = { total: 0, active: 0, available: 0 }
      m[a.category].total++
      if (a.status === 'issued') m[a.category].active++
      else if (a.status === 'available') m[a.category].available++
    })
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total)
  }, [assets])

  // ตามแผนก
  const byDept = useMemo(() => {
    const m: Record<string, { total: number; active: number; available: number }> = {}
    assets.forEach(a => {
      const dept = (a as any).department
      if (!dept) return
      if (!m[dept]) m[dept] = { total: 0, active: 0, available: 0 }
      m[dept].total++
      if (a.status === 'issued') m[dept].active++
      else if (a.status === 'available') m[dept].available++
    })
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [assets])

  const [recentPage, setRecentPage] = useState(1)
  const RECENT_PAGE_SIZE = 10

  const recent = useMemo(() =>
    [...assets].sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()),
    [assets]
  )
  const recentPaged = recent.slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE)
  const recentPages = Math.ceil(recent.length / RECENT_PAGE_SIZE)

  // chart data
  const chartData = useMemo(() => {
    if (chartGroup === 'category') return byCat.map((d, i) => ({ name: d.name, value: d.total, fill: COLORS[i % COLORS.length] }))
    if (chartGroup === 'status') return Object.entries(STATUS_MAP).map(([k, v], i) => ({
      name: v.label, value: assets.filter(a => a.status === k).length, fill: COLORS[i % COLORS.length],
    })).filter(d => d.value > 0)
    // department
    const m: Record<string, number> = {}
    assets.forEach(a => { const d = (a as any).department; if (d) m[d] = (m[d] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
  }, [assets, chartGroup, byCat])

  // drill-down: assets ใน group ที่เลือก แยกตามสถานะ
  const drillData = useMemo(() => {
    if (!drillKey) return []
    let filtered: Asset[]
    if (chartGroup === 'category') filtered = assets.filter(a => a.category === drillKey)
    else if (chartGroup === 'department') filtered = assets.filter(a => ((a as any).department || 'ไม่ระบุ') === drillKey)
    else filtered = assets.filter(a => (STATUS_MAP[a.status]?.label ?? a.status) === drillKey)
    const m: Record<string, number> = {}
    filtered.forEach(a => { const s = STATUS_MAP[a.status]?.label ?? a.status; m[s] = (m[s] || 0) + 1 })
    return Object.entries(m).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
  }, [drillKey, assets, chartGroup])

  const maxCat = Math.max(...byCat.map(d => d.total), 1)
  const maxDept = Math.max(...byDept.map(d => d.total), 1)

  if (loading) return <div className="text-gray-500 dark:text-gray-400 text-sm">Loading...</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h2>
        <button onClick={() => router.push('/assets/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus size={14} /> Add Asset
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'ทั้งหมด',  value: counts.total,     color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40', icon: Package },
          { label: 'ใช้งาน',   value: counts.active,    color: 'text-green-600 bg-green-50 dark:bg-green-900/40',   icon: Package },
          { label: 'ว่าง',     value: counts.available, color: 'text-gray-600 bg-gray-100 dark:bg-gray-700',        icon: Archive },
          { label: 'ซ่อม',     value: counts.repair,    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/40',   icon: Wrench  },
          { label: 'Stock',    value: counts.storage,   color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/40',      icon: Archive },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg shrink-0 ${color}`}><Icon size={18} /></div>
            <div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Row: ตามประเภท + ตามแผนก */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ตามประเภท */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">🔄</span>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">ตามประเภท</h3>
          </div>
          <div className="space-y-3">
            {byCat.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-lg w-6 shrink-0">{CAT_ICON[d.name] ?? '📦'}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200 w-20 shrink-0">{d.name}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(d.total / maxCat) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-6 text-right shrink-0">{d.total}</span>
                <span className="text-xs text-green-600 dark:text-green-400 w-14 shrink-0 text-right">✓{d.active} ○{d.available}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ตามแผนก */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">🏢</span>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">ตามแผนก</h3>
            </div>
            <button onClick={() => router.push('/assets')}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              ดูทั้งหมด <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {byDept.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-lg w-6 shrink-0">{DEPT_ICON[d.name] ?? '🏢'}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 whitespace-nowrap">{d.name}</span>
                <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${(d.total / maxDept) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-6 text-right shrink-0">{d.total}</span>
                <span className="text-xs text-green-600 dark:text-green-400 w-14 shrink-0 text-right">✓{d.active} ○{d.available}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive pie chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
            {drillKey ? (
              <button onClick={() => setDrillKey(null)} className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <ArrowLeft size={14} /> กลับ
              </button>
            ) : 'Data'}
          </h3>
          {!drillKey && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {GROUP_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setChartGroup(o.value as any)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGroup === o.value ? 'bg-white dark:bg-gray-800 shadow text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {drillKey && (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {drillKey} — แยกตามสถานะ
            </span>
          )}
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-4">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={drillKey ? drillData : chartData}
                dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                onClick={(d) => { if (!drillKey && chartGroup !== 'status') setDrillKey(d.name ?? null) }}
                className={!drillKey && chartGroup !== 'status' ? 'cursor-pointer' : ''}
              >
                {(drillKey ? drillData : chartData).map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v} เครื่อง`]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {!drillKey && chartGroup !== 'status' && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-1">
            คลิกที่ส่วนของกราฟเพื่อดูรายละเอียดสถานะ
          </p>
        )}
      </div>

      {/* เพิ่มล่าสุด */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">เพิ่มล่าสุด</h3>
          <button onClick={() => router.push('/assets')}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            ดูทั้งหมด <ChevronRight size={12} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Asset No.', 'ชื่อ Asset', 'ประเภท', 'พนักงาน', 'แผนก', 'วันที่เพิ่ม', 'สถานะ'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentPaged.map(a => {
                const s = STATUS_MAP[a.status] ?? { label: a.status, cls: 'bg-gray-100 text-gray-600', bar: '' }
                const emp = (a.employees as any)
                return (
                  <tr key={a.id}
                    onClick={() => router.push(`/assets/${a.id}`)}
                    className="border-t border-gray-100 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">{a.asset_no || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      <span>{CAT_ICON[a.category] ?? '📦'}</span>{a.name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{a.category}</td>
                    <td className="px-4 py-2.5">
                      {emp?.full_name_th
                        ? <div>
                            <p className="text-gray-700 dark:text-gray-200 text-xs font-medium">{emp.full_name_th}</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs">{a.emp_id}</p>
                          </div>
                        : <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {(a as any).department || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {recentPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {(recentPage - 1) * RECENT_PAGE_SIZE + 1}–{Math.min(recentPage * RECENT_PAGE_SIZE, recent.length)} จาก {recent.length} รายการ
              </span>
              <div className="flex gap-1">
                <button onClick={() => setRecentPage(p => p - 1)} disabled={recentPage === 1}
                  className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs">‹</button>
                {Array.from({ length: recentPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === recentPages || Math.abs(p - recentPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                    acc.push(p); return acc
                  }, [])
                  .map((p, i) => p === '...'
                    ? <span key={`e${i}`} className="px-2 py-1 text-gray-400 text-xs">…</span>
                    : <button key={p} onClick={() => setRecentPage(p as number)}
                        className={`px-2.5 py-1 rounded border text-xs ${recentPage === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{p}</button>
                  )}
                <button onClick={() => setRecentPage(p => p + 1)} disabled={recentPage === recentPages}
                  className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs">›</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
