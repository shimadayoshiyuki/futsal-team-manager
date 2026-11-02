import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { isUuid } from '@/lib/utils'

const STATUSES = ['attending', 'not_attending', 'undecided']
const MAX_COMMENT_LENGTH = 500
const GENERIC_ERROR = '保存できませんでした。時間をおいてもう一度お試しください'

// 自分の出欠を登録・更新する。
// 書き込む user_id はブラウザから受け取らず、検証済みのセッションから決める（他人の出欠は書き換えられない）。
export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser?.profile) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }

    const { eventId, status, comment } = await request.json()

    if (
      !isUuid(eventId) ||
      !STATUSES.includes(status) ||
      (comment != null && (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH))
    ) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle()

    if (!event) {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }

    // 1ユーザーにつき1イベント1回答（UNIQUE(event_id, user_id)）なので、あれば更新・なければ作成
    const { error } = await supabase
      .from('attendances')
      .upsert(
        {
          event_id: eventId,
          user_id: currentUser.userId,
          status,
          comment: comment || null,
        } as any,
        { onConflict: 'event_id,user_id' }
      )

    if (error) {
      console.error('[Attendances] Failed to save:', error.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Attendances] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
