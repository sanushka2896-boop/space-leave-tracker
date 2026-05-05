import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )
}

export async function getAuthUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await adminClient().auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function getDbUser(authEmail: string) {
  const { data, error } = await adminClient()
    .from('users')
    .select('*')
    .eq('email', authEmail)
    .single()
  if (error) return null
  return data
}

export async function requireAdmin(req: NextRequest) {
  const authUser = await getAuthUser(req)
  if (!authUser) return null
  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser?.is_admin) return null
  return dbUser
}
