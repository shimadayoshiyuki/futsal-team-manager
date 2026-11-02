import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

// LINE から届いたリクエストかを確かめる。
// 生のボディをチャネルシークレットで HMAC-SHA256 し、x-line-signature ヘッダー（base64）と比べる。
function isValidLineSignature(rawBody: Buffer, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest()
  const received = Buffer.from(signature, 'base64')
  // timingSafeEqual は長さが違うと例外になるので先に比べる
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function POST(request: Request) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET
    if (!channelSecret) {
      console.error('LINE_CHANNEL_SECRET is not configured')
      return NextResponse.json({ status: 'error' }, { status: 500 })
    }

    // 署名の計算には JSON に直す前の生のボディ（バイト列そのまま）が必要
    const rawBody = Buffer.from(await request.arrayBuffer())
    if (!isValidLineSignature(rawBody, request.headers.get('x-line-signature'), channelSecret)) {
      return NextResponse.json({ status: 'error' }, { status: 401 })
    }

    const body = JSON.parse(rawBody.toString('utf8'))
    const events = body.events || []
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

    // Webhookの検証（Verify）リクエストへの応答
    if (events.length === 0) {
      return NextResponse.json({ status: 'ok' })
    }

    if (!channelAccessToken) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN is not configured')
      return NextResponse.json({ status: 'error' }, { status: 500 })
    }

    for (const event of events) {
      const source = event.source || {}
      // from API: typeof source.groupId === string, similarly roomId or userId
      const groupId = source.groupId || source.roomId || source.userId

      // 「グループID」というキーワードが含まれるメッセージがきたら、その部屋のIDを発言して教える
      if (event.type === 'message' && event.message?.type === 'text' && event.message.text?.includes('グループID')) {
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
