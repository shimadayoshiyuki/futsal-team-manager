import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import EventDetail from '@/components/event-detail'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // ログインユーザーの確認（Supabase Auth または 署名付きチームログインセッション）
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    // 未認証
    redirect('/auth/login')
  }

  const userId = currentUser.userId
  const profile = currentUser.profile

  if (!profile) {
    // Supabase Auth ならプロフィール未設定、チームログインならユーザーが消えた無効なセッション
    redirect(currentUser.authType === 'supabase' ? '/profile/setup' : '/auth/login?reset=1')
  }

  // ここから下の読み取りは service role で行う（ログインの確認は上で済んでいる）。
  // 公開されている anon キーでは名簿・出欠・イベントを読めないように権限を外している（security-04）
  const supabase = createAdminClient()

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

  // ゲスト情報の取得
  const { data: eventGuests } = await supabase
    .from('event_guests')
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
          eventGuests={eventGuests || []}
          myAttendance={myAttendance}
          userId={userId}
          isAdmin={profile.is_admin}
        />
      </div>
    </div>
  )
}
