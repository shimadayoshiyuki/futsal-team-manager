import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { clearFailures, getClientIp, isRateLimited, recordFailure } from '@/lib/rate-limit'

// 利用者に返すエラーは汎用の文言だけにする（DBのエラー内容などはサーバーのログにだけ出す）
const GENERIC_ERROR = 'ログイン処理でエラーが発生しました。時間をおいてもう一度お試しください'

export async function POST(request: Request) {
  const ip = getClientIp(request)

  try {
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'ログインの失敗が続いたため、しばらくログインできません。15分ほど待ってからお試しください' },
        { status: 429 }
      )
    }

    const { nickname, jerseyNumber, teamPassword } = await request.json()

    if (!nickname || !teamPassword) {
      return NextResponse.json(
        { error: 'ニックネームとパスワードは必須です' },
        { status: 400 }
      )
    }

    const jersey = jerseyNumber === undefined || jerseyNumber === null || jerseyNumber === ''
      ? null
      : Number(jerseyNumber)

    if (
      typeof nickname !== 'string' || nickname.length > 50 ||
      typeof teamPassword !== 'string' || teamPassword.length > 200 ||
      (jersey !== null && (!Number.isInteger(jersey) || jersey < 0 || jersey > 999))
    ) {
      return NextResponse.json(
        { error: '入力内容を確認してください' },
        { status: 400 }
      )
    }

    // パスワードのハッシュはアプリに持ち出さず、DB の関数（SECURITY DEFINER）の中で照合する。
    // この関数は service role だけが呼べるようにしてあるので、anon キーで直接総当たりはできない。
    const adminClient = createAdminClient()

    // 1. チーム共通パスワードの検証
    const { data: passwordCheck, error: passwordError } = await adminClient
      .rpc('verify_team_password', { input_password: teamPassword } as any)

    if (passwordError) {
      console.error('[Team Login] verify_team_password failed:', passwordError.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    if (passwordCheck !== true) {
      recordFailure(ip)
      return NextResponse.json(
        { error: 'パスワードが正しくありません' },
        { status: 401 }
      )
    }

    clearFailures(ip)

    // 2. ユーザーを検索または作成
    let userId: string

    // ニックネーム＋背番号で既存ユーザーを検索
    // 背番号なしは .eq(null) では一致しない（SQL では NULL = NULL が真にならない）ので .is() で探す。
    // 以前はこの不具合で、背番号なしの人はログインのたびに新しい行が作られていた。
    // そのため同じ人の行が複数あることがあり、1件に決め打ち（maybeSingle）はできない
    let userQuery = adminClient
      .from('users')
      .select('id, is_admin')
      .eq('display_name', nickname)
    userQuery = jersey === null
      ? userQuery.is('jersey_number', null)
      : userQuery.eq('jersey_number', jersey as any)

    const { data: candidates, error: findError } = (await userQuery
      .order('created_at', { ascending: false })
      .limit(20)) as { data: { id: string; is_admin: boolean | null }[] | null; error: { message: string } | null }

    if (findError) {
      // 検索に失敗したまま新規作成すると、同じ人の行がまた増えるので止める
      console.error('[Team Login] Failed to find user:', findError.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    if (candidates?.some((u) => u.is_admin)) {
      // 管理者のニックネームを名乗ってチームログインすることはできない（管理者はメールでログインする）
      return NextResponse.json(
        { error: 'このニックネームではログインできません。管理者の方はメールアドレスでログインしてください' },
        { status: 403 }
      )
    }

    if (candidates && candidates.length > 0) {
      userId = await pickActiveUserId(adminClient, candidates.map((u) => u.id))
    } else {
      // 新規ユーザー作成
      const { data: newUser, error: createError } = await adminClient
        .from('users')
        .insert({
          id: crypto.randomUUID(),
          display_name: nickname,
          jersey_number: jersey, // 背番号0を「なし」扱いにしない
          email: null, // メール不要
          is_admin: false,
        } as any)
        .select('id')
        .single()

      if (createError || !newUser) {
        console.error('[Team Login] Failed to create user:', createError?.message)
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
      }

      userId = (newUser as { id: string }).id
    }

    // 3. 署名付きのセッションを発行してCookieに保存
    const { token, expiresAt } = await createSessionToken(userId)

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        nickname,
        jerseyNumber: jersey,
      },
    })
  } catch (error: any) {
    console.error('[Team Login] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

// 同じニックネーム＋背番号の行が複数あるとき、いちばん最近に出欠を付けた行を使う
// （今いちばん使っている行を引き継ぐため。出欠が一つも無ければ一番新しく作られた行）
async function pickActiveUserId(
  adminClient: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<string> {
  if (userIds.length === 1) return userIds[0]

  const { data: latest, error } = (await adminClient
    .from('attendances')
    .select('user_id')
    .in('user_id', userIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { user_id: string } | null; error: { message: string } | null }

  if (error) {
    console.error('[Team Login] Failed to pick active user:', error.message)
  }

  return latest?.user_id ?? userIds[0]
}
