import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// RLSをバイパスする管理者クライアント（APIルート・サーバー専用）
// service role キーが無いときに anon キーで代用すると、権限が足りずに動かないか、
// anon に余計な権限を開けて回避する方向に流れやすいので、ここで止める。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not set')
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
