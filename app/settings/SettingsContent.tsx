'use client'
import { useEffect, useState } from 'react'
import { useRole } from '@/hooks/useRole'
import { getSetting, upsertSetting } from '@/services/settingService'
import { canAccessSettings } from '@/lib/permissions'

export default function SettingsContent() {
  const { role, loading: roleLoading } = useRole()
  const [loggingEnabled, setLoggingEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // อ่านจาก localStorage ก่อน (ทันที)
    const local = localStorage.getItem('logging_enabled')
    if (local !== null) {
      setLoggingEnabled(local !== 'false')
      setLoading(false)
    } else {
      // fallback อ่านจาก Supabase ครั้งแรก
      getSetting('logging_enabled').then(value => {
          const val = value !== 'false'
          setLoggingEnabled(val)
          localStorage.setItem('logging_enabled', String(val))
          setLoading(false)
        })
    }
  }, [])

  const toggle = async () => {
    setSaving(true)
    const next = !loggingEnabled
    localStorage.setItem('logging_enabled', String(next))
    setLoggingEnabled(next)
    await upsertSetting('logging_enabled', String(next))
    setSaving(false)
  }

  if (roleLoading || loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
  if (!canAccessSettings(role)) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-gray-600 dark:text-gray-300 font-medium">ไม่มีสิทธิ์เข้าถึง</p>
    </div>
  )

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Settings</h2>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {/* Logging toggle */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">บันทึก Activity Log</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              เปิด/ปิดการเก็บ log การเพิ่ม แก้ไข ลบ Asset และพนักงาน
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              loggingEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${
              loggingEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {!loggingEnabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2.5">
          การเก็บ Log ถูกปิดอยู่ — การเปลี่ยนแปลงข้อมูลจะไม่ถูกบันทึก
        </p>
      )}
    </div>
  )
}
