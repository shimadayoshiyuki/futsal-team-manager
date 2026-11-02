import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardView from '@/components/dashboard-view'
import Header from '@/components/header'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const supabase = await createClient()

  // ログインユーザーの確認（Supabase Auth または 署名付きチームログインセッション）
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    // 未認証
    redirect('/auth/login')
  }

  const profile = currentUser.profile

  if (!profile) {
    // Supabase Auth ならプロフィール未設定、チームログインならユーザーが消えた無効なセッション
    redirect(currentUser.authType === 'supabase' ? '/profile/setup' : '/auth/login?reset=1')
  }

  // JSTでの本日の始まり（00:00:00）を計算してイベント一覧を取得
  // これにより、開始時刻を過ぎてもその日が終わるまでスケジュールが表示されるようになります
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstTime = new Date(now.getTime() + jstOffset)
  jstTime.setUTCHours(0, 0, 0, 0)
  const startOfTodayJST = new Date(jstTime.getTime() - jstOffset)

  // イベント一覧の取得（event_detailsビューを使用）
  const { data: events } = await supabase
    .from('event_details')
    .select('*')
    .gte('start_time', startOfTodayJST.toISOString())
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
