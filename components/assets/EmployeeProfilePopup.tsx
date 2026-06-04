'use client'
import type { Employee } from '@/lib/supabase'
import { X, Phone, Mail, MapPin, Briefcase, Building2 } from 'lucide-react'

interface Props {
  employee: Employee
  onClose: () => void
}

const Row = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
    <Icon size={15} className="text-gray-400 mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${value ? 'text-gray-800' : 'text-gray-300'}`}>{value || '—'}</p>
    </div>
  </div>
)

export default function EmployeeProfilePopup({ employee, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-100">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl shrink-0">
            {employee.full_name_th.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-800 text-lg leading-tight">{employee.full_name_th}</p>
            {employee.full_name_en && <p className="text-sm text-gray-500">{employee.full_name_en}</p>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{employee.emp_id}</span>
              {employee.nickname && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">"{employee.nickname}"</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-2">
          <Row icon={Building2} label="แผนก" value={employee.department} />
          <Row icon={Briefcase} label="ตำแหน่ง" value={employee.position} />
          <Row icon={MapPin}    label="Branch / สาขา" value={employee.branch} />
          <Row icon={Phone}     label="เบอร์โทร" value={employee.phone} />
          <Row icon={Mail}      label="Email" value={employee.emp_email} />
        </div>

        {/* Footer status */}
        <div className="px-6 py-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            employee.status === 'active'    ? 'bg-green-100 text-green-700' :
            employee.status === 'probation' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-600'
          }`}>
            {employee.status === 'active' ? 'Active' : employee.status === 'probation' ? 'Probation' : 'Resign'}
          </span>
        </div>
      </div>
    </div>
  )
}
