'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset } from '@/lib/supabase'
import { Package, Wrench, Archive, Ban } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const STATUS_MAP: Record<string, string> = { active: 'ใช้งาน', repair: 'ซ่อม', storage: 'สต็อก', retired: 'ปลดระวาง' }

export default function DashboardContent() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient().from('assets').select('*, employees(full_name_th, department)').then(({ data }) => {
      setAssets(data as Asset[] ?? [])
      setLoading(false)
    })
  }, [])

  const counts = {
    total: assets.length,
    active: assets.filter(a => a.status === 'active').length,
    repair: assets.filter(a => a.status === 'repair').length,
    storage: assets.filter(a => a.status === 'storage').length,
    retired: assets.filter(a => a.status === 'retired').length,
  }

  const byCat = Object.entries(
    assets.reduce((acc, a) => { acc[a.category] = (acc[a.category] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }))

  const byDept = Object.entries(
    assets.reduce((acc, a) => {
      const dept = (a.employees as any)?.department || 'ไม่ระบุ'
      acc[dept] = (acc[dept] || 0) + 1; return acc
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)

  const recent = [...assets].sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()).slice(0, 10)

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'ทั้งหมด', value: counts.total, icon: Package, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'ใช้งาน', value: counts.active, icon: Package, color: 'text-green-600 bg-green-50' },
          { label: 'ซ่อม', value: counts.repair, icon: Wrench, color: 'text-amber-600 bg-amber-50' },
          { label: 'สต็อก', value: counts.storage, icon: Archive, color: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${color}`}><Icon size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-700 mb-4">Asset ตามประเภท</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-700 mb-4">Asset ตามแผนก (Top 8)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDept} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-700">เพิ่มล่าสุด</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['ชื่อ Asset', 'ประเภท', 'รหัสพนักงาน', 'วันที่เพิ่ม', 'สถานะ'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(a => (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{a.name}</td>
                  <td className="px-4 py-2 text-gray-600">{a.category}</td>
                  <td className="px-4 py-2 text-gray-600">{a.emp_id || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH') : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.status === 'active' ? 'bg-green-100 text-green-700' :
                      a.status === 'repair' ? 'bg-amber-100 text-amber-700' :
                      a.status === 'storage' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>{STATUS_MAP[a.status] || a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
