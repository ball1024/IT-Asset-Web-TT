import type { Role } from '@/lib/supabase'

const ROLE_STYLE: Record<Role, string> = {
  master_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-indigo-100 text-indigo-700',
  user: 'bg-blue-100 text-blue-700',
  view: 'bg-gray-100 text-gray-600',
}

const ROLE_LABEL: Record<Role, string> = {
  master_admin: 'Master Admin', admin: 'Admin', user: 'User', view: 'View',
}

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLE[role] ?? 'bg-gray-100 text-gray-500'}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}
