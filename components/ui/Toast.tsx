'use client'
import { useEffect } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

export interface ToastData {
  message: string
  type: 'success' | 'error'
}

interface Props extends ToastData {
  onClose: () => void
}

export default function Toast({ message, type, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-bottom-4 duration-200 max-w-sm ${
      type === 'success'
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      {type === 'success'
        ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
        : <XCircle size={18} className="text-red-500 shrink-0" />
      }
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
        <X size={14} />
      </button>
    </div>
  )
}
