'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'

function useUsernameCheck(username: string) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  useEffect(() => {
    if (username.length < 3) { setStatus('idle'); return }
    setStatus('checking')
    const t = setTimeout(async () => {
      const res = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const { taken } = await res.json()
      setStatus(taken ? 'taken' : 'available')
    }, 500)
    return () => clearTimeout(t)
  }, [username])

  return status
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const usernameStatus = useUsernameCheck(form.username)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    if (k === 'username') val = val.toLowerCase().replace(/[^a-z0-9_.]/g, '')
    setForm(f => ({ ...f, [k]: val }))
  }

  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.username.length < 3) { setError('Username ต้องมีอย่างน้อย 3 ตัวอักษร'); return }
    if (usernameStatus === 'taken') { setError('Username นี้ถูกใช้งานแล้ว'); return }
    if (form.password !== form.confirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    if (form.password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }

    setLoading(true)
    const supabase = createClient()

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name, username: form.username } },
    })

    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

    // บันทึก username ลง profiles table
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: form.username.toLowerCase().trim(),
        email: form.email.toLowerCase().trim(),
      })
    }

    setSuccess(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Image src="/TT_LOGO_0.png" alt="Teethtalk" width={180} height={56} style={{ height: '3.5rem', width: 'auto' }} className="object-contain mb-3" unoptimized />
          <h1 className="text-xl font-bold text-indigo-700 dark:text-indigo-400">IT Asset Management</h1>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">สมัครสมาชิก</p>
        </div>

        {success ? (
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

            <div>
              <label className={lbl}>ชื่อ-นามสกุล</label>
              <input value={form.full_name} onChange={set('full_name')}
                placeholder="สมชาย ใจดี" required className={inp} />
            </div>

            <div>
              <label className={lbl}>Username</label>
              <div className="relative">
                <input
                  value={form.username}
                  onChange={set('username')}
                  placeholder="เช่น somchai99 (a-z, 0-9, _, .)"
                  required
                  minLength={3}
                  className={`${inp} pr-8 ${usernameStatus === 'taken' ? 'border-red-400 focus:ring-red-400' : usernameStatus === 'available' ? 'border-green-400 focus:ring-green-400' : ''}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader2 size={15} className="animate-spin text-gray-400" />}
                  {usernameStatus === 'available' && <CheckCircle2 size={15} className="text-green-500" />}
                  {usernameStatus === 'taken' && <XCircle size={15} className="text-red-500" />}
                </span>
              </div>
              {usernameStatus === 'taken' && <p className="text-red-500 text-xs mt-1">Username นี้ถูกใช้งานแล้ว</p>}
              {usernameStatus === 'available' && <p className="text-green-500 text-xs mt-1">Username ใช้งานได้</p>}
            </div>

            <div>
              <label className={lbl}>Email</label>
              <input type="email" value={form.email} onChange={set('email')}
                placeholder="example@company.com" required className={inp} />
            </div>

            <div>
              <label className={lbl}>รหัสผ่าน</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')}
                  placeholder="อย่างน้อย 6 ตัวอักษร" required className={`${inp} pr-10`} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className={lbl}>ยืนยันรหัสผ่าน</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')}
                  placeholder="กรอกรหัสผ่านอีกครั้ง" required
                  className={`${inp} pr-10 ${form.confirm && form.confirm !== form.password ? 'border-red-300 focus:ring-red-400' : ''}`} />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirm && form.confirm !== form.password && (
                <p className="text-red-500 text-xs mt-1">รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
            </button>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              มีบัญชีแล้ว?{' '}
              <Link href="/login" className="text-indigo-600 font-medium hover:underline">เข้าสู่ระบบ</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
