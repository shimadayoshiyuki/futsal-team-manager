import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

// サーバー側（Server Component / APIルート）で「いま誰がログインしているか」を決める唯一の入口。
// 1. Supabase Auth（管理アカウント）でログインしていればそのユーザー
// 2. そうでなければ、署名付きの team_session Cookie を検証してそのユーザー
// どちらでもなければ null。Cookie の userId をそのまま信じる処理を他所に書かないこと。
// チームログインのセッションでは is_admin は常に false になる（管理者の操作はメールログインが必要）。

export interface CurrentProfile {
  id: string
  display_name: string
  jersey_number: number | null
  is_admin: boolean
}

export interface CurrentUser {
  authType: 'supabase' | 'team'
  userId: string
  // users テーブルに行が無いときは null（Supabase Auth ならプロフィール未設定、チームログインなら無効なセッション）
  profile: CurrentProfile | null
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let authType: CurrentUser['authType']
  let userId: string

  if (user) {
    authType = 'supabase'
    userId = user.id
  } else {
    const cookieStore = await cookies()
    const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
    if (!session) return null
    authType = 'team'
    userId = session.userId
  }

  const { data } = await createAdminClient()
    .from('users')
    .select('id, display_name, jersey_number, is_admin')
    .eq('id', userId)
    .maybeSingle()

  const profile = (data as CurrentProfile | null) ?? null

  // 管理者として扱うのは Supabase Auth（メール）でログインしたときだけ。
  // チームログインは「共通パスワード＋ニックネーム」なので、誰でも管理者のニックネームを名乗れてしまう。
  if (profile && authType === 'team') {
    profile.is_admin = false
  }

  return { authType, userId, profile }
}
