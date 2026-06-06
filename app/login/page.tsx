'use client'
import { useState } from 'react'
import Image from 'next/image'
import logoSrc from '@/public/TT_LOGO_0.png'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
  const lbl = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    let email = identifier.trim()

    // ถ้าไม่มี @ → ถือว่าเป็น username → ค้นหา email
    if (!email.includes('@')) {
      const res = await fetch('/api/auth/lookup-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'ไม่พบ Username นี้ในระบบ')
        setLoading(false)
        return
      }
      email = json.email
    }

    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Email / Username หรือรหัสผ่านไม่ถูกต้อง')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <Image src={logoSrc} alt="Teethtalk" className="h-16 w-auto object-contain mb-3" priority />
          <h1 className="text-xl font-bold text-indigo-700 dark:text-indigo-400">IT Asset Management</h1>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className={lbl}>Email หรือ Username</label>
            <input
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="example@company.com หรือ username"
              required
              autoComplete="username"
              className={inp}
            />
          </div>

          <div>
            <label className={lbl}>รหัสผ่าน</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="รหัสผ่าน"
                required
                autoComplete="current-password"
                className={`${inp} pr-10`}
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
          ยังไม่มีบัญชี?{' '}
          <Link href="/signup" className="text-indigo-600 font-medium hover:underline">สมัครสมาชิก</Link>
        </p>
      </div>
    </div>
  )
}
