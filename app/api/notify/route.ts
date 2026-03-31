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
    const { data: event } = (await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()) as any

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    // LINE Messaging API トークンと送信先の確認
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const groupId = process.env.LINE_GROUP_ID

    if (!channelAccessToken || !groupId) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID is not set')
      return NextResponse.json(
        { error: 'LINE Messaging API credentials are not configured' },
        { status: 500 }
      )
    }

    // メッセージの構築
    const startDate = new Date(event.start_time)
    const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', weekday: 'short' }
    const optionsTime: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }
    
    const formattedDate = startDate.toLocaleDateString('ja-JP', optionsDate)
    const formattedTime = startDate.toLocaleTimeString('ja-JP', optionsTime)

    const message = type === 'event_created'
      ? `\n⚽ 新しいイベントが作成されました！\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 ${formattedDate} ${formattedTime}\n\n出欠登録をお願いします！`
      : `\n⚽ イベントのリマインダー\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 明日 ${formattedTime}\n\n出欠登録がまだの方はお願いします！`

    // LINE Messaging API (Push Message) 呼び出し
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [
          {
            type: 'text',
            text: message.trim()
          }
        ]
      }),
    })

    if (!response.ok) {
      throw new Error('LINE Notify API request failed')
    }

    // 通知履歴を保存
    await supabase.from('notifications').insert({
      event_id: eventId,
      notification_type: type,
      status: 'sent',
    } as any)

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
    } as any)

    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    )
  }
}
