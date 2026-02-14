import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardView from '@/components/dashboard-view'
import Header from '@/components/header'
import { cookies } from 'next/headers'

export default async function HomePage() {
  const supabase = await createClient()
  
  // Supabase Auth チェック
  const { data: { user } } = await supabase.auth.getUser()
  
  // チームログインセッションチェック
  const cookieStore = await cookies()
  const teamSession = cookieStore.get('team_session')
  
  let profile = null
  
  if (user) {
    // Supabase Auth ユーザー
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    
    profile = data
    
    if (!profile) {
      redirect('/profile/setup')
    }
  } else if (teamSession) {
    // チームログインユーザー
    try {
      const session = JSON.parse(teamSession.value)
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.userId)
        .single()
      
      profile = data
      
      if (!profile) {
        // セッションが無効
        cookieStore.delete('team_session')
        redirect('/auth/login')
      }
    } catch (error) {
      cookieStore.delete('team_session')
      redirect('/auth/login')
    }
  } else {
    // 未認証
    redirect('/auth/login')
  }

  // イベント一覧の取得（event_detailsビューを使用）
  const { data: events } = await supabase
    .from('event_details')
    .select('*')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(50)

  // 全イベントの参加者情報を取得
  const { data: allAttendances } = await supabase
    .from('attendances')
    .select(`
      event_id,
      status,
      comment,
      users:user_id (
        id,
        display_name,
        jersey_number
      )
    `)
    .in('event_id', events?.map(e => e.id) || [])

  // 自分の出欠情報を取得
  const { data: myAttendances } = await supabase
    .from('attendances')
    .select('event_id, status, comment')
    .eq('user_id', profile.id)

  // チーム設定を取得
  const { data: teamSettings } = await supabase
    .from('team_settings')
    .select('app_title')
    .single()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header user={profile} appTitle={teamSettings?.app_title || 'フットサルチーム管理'} />
      <main className="container mx-auto px-4 py-6">
        <DashboardView
          events={events || []} 
          myAttendances={myAttendances || []}
          allAttendances={allAttendances || []}
          isAdmin={profile.is_admin}
        />
      </main>
    </div>
  )
}
