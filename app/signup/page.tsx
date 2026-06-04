'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }
    if (form.password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name },
      },
    })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">

        {/* Logo */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-indigo-700">IT Asset</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">สมัครสมาชิก</p>
        </div>

        {success ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✅</span>
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">สมัครสำเร็จ!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              กรุณาตรวจสอบอีเมล <span className="font-medium text-gray-700 dark:text-gray-200">{form.email}</span> เพื่อยืนยันบัญชี
            </p>
            <Link href="/login" className="block w-full text-center bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700">
              ไปหน้า Login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Full name */}
            <div>
              <label className={lbl}>ชื่อ-นามสกุล</label>
              <input
                value={form.full_name}
                onChange={set('full_name')}
                placeholder="สมชาย ใจดี"
                required
                className={inp}
              />
            </div>

            {/* Email */}
            <div>
              <label className={lbl}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="example@company.com"
                required
                className={inp}
              />
            </div>

            {/* Password */}
            <div>
              <label className={lbl}>รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  required
                  className={`${inp} pr-10`}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className={lbl}>ยืนยันรหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  required
                  className={`${inp} pr-10 ${form.confirm && form.confirm !== form.password ? 'border-red-300 focus:ring-red-400' : ''}`}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirm && form.confirm !== form.password && (
                <p className="text-red-500 text-xs mt-1">รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
            </button>

            {/* Login link */}
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              มีบัญชีแล้ว?{' '}
              <Link href="/login" className="text-indigo-600 font-medium hover:underline">
                เข้าสู่ระบบ
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
