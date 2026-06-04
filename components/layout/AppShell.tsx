'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { Menu } from 'lucide-react'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 dark:text-gray-400 hover:text-indigo-600">
            <Menu size={22} />
          </button>
          <h1 className="text-base font-bold text-indigo-700 dark:text-indigo-400 flex-1">IT Asset</h1>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
