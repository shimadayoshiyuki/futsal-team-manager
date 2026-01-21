import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { eventId, type } = body

    if (!eventId || !type) {
      return NextResponse.json(
        { error: 'eventId and type are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // イベント情報を取得
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    // LINE Notify トークンの確認
    const lineNotifyToken = process.env.LINE_NOTIFY_TOKEN

    if (!lineNotifyToken) {
      console.error('LINE_NOTIFY_TOKEN is not set')
      return NextResponse.json(
        { error: 'LINE Notify token is not configured' },
        { status: 500 }
      )
    }

    // メッセージの構築
    const startDate = new Date(event.start_time)
    const message = type === 'event_created'
      ? `\n⚽ 新しいイベントが作成されました！\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 ${startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} ${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}\n\n出欠登録をお願いします！`
      : `\n⚽ イベントのリマインダー\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 明日 ${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}\n\n出欠登録がまだの方はお願いします！`

    // LINE Notify API呼び出し
    const response = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lineNotifyToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `message=${encodeURIComponent(message)}`,
    })

    if (!response.ok) {
      throw new Error('LINE Notify API request failed')
    }

    // 通知履歴を保存
    await supabase.from('notifications').insert({
      event_id: eventId,
      notification_type: type,
      status: 'sent',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Notification error:', error)
    
    // エラーログを保存
    const { eventId, type } = await request.json()
    const supabase = await createClient()
    await supabase.from('notifications').insert({
      event_id: eventId,
      notification_type: type,
      status: 'failed',
      error_message: error.message,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    )
  }
}
