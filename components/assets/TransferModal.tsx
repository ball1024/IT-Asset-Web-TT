'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Asset, Employee } from '@/lib/supabase'
import { searchEmployees } from '@/lib/fuzzySearch'
import { X } from 'lucide-react'

interface Props {
  asset: Asset
  onDone: () => void
  onClose: () => void
  userId: string
}

export default function TransferModal({ asset, onDone, onClose, userId }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Employee | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    createClient().from('employees').select('*').eq('status', 'active').then(({ data }) => setEmployees(data ?? []))
  }, [])

  const filtered = searchEmployees(employees, query).slice(0, 8)

  const confirm = async () => {
    if (!selected) return
    setSaving(true)
    const supabase = createClient()
    const oldEmp = asset.employees
    await supabase.from('assets').update({ emp_id: selected.emp_id }).eq('id', asset.id)
    await supabase.from('asset_logs').insert({
      asset_id: asset.id, action: 'transferred',
      detail: `โอนย้ายจาก ${oldEmp?.emp_id || '-'} ${oldEmp?.full_name_th || '-'} → ${selected.emp_id} ${selected.full_name_th}`,
      performed_by: userId,
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-96 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400"><X size={18} /></button>
        <h3 className="font-semibold text-gray-800 mb-4">โอนย้าย Asset</h3>
        <p className="text-sm text-gray-500 mb-1">Asset: <span className="font-medium text-gray-800">{asset.name}</span></p>
        <p className="text-sm text-gray-500 mb-4">ผู้ใช้งานปัจจุบัน: {asset.employees?.full_name_th || '-'}</p>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาพนักงาน..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.map(emp => (
            <button key={emp.emp_id} onClick={() => setSelected(emp)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${selected?.emp_id === emp.emp_id ? 'bg-indigo-100' : ''}`}>
              <span className="font-medium">{emp.full_name_th}</span>
              <span className="text-gray-400 ml-2">{emp.emp_id}</span>
              {emp.department && <span className="text-gray-400 ml-2">· {emp.department}</span>}
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-4 text-gray-400 text-sm text-center">ไม่พบพนักงาน</p>}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
          <button onClick={confirm} disabled={!selected || saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันโอนย้าย'}
          </button>
        </div>
      </div>
    </div>
  )
}
