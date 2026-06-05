'use client'
import { useEffect } from 'react'
import { CheckCircle2, XCircle, X, Bell } from 'lucide-react'

export interface ToastData {
  message: string
  type: 'success' | 'error' | 'info'
}

interface Props extends ToastData {
  onClose: () => void
}

export default function Toast({ message, type, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-bottom-4 duration-200 max-w-sm ${
      type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200'
      : type === 'info'  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200'
      : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'
    }`}>
      {type === 'success' ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
      : type === 'info'   ? <Bell size={18} className="text-indigo-500 shrink-0" />
      : <XCircle size={18} className="text-red-500 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 ml-1">
        <X size={14} />
      </button>
    </div>
  )
}
