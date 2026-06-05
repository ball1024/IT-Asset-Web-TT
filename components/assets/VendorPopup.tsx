'use client'
import type { Vendor } from '@/lib/supabase'
import { X, Phone, Mail, Globe, User, FileText, Store } from 'lucide-react'

interface Props {
  vendor: Vendor
  onClose: () => void
}

const Row = ({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value?: string; href?: string }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <Icon size={15} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      {href && value ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5 block truncate">
          {value}
        </a>
      ) : (
        <p className={`text-sm font-medium mt-0.5 ${value ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  </div>
)

export default function VendorPopup({ vendor, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm relative" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-4 p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-xl font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
            {vendor.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight">{vendor.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
              <Store size={11} /> Vendor
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-1">
          <Row icon={User}     label="ผู้ติดต่อ"  value={vendor.contact_name} />
          <Row icon={Phone}    label="เบอร์โทร"   value={vendor.phone} href={vendor.phone ? `tel:${vendor.phone}` : undefined} />
          <Row icon={Mail}     label="Email"       value={vendor.email} href={vendor.email ? `mailto:${vendor.email}` : undefined} />
          <Row icon={Globe}    label="Website"     value={vendor.website ? vendor.website.replace(/^https?:\/\//, '') : undefined} href={vendor.website} />
          <Row icon={FileText} label="หมายเหตุ"   value={vendor.notes} />
        </div>

        <div className="px-5 pb-4" />
      </div>
    </div>
  )
}
