import { createClient } from '@/lib/supabase'

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await createClient()
    .from('settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value ?? null
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  const { error } = await createClient()
    .from('settings')
    .upsert({ key, value })
  if (error) throw error
}
