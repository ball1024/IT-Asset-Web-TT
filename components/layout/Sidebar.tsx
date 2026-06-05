'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, PlusCircle, ClipboardList,
  Users, ShieldCheck, Settings, LogOut, X, ChevronUp, User,
} from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { canEdit, canDelete, canViewMembers, canManageEmployees, canManageMembers, canAccessSettings } from '@/lib/permissions'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/ui/ThemeToggle'

const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin', admin: 'Admin', user: 'User', view: 'View',
}

interface Props { open: boolean; onClose: () => void }

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const { role } = useRole()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email ?? '')
        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
        setDisplayName(name)
      }
    })
  }, [])

  const logout = async () => {
    setShowUserMenu(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U'

  const active = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  const navLinks = (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Main</p>
      <Link href="/" onClick={onClose} className={active('/')}><LayoutDashboard size={18} /> Dashboard</Link>
      <Link href="/assets" onClick={onClose} className={active('/assets')}><Package size={18} /> All Assets</Link>
      {canEdit(role) && (
        <Link href="/assets/new" onClick={onClose} className={active('/assets/new')}><PlusCircle size={18} /> Add Asset</Link>
      )}
      {canDelete(role) && (
        <>
          <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1">Report</p>
          <Link href="/logs" onClick={onClose} className={active('/logs')}><ClipboardList size={18} /> Activity Log</Link>
        </>
      )}
      {(canManageEmployees(role) || canViewMembers(role) || canAccessSettings(role)) && (
        <p className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1">System</p>
      )}
      {canManageEmployees(role) && (
        <Link href="/employees" onClick={onClose} className={active('/employees')}><Users size={18} /> Employees</Link>
      )}
      {canViewMembers(role) && (
        <Link href="/members" onClick={onClose} className={active('/members')}><ShieldCheck size={18} /> Members</Link>
      )}
      {canAccessSettings(role) && (
        <Link href="/settings" onClick={onClose} className={active('/settings')}><Settings size={18} /> Settings</Link>
      )}
    </nav>
  )

  const userMenu = (
    <div className="mt-4 relative">
      {/* Popup */}
      {showUserMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{displayName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{userEmail}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs rounded-full font-medium">
                {ROLE_LABEL[role ?? ''] ?? role}
              </span>
            </div>
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setShowUserMenu(false); router.push('/profile') }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              <User size={15} /> ข้อมูลผู้ใช้
            </button>
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={logout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}

      {/* Profile button */}
      <button
        type="button"
        onClick={() => setShowUserMenu(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{displayName}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{ROLE_LABEL[role ?? ''] ?? role}</p>
        </div>
        <ChevronUp size={14} className={`text-gray-400 dark:text-gray-500 transition-transform ${showUserMenu ? '' : 'rotate-180'}`} />
      </button>
    </div>
  )

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 mb-8">
        <Link href="/" onClick={onClose} className="flex items-center gap-2">
          <img src="/TT_LOGO_0.png" alt="Teethtalk" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="text-base font-bold text-indigo-700 dark:text-indigo-400 leading-tight">IT Asset</h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Management System</p>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button onClick={onClose} className="md:hidden text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={20} />
          </button>
        </div>
      </div>
      {navLinks}
      {userMenu}
      <p className="text-[10px] text-gray-300 dark:text-gray-600 text-center mt-3 leading-tight">
        © {new Date().getFullYear()} Thanachote Jantama<br />IT Support · Teethtalk
      </p>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-60 min-h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-col py-6 px-3 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Mobile drawer */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-900 flex flex-col py-6 px-3 shadow-xl transform transition-transform duration-200 md:hidden ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {sidebarContent}
      </aside>
    </>
  )
}
