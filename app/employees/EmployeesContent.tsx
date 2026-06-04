'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Employee } from '@/lib/supabase'
import { searchEmployees } from '@/lib/fuzzySearch'
import EmployeeTable from '@/components/employees/EmployeeTable'
import EmployeeForm from '@/components/employees/EmployeeForm'
import ImportExcelModal from '@/components/assets/ImportExcelModal'
import { useRole } from '@/hooks/useRole'
import { canManageEmployees } from '@/lib/permissions'
import { Search, UserPlus, Download, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function EmployeesContent() {
  const { role, userId } = useRole()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [branch, setBranch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Employee | null | 'new'>(null)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    createClient().from('employees').select('*').order('emp_id')
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const depts = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))], [employees])
  const branches = useMemo(() => [...new Set(employees.map(e => e.branch).filter(Boolean))], [employees])

  const filtered = useMemo(() => {
    let list = searchEmployees(employees, q)
    if (dept) list = list.filter(e => e.department === dept)
    if (branch) list = list.filter(e => e.branch === branch)
    if (status) list = list.filter(e => e.status === status)
    return list
  }, [employees, q, dept, branch, status])

  if (!canManageEmployees(role) && !loading) return <p className="text-gray-500 p-4">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>

  const del = async (emp: Employee) => {
    if (!confirm(`ลบพนักงาน ${emp.full_name_th}?`)) return
    const supabase = createClient()
    const uid = (await supabase.auth.getUser()).data.user?.id
    await supabase.from('employee_logs').insert({
      emp_id: emp.emp_id, action: 'deleted',
      detail: `ลบพนักงาน ${emp.full_name_th} (${emp.emp_id})`, performed_by: uid,
    })
    await supabase.from('employees').delete().eq('emp_id', emp.emp_id)
    load()
  }

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(filtered)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Employees')
    XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <>
      {editing && (
        <EmployeeForm initial={editing === 'new' ? undefined : editing}
          onDone={() => { setEditing(null); load() }} onClose={() => setEditing(null)} />
      )}
      {showImport && userId && (
        <ImportExcelModal type="employees" userId={userId} onDone={() => { setShowImport(false); load() }} onClose={() => setShowImport(false)} />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Employees</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Upload size={14} />Import</button>
            <button onClick={exportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Download size={14} />Export</button>
            <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><UserPlus size={14} />เพิ่มพนักงาน</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา..." className="pl-8 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56" />
          </div>
          <select value={dept} onChange={e => setDept(e.target.value)} className={sel}>
            <option value="">ทุกแผนก</option>
            {depts.map(d => <option key={d!}>{d}</option>)}
          </select>
          <select value={branch} onChange={e => setBranch(e.target.value)} className={sel}>
            <option value="">ทุก Branch</option>
            {branches.map(b => <option key={b!}>{b}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={sel}>
            <option value="">ทุกสถานะ</option>
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
            {loading ? 'Loading...' : `${filtered.length} คน`}
          </div>
          <EmployeeTable employees={filtered} onEdit={e => setEditing(e)} onDelete={del} />
        </div>
      </div>
    </>
  )
}
