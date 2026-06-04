'use client'
import type { Employee } from '@/lib/supabase'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  employees: Employee[]
  onEdit: (emp: Employee) => void
  onDelete: (emp: Employee) => void
}

export default function EmployeeTable({ employees, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {['รหัส', 'ชื่อ TH', 'ชื่อ EN', 'แผนก', 'ตำแหน่ง', 'Branch', 'สถานะ', ''].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.emp_id} className="border-t border-gray-100 hover:bg-gray-50 group">
              <td className="px-4 py-2.5 font-mono text-xs text-indigo-700">{emp.emp_id}</td>
              <td className="px-4 py-2.5 font-medium text-gray-800">{emp.full_name_th}</td>
              <td className="px-4 py-2.5 text-gray-500">{emp.full_name_en || '-'}</td>
              <td className="px-4 py-2.5 text-gray-600">{emp.department || '-'}</td>
              <td className="px-4 py-2.5 text-gray-500">{emp.position || '-'}</td>
              <td className="px-4 py-2.5 text-gray-500">{emp.branch || '-'}</td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  emp.status === 'active' ? 'bg-green-100 text-green-700' :
                  emp.status === 'probation' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {emp.status === 'active' ? 'Active' : emp.status === 'probation' ? 'Probation' : 'Resign'}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(emp)} className="p-1 text-gray-400 hover:text-indigo-600"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(emp)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
          {!employees.length && <tr><td colSpan={8} className="text-center py-10 text-gray-400">ไม่พบพนักงาน</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
