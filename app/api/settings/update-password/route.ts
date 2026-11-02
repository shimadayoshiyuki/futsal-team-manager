import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 200
const GENERIC_ERROR = 'パスワードの更新に失敗しました。時間をおいてもう一度お試しください'

export async function POST(request: Request) {
  try {
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '現在のパスワードと新しいパスワードは必須です' },
        { status: 400 }
      )
    }

    if (
      typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_LENGTH ||
      typeof newPassword !== 'string' || newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        { error: '入力内容を確認してください' },
        { status: 400 }
      )
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 管理者チェック（チームのパスワード変更はメールでログインした管理者だけ）
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!(profile as { is_admin: boolean | null } | null)?.is_admin) {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    // ハッシュの読み出し・照合・作成はすべて DB の関数（SECURITY DEFINER）の中で行う。
    // どちらの関数も service role だけが呼べるようにしてある（supabase/security-01-functions.sql）
    const adminClient = createAdminClient()

    // 現在のパスワードを検証
    const { data: passwordCheck, error: verifyError } = await adminClient
      .rpc('verify_team_password', { input_password: currentPassword } as any)

    if (verifyError) {
      console.error('[Update Password] verify_team_password failed:', verifyError.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    if (passwordCheck !== true) {
      return NextResponse.json(
        { error: '現在のパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // 新しいパスワードをハッシュ化して保存
    const { error: updateError } = await adminClient
      .rpc('set_team_password', { new_password: newPassword } as any)

    if (updateError) {
      console.error('[Update Password] set_team_password failed:', updateError.message)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Update Password] Error:', error?.message ?? error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
