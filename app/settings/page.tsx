import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/header'
import SettingsForm from '@/components/settings-form'
import { getCurrentUser } from '@/lib/auth'

export default async function SettingsPage() {
  const supabase = await createClient()

  // 認証チェック（Supabase Auth または 署名付きチームログインセッション）
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/auth/login')
  }

  const profile = currentUser.profile

  // 管理者チェック
  if (!profile || !profile.is_admin) {
    redirect('/')
  }

  // チーム設定を取得
  // パスワードのハッシュ（team_password_hash）は画面に渡さない。anon からも読めないよう列の権限を絞っている
  const { data: teamSettings } = await supabase
    .from('team_settings')
    .select('id, app_title')
    .single()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header user={profile} appTitle={teamSettings?.app_title || 'フットサルチーム管理'} />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">チーム設定</h1>
        <SettingsForm initialSettings={teamSettings} />
      </main>
    </div>
  )
}
