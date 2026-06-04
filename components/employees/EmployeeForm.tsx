'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Employee } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  initial?: Employee
  onDone: () => void
  onClose: () => void
}

export default function EmployeeForm({ initial, onDone, onClose }: Props) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    emp_id: initial?.emp_id ?? '', full_name_th: initial?.full_name_th ?? '',
    full_name_en: initial?.full_name_en ?? '', nickname: initial?.nickname ?? '',
    department: initial?.department ?? '', position: initial?.position ?? '',
    branch: initial?.branch ?? '', emp_email: initial?.emp_email ?? '',
    phone: initial?.phone ?? '', status: initial?.status ?? 'active',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const supabase = createClient()
    const userId = (await supabase.auth.getUser()).data.user?.id
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]))
    payload.emp_id = form.emp_id; payload.full_name_th = form.full_name_th; payload.status = form.status

    if (isEdit) {
      await supabase.from('employees').update(payload).eq('emp_id', initial!.emp_id)
      await supabase.from('employee_logs').insert({
        emp_id: initial!.emp_id, action: 'updated',
        detail: `แก้ไขข้อมูล ${form.full_name_th}`, performed_by: userId,
      })
    } else {
      await supabase.from('employees').insert(payload)
      await supabase.from('employee_logs').insert({
        emp_id: form.emp_id, action: 'created',
        detail: `เพิ่มพนักงาน ${form.full_name_th}`, performed_by: userId,
      })
    }
    setSaving(false); onDone()
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[520px] relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400"><X size={18} /></button>
        <h3 className="font-semibold text-gray-800 mb-4">{isEdit ? 'แก้ไข' : 'เพิ่ม'}พนักงาน</h3>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>รหัสพนักงาน *</label><input value={form.emp_id} onChange={set('emp_id')} required disabled={isEdit} className={inp} /></div>
          <div><label className={lbl}>ชื่อ TH *</label><input value={form.full_name_th} onChange={set('full_name_th')} required className={inp} /></div>
          <div><label className={lbl}>ชื่อ EN</label><input value={form.full_name_en} onChange={set('full_name_en')} className={inp} /></div>
          <div><label className={lbl}>ชื่อเล่น</label><input value={form.nickname} onChange={set('nickname')} className={inp} /></div>
          <div><label className={lbl}>แผนก</label><input value={form.department} onChange={set('department')} className={inp} /></div>
          <div><label className={lbl}>ตำแหน่ง</label><input value={form.position} onChange={set('position')} className={inp} /></div>
          <div><label className={lbl}>Branch</label><input value={form.branch} onChange={set('branch')} className={inp} /></div>
          <div><label className={lbl}>Email</label><input type="email" value={form.emp_email} onChange={set('emp_email')} placeholder="-" className={inp} /></div>
          <div><label className={lbl}>เบอร์โทร</label><input value={form.phone} onChange={set('phone')} className={inp} /></div>
          <div>
            <label className={lbl}>สถานะ</label>
            <select value={form.status} onChange={set('status')} className={inp}>
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="resign">Resign</option>
            </select>
          </div>
          <div className="col-span-2 flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">ยกเลิก</button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
