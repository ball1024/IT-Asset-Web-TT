'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/hooks/useRole'
import Toast, { type ToastData } from '@/components/ui/Toast'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin', admin: 'Admin', user: 'User', view: 'View',
}
const ROLE_COLOR: Record<string, string> = {
  master_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-indigo-100 text-indigo-700',
  user: 'bg-blue-100 text-blue-700',
  view: 'bg-gray-100 text-gray-600',
}

export default function ProfileContent() {
  const { role, userId } = useRole()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ message, type })

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setFullName(user.user_metadata?.full_name ?? '')
      }
    })
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    const { error } = await createClient().auth.updateUser({ data: { full_name: fullName } })
    setSavingProfile(false)
    if (error) showToast('บันทึกไม่สำเร็จ: ' + error.message, 'error')
    else showToast('บันทึกข้อมูลสำเร็จ', 'success')
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPass !== confirmPass) { showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return }
    if (newPass.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว', 'error'); return }
    setSavingPass(true)
    const { error } = await createClient().auth.updateUser({ password: newPass })
    setSavingPass(false)
    if (error) showToast('เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message, 'error')
    else {
      showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success')
      setCurrentPass(''); setNewPass(''); setConfirmPass('')
    }
  }

  const avatarLetter = fullName?.charAt(0)?.toUpperCase() || email?.charAt(0)?.toUpperCase() || 'U'
  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="max-w-xl space-y-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">ข้อมูลผู้ใช้</h2>

        {/* Avatar + Role */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
            {avatarLetter}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{fullName || '-'}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">{email}</p>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[role ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
              {ROLE_LABEL[role ?? ''] ?? role}
            </span>
          </div>
        </div>

        {/* แก้ไขข้อมูล */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">แก้ไขข้อมูลส่วนตัว</h3>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className={lbl}>ชื่อ-นามสกุล</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="กรอกชื่อ-นามสกุล" className={inp} />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input value={email} disabled className={`${inp} bg-gray-50 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed`} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ไม่สามารถเปลี่ยน Email ได้</p>
            </div>
            <button type="submit" disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {savingProfile && <Loader2 size={14} className="animate-spin" />}
              {savingProfile ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </div>

        {/* เปลี่ยนรหัสผ่าน */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">เปลี่ยนรหัสผ่าน</h3>
          <form onSubmit={savePassword} className="space-y-4">
            <div>
              <label className={lbl}>รหัสผ่านใหม่</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร" className={`${inp} pr-10`} />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className={lbl}>ยืนยันรหัสผ่านใหม่</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="กรอกอีกครั้ง"
                  className={`${inp} pr-10 ${confirmPass && confirmPass !== newPass ? 'border-red-300' : ''}`} />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPass && confirmPass !== newPass && (
                <p className="text-red-500 text-xs mt-1">รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>
            <button type="submit" disabled={savingPass || !newPass}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {savingPass && <Loader2 size={14} className="animate-spin" />}
              {savingPass ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
