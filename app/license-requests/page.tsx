import { createServerSupabase } from '@/lib/supabase-server'
import AppShell from '@/components/layout/AppShell'
import LicenseRequestsContent from './LicenseRequestsContent'

export default async function LicenseRequestsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <AppShell>
      <LicenseRequestsContent userId={user?.id ?? ''} />
    </AppShell>
  )
}
