import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const events = body.events || []
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

    // Webhookの検証（Verify）リクエストへの応答
    if (events.length === 0) {
      return NextResponse.json({ status: 'ok' })
    }

    if (!channelAccessToken) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN is not configured')
      return NextResponse.json({ status: 'error', message: 'No token' }, { status: 500 })
    }

    for (const event of events) {
      const source = event.source || {}
      // from API: typeof source.groupId === string, similarly roomId or userId
      const groupId = source.groupId || source.roomId || source.userId

      // 「グループID」というキーワードが含まれるメッセージがきたら、その部屋のIDを発言して教える
      if (event.type === 'message' && event.message.type === 'text' && event.message.text.includes('グループID')) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [
              {
                type: 'text',
                text: `このトークルームのIDは以下の通りです：\n\n${groupId}\n\nこのIDをコピーして環境変数「LINE_GROUP_ID」に設定してください。`
              }
            ]
          })
        })
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('LINE Webhook error:', error)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
