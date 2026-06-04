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
      pathname === href ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
    }`

  const navLinks = (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Main</p>
      <Link href="/" onClick={onClose} className={active('/')}><LayoutDashboard size={18} /> Dashboard</Link>
      <Link href="/assets" onClick={onClose} className={active('/assets')}><Package size={18} /> All Assets</Link>
      {canEdit(role) && (
        <Link href="/assets/new" onClick={onClose} className={active('/assets/new')}><PlusCircle size={18} /> Add Asset</Link>
      )}
      {canDelete(role) && (
        <>
          <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-1">Report</p>
          <Link href="/logs" onClick={onClose} className={active('/logs')}><ClipboardList size={18} /> Activity Log</Link>
        </>
      )}
      {(canManageEmployees(role) || canViewMembers(role) || canAccessSettings(role)) && (
        <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-1">System</p>
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
      {/* Popup — อยู่บน profile button */}
      {showUserMenu && (
        <>
          {/* overlay ปิด popup */}
          <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">{displayName}</p>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                {ROLE_LABEL[role ?? ''] ?? role}
              </span>
            </div>
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setShowUserMenu(false); router.push('/profile') }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
              <User size={15} /> ข้อมูลผู้ใช้
            </button>
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={logout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}

      {/* Profile button */}
      <button
        type="button"
        onClick={() => setShowUserMenu(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors">
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
          <p className="text-xs text-gray-400">{ROLE_LABEL[role ?? ''] ?? role}</p>
        </div>
        <ChevronUp size={14} className={`text-gray-400 transition-transform ${showUserMenu ? '' : 'rotate-180'}`} />
      </button>
    </div>
  )

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-indigo-700">IT Asset</h1>
          <p className="text-xs text-gray-400 mt-0.5">Management System</p>
        </div>
        <button onClick={onClose} className="md:hidden text-gray-400 hover:text-gray-600 p-1">
          <X size={20} />
        </button>
      </div>
      {navLinks}
      {userMenu}
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-60 min-h-screen bg-white border-r border-gray-200 flex-col py-6 px-3 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Mobile drawer */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white flex flex-col py-6 px-3 shadow-xl transform transition-transform duration-200 md:hidden ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {sidebarContent}
      </aside>
    </>
  )
}
