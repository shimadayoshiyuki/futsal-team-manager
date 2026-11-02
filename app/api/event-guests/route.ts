import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import { isUuid } from '@/lib/utils'

const MAX_GUEST_COUNT = 50
const MAX_COMMENT_LENGTH = 500
const GENERIC_ERROR = '保存できませんでした。時間をおいてもう一度お試しください'

// 助っ人（ゲスト）の追加・変更・削除。
// 書き込む user_id はブラウザから受け取らず、検証済みのセッションから決める。
// 変更・削除できるのは「自分が登録した行」か管理者だけ（画面の canEdit と同じ条件）。

function isValidGuestCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_GUEST_COUNT
}

function isValidComment(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.length <= MAX_COMMENT_LENGTH)
}

async function requireLogin(): Promise<CurrentUser | NextResponse> {
  const currentUser = await getCurrentUser()
  if (!currentUser?.profile) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  return currentUser
}

// 対象の行が存在し、いまのユーザーが触ってよいかを確かめる
async function requireOwnGuest(currentUser: CurrentUser, id: unknown): Promise<string | NextResponse> {
  if (!isUuid(id)) {
    return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
  }

  const { data: guest } = (await createAdminClient()
    .from('event_guests')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()) as { data: { id: string; user_id: string } | null }

  if (!guest) {
    return NextResponse.json({ error: '助っ人情報が見つかりません' }, { status: 404 })
  }
  if (guest.user_id !== currentUser.userId && !currentUser.profile?.is_admin) {
    return NextResponse.json({ error: 'この助っ人情報は変更できません' }, { status: 403 })
  }
  return guest.id
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireLogin()
    if (currentUser instanceof NextResponse) return currentUser

    const { eventId, guestCount, comment } = await request.json()

    if (!isUuid(eventId) || !isValidGuestCount(guestCount) || !isValidComment(comment)) {
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

    const { error } = await supabase
      .from('event_guests')
      .insert({
        event_id: eventId,
        user_id: currentUser.userId,
        guest_count: guestCount,
        comment: comment || null,
      } as any)

    if (error) {
      console.error('[Event Guests] Failed to create:', error.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Event Guests] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireLogin()
    if (currentUser instanceof NextResponse) return currentUser

    const { id, guestCount, comment } = await request.json()

    if (!isValidGuestCount(guestCount) || !isValidComment(comment)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
    }

    const guestId = await requireOwnGuest(currentUser, id)
    if (guestId instanceof NextResponse) return guestId

    const { error } = await (createAdminClient()
      .from('event_guests') as any)
      .update({ guest_count: guestCount, comment: comment || null })
      .eq('id', guestId)

    if (error) {
      console.error('[Event Guests] Failed to update:', error.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Event Guests] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const currentUser = await requireLogin()
    if (currentUser instanceof NextResponse) return currentUser

    const { id } = await request.json()

    const guestId = await requireOwnGuest(currentUser, id)
    if (guestId instanceof NextResponse) return guestId

    const { error } = await createAdminClient()
      .from('event_guests')
      .delete()
      .eq('id', guestId)

    if (error) {
      console.error('[Event Guests] Failed to delete:', error.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Event Guests] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
