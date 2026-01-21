import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EventDetail from '@/components/event-detail'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  // イベント詳細の取得
  const { data: event } = await supabase
    .from('event_details')
    .select('*')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  // 参加者一覧の取得
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
    .eq('status', 'attending')

  // 自分の出欠情報の取得
  const { data: myAttendance } = await supabase
    .from('attendances')
    .select('*')
    .eq('event_id', id)
    .eq('user_id', user.id)
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
          userId={user.id}
          isAdmin={profile.is_admin}
        />
      </div>
    </div>
  )
}
