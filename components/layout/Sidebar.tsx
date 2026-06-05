'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Package, PlusCircle, ClipboardList,
  Users, ShieldCheck, Settings, LogOut, X, KeyRound, Store,
} from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { canEdit, canDelete, canViewMembers, canManageEmployees, canViewMembers as _cv, canAccessSettings } from '@/lib/permissions'
import { createClient } from '@/lib/supabase'

interface Props { open: boolean; onClose: () => void }

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const { role } = useRole()
  const router = useRouter()

  const logout = async () => {
    onClose()
    await createClient().auth.signOut()
    router.push('/login')
  }

  const active = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}

      {/* Drawer */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-900 flex flex-col py-5 px-3 shadow-xl transform transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-6">
          <Link href="/" onClick={onClose} className="flex items-center gap-2">
            <Image src="/TT_LOGO_0.png" alt="Teethtalk" width={100} height={32} className="h-8 w-auto object-contain" />
            <div>
              <p className="text-base font-bold text-indigo-700 dark:text-indigo-400 leading-tight">IT Asset</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Management System</p>
            </div>
          </Link>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
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
          {canEdit(role) && (
            <Link href="/vendors" onClick={onClose} className={active('/vendors')}><Store size={18} /> Vendors</Link>
          )}
          {canViewMembers(role) && (
            <Link href="/members" onClick={onClose} className={active('/members')}><ShieldCheck size={18} /> Members</Link>
          )}
          {canViewMembers(role) && (
            <Link href="/license-requests" onClick={onClose} className={active('/license-requests')}>
              <KeyRound size={18} /> License Requests
            </Link>
          )}
          {canAccessSettings(role) && (
            <Link href="/settings" onClick={onClose} className={active('/settings')}><Settings size={18} /> Settings</Link>
          )}
        </nav>

        {/* Sign out */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} /> Sign out
          </button>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 text-center mt-3">
            © {new Date().getFullYear()} Thanachote Jantama · IT Support · Teethtalk
          </p>
        </div>
      </aside>
    </>
  )
}
