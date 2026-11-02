import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { isUuid } from '@/lib/utils'

const NOTIFICATION_TYPES = ['event_created', 'reminder']

export async function POST(request: Request) {
  // エラー時のログ保存で使うので try の外に置く（request.json() は2回読めない）
  let eventId: string | undefined
  let type: string | undefined

  try {
    // LINE グループに送れるのは管理者だけ（eventId は共有URLに入っているので、それだけで送れてはいけない）
    const currentUser = await getCurrentUser()
    if (!currentUser?.profile) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (!currentUser.profile.is_admin) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const body = await request.json()

    if (!isUuid(body.eventId) || !NOTIFICATION_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: 'eventId and type are required' },
        { status: 400 }
      )
    }

    eventId = body.eventId as string
    type = body.type as string

    // 権限の確認は上で済んでいるので、読み書きは service role で行う
    const supabase = createAdminClient()

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

    // サイトのURL（環境変数優先、なければリクエスト元から組み立て）
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get('origin') ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin)
    ).replace(/\/$/, '')
    const eventUrl = `${baseUrl}/events/${eventId}`

    const message = type === 'event_created'
      ? `\n⚽ 新しいイベントが作成されました！\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 ${formattedDate} ${formattedTime}\n\n出欠登録をお願いします！\n${eventUrl}`
      : `\n⚽ イベントのリマインダー\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 明日 ${formattedTime}\n\n出欠登録がまだの方はお願いします！\n${eventUrl}`

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
      throw new Error(`LINE Messaging API request failed (status ${response.status})`)
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

    // エラーログを保存（認証前・入力チェック前の失敗では eventId が無いので保存しない）
    if (eventId && type) {
      try {
        await createAdminClient().from('notifications').insert({
          event_id: eventId,
          notification_type: type,
          status: 'failed',
          error_message: error?.message ?? String(error),
        } as any)
      } catch (logError) {
        console.error('Failed to save notification error log:', logError)
      }
    }

    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
