import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/header'
import SettingsForm from '@/components/settings-form'
import { cookies } from 'next/headers'

export default async function SettingsPage() {
  const supabase = await createClient()
  
  // 認証チェック
  const { data: { user } } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const teamSession = cookieStore.get('team_session')
  
  let profile = null
  
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  } else if (teamSession) {
    try {
      const session = JSON.parse(teamSession.value)
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.userId)
        .single()
      profile = data
    } catch (error) {
      redirect('/auth/login')
    }
  } else {
    redirect('/auth/login')
  }

  // 管理者チェック
  if (!profile || !profile.is_admin) {
    redirect('/')
  }

  // チーム設定を取得
  const { data: teamSettings } = await supabase
    .from('team_settings')
    .select('*')
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
