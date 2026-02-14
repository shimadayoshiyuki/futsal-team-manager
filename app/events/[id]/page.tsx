import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EventDetail from '@/components/event-detail'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { cookies } from 'next/headers'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  // Supabase Auth チェック
  const { data: { user } } = await supabase.auth.getUser()
  
  // チームログインセッションチェック
  const cookieStore = await cookies()
  const teamSession = cookieStore.get('team_session')
  
  let userId: string
  let profile = null
  
  if (user) {
    // Supabase Auth ユーザー
    userId = user.id
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
      userId = session.userId
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

  // イベント詳細の取得
  const { data: event } = await supabase
    .from('event_details')
    .select('*')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  // 参加者一覧の取得（全ステータス）
  const { data: attendances } = await supabase
    .from('attendances')
    .select(`
      *,
      users (
        display_name,
        jersey_number
      )
    `)
    .eq('event_id', id)

  // 自分の出欠情報の取得
  const { data: myAttendance } = await supabase
    .from('attendances')
    .select('*')
    .eq('event_id', id)
    .eq('user_id', userId)
    .single()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Button>
        </Link>

        <EventDetail
          event={event}
          attendances={attendances || []}
          myAttendance={myAttendance}
          userId={userId}
          isAdmin={profile.is_admin}
        />
      </div>
    </div>
  )
}
