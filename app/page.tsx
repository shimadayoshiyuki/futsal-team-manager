import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EventList from '@/components/event-list'
import Header from '@/components/header'

export default async function HomePage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }

  // ユーザープロフィールの取得
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/profile/setup')
  }

  // イベント一覧の取得（event_detailsビューを使用）
  const { data: events } = await supabase
    .from('event_details')
    .select('*')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(20)

  // 自分の出欠情報を取得
  const { data: myAttendances } = await supabase
    .from('attendances')
    .select('event_id, status, comment')
    .eq('user_id', user.id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header user={profile} />
      <main className="container mx-auto px-4 py-6">
        <EventList 
          events={events || []} 
          myAttendances={myAttendances || []}
          isAdmin={profile.is_admin}
        />
      </main>
    </div>
  )
}
