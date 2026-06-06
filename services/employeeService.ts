import { createClient } from '@/lib/supabase'
import type { Employee } from '@/lib/supabase'

export async function getEmployees() {
  const { data, error } = await createClient()
    .from('employees')
    .select('*')
    .order('full_name_th')
  if (error) throw error
  return (data ?? []) as Employee[]
}

export async function getActiveEmployees() {
  const { data, error } = await createClient()
    .from('employees')
    .select('*')
    .eq('status', 'active')
    .order('full_name_th')
  if (error) throw error
  return (data ?? []) as Employee[]
}

export async function getEmployeeById(empId: string) {
  const { data, error } = await createClient()
    .from('employees')
    .select('*')
    .eq('emp_id', empId)
    .single()
  if (error) throw error
  return data as Employee
}

export async function createEmployee(payload: Omit<Employee, 'created_at' | 'updated_at'>) {
  const { data, error } = await createClient()
    .from('employees')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Employee
}

export async function updateEmployee(empId: string, payload: Partial<Employee>) {
  const { error } = await createClient()
    .from('employees')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('emp_id', empId)
  if (error) throw error
}

export async function deleteEmployee(empId: string) {
  const { error } = await createClient()
    .from('employees')
    .delete()
    .eq('emp_id', empId)
  if (error) throw error
}

export async function getEmployeeEmails(): Promise<Record<string, { full_name_th: string; position?: string }>> {
  const { data } = await createClient()
    .from('employees')
    .select('emp_email, full_name_th, position')
  const map: Record<string, { full_name_th: string; position?: string }> = {}
  ;(data ?? []).forEach(e => {
    if (e.emp_email) map[e.emp_email] = { full_name_th: e.full_name_th, position: e.position }
  })
  return map
}
