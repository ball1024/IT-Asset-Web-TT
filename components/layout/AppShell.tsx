'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { Menu, User, ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/hooks/useRole'

const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin', admin: 'Admin', user: 'User', view: 'View',
}
const ROLE_COLOR: Record<string, string> = {
  master_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  view: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

function UserMenu() {
  const { role } = useRole()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setDisplayName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User')
    })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {avatarLetter}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{displayName}</p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_COLOR[role ?? ''] ?? ROLE_COLOR.view}`}>
            {ROLE_LABEL[role ?? ''] ?? role}
          </span>
        </div>
        <ChevronDown size={14} className={`text-gray-400 hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => { setOpen(false); router.push('/profile') }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <User size={15} /> ข้อมูลผู้ใช้
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Fixed Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"
          aria-label="เปิดเมนู"
        >
          <Menu size={22} />
        </button>

        <Link href="/" className="flex items-center gap-2 mr-auto">
          <Image src="/TT_LOGO_0.png" alt="Teethtalk" width={120} height={40} style={{ height: '2.5rem', width: 'auto' }} className="object-contain" />
          <span className="font-bold text-indigo-700 dark:text-indigo-400 text-lg hidden sm:block">IT Asset Teethtalk</span>
        </Link>

        <ThemeToggle />
        <UserMenu />
      </header>

      {/* Sidebar Drawer */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
