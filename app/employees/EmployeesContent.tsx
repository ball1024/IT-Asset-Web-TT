'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Employee } from '@/lib/supabase'
import { insertEmployeeLog } from '@/lib/logging'
import { searchEmployees } from '@/lib/fuzzySearch'
import EmployeeTable from '@/components/employees/EmployeeTable'
import EmployeeForm from '@/components/employees/EmployeeForm'
import ImportExcelModal from '@/components/assets/ImportExcelModal'
import { useRole } from '@/hooks/useRole'
import { canManageEmployees, canDeleteEmployee } from '@/lib/permissions'
import { Search, UserPlus, Download, Upload, AlertTriangle, X } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function EmployeesContent() {
  const { role, userId } = useRole()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmEmp, setConfirmEmp] = useState<Employee | null>(null)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [branch, setBranch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Employee | null | 'new'>(null)
  const [showImport, setShowImport] = useState(false)

  const load = useCallback(() => {
    createClient().from('employees').select('*').order('emp_id')
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime: อัพเดตรายชื่อพนักงานทันทีเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('employees-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

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

  const canDelete = canDeleteEmployee(role)

  const del = async (emp: Employee) => {
    const supabase = createClient()
    const uid = (await supabase.auth.getUser()).data.user?.id
    await insertEmployeeLog({
      emp_id: emp.emp_id, action: 'deleted',
      detail: `${emp.full_name_th} (${emp.emp_id})`, performed_by: uid,
    })
    await supabase.from('employees').delete().eq('emp_id', emp.emp_id)
    setConfirmEmp(null)
    load()
  }

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(filtered)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Employees')
    XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const sel = 'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'

  return (
    <>
      {confirmEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmEmp(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setConfirmEmp(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">ยืนยันการลบพนักงาน</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">คุณต้องการลบพนักงานนี้ใช่ไหม?</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-5">
              <span className="font-mono text-indigo-600 dark:text-indigo-400 mr-2">{confirmEmp.emp_id}</span>
              {confirmEmp.full_name_th}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmEmp(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                ยกเลิก
              </button>
              <button onClick={() => del(confirmEmp)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <EmployeeForm initial={editing === 'new' ? undefined : editing}
          onDone={() => { setEditing(null); load() }} onClose={() => setEditing(null)} />
      )}
      {showImport && userId && (
        <ImportExcelModal type="employees" userId={userId} onDone={() => { setShowImport(false); load() }} onClose={() => setShowImport(false)} />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Employees</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Upload size={14} />Import</button>
            <button onClick={exportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Download size={14} />Export</button>
            <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><UserPlus size={14} />เพิ่มพนักงาน</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา..." className="pl-8 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
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
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="resign">Resign</option>
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading...' : `${filtered.length} คน`}
          </div>
          <EmployeeTable employees={filtered} onEdit={e => setEditing(e)} onDelete={canDelete ? e => setConfirmEmp(e) : undefined} />
        </div>
      </div>
    </>
  )
}
