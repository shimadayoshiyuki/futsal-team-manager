import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '現在のパスワードと新しいパスワードは必須です' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 管理者チェック
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

    if (!profile?.is_admin) {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    // 現在のチーム設定を取得
    const { data: teamSettings, error: fetchError } = await supabase
      .from('team_settings')
      .select('*')
      .single()

    if (fetchError || !teamSettings) {
      return NextResponse.json(
        { error: 'チーム設定が見つかりません' },
        { status: 500 }
      )
    }

    // 現在のパスワードを検証
    const { data: passwordCheck } = await supabase
      .rpc('verify_team_password', {
        input_password: currentPassword,
        stored_hash: teamSettings.team_password_hash,
      })

    if (!passwordCheck) {
      return NextResponse.json(
        { error: '現在のパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // 新しいパスワードのハッシュを生成
    const { data: newHash, error: hashError } = await supabase
      .rpc('generate_password_hash', {
        password: newPassword,
      })

    if (hashError || !newHash) {
      // RPCが存在しない場合は、直接SQLでハッシュ生成
      const { data: directHash } = await supabase.rpc('crypt', {
        password: newPassword,
        salt: supabase.rpc('gen_salt', { type: 'bf' }),
      })

      if (!directHash) {
        return NextResponse.json(
          { error: 'パスワードのハッシュ化に失敗しました' },
          { status: 500 }
        )
      }

      // パスワード更新
      const { error: updateError } = await supabase
        .from('team_settings')
        .update({ team_password_hash: directHash })
        .eq('id', teamSettings.id)

      if (updateError) {
        throw updateError
      }
    } else {
      // パスワード更新
      const { error: updateError } = await supabase
        .from('team_settings')
        .update({ team_password_hash: newHash })
        .eq('id', teamSettings.id)

      if (updateError) {
        throw updateError
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Update password error:', error)
    return NextResponse.json(
      { error: error.message || 'パスワードの更新に失敗しました' },
      { status: 500 }
    )
  }
}
