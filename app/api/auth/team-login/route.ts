import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { nickname, jerseyNumber, teamPassword } = await request.json()

    console.log('[Team Login] Request:', { nickname, jerseyNumber, hasPassword: !!teamPassword })

    if (!nickname || !teamPassword) {
      return NextResponse.json(
        { error: 'ニックネームとパスワードは必須です' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 1. チーム設定からパスワードハッシュを取得
    const { data: teamSettings, error: settingsError } = await supabase
      .from('team_settings')
      .select('team_password_hash, app_title')
      .single()

    console.log('[Team Login] Team settings:', { 
      found: !!teamSettings, 
      error: settingsError?.message 
    })

    if (settingsError || !teamSettings) {
      return NextResponse.json(
        { error: `チーム設定が見つかりません: ${settingsError?.message}` },
        { status: 500 }
      )
    }

    // 2. パスワード検証（PostgreSQL の crypt 関数を使用）
    const { data: passwordCheck, error: passwordError } = await supabase
      .rpc('verify_team_password', {
        input_password: teamPassword,
        stored_hash: teamSettings.team_password_hash,
      })

    console.log('[Team Login] Password check:', { 
      passwordCheck, 
      error: passwordError?.message 
    })

    if (passwordError) {
      console.error('[Team Login] RPC error:', passwordError)
      return NextResponse.json(
        { error: `パスワード検証エラー: ${passwordError.message}` },
        { status: 500 }
      )
    }

    if (!passwordCheck) {
      return NextResponse.json(
        { error: 'パスワードが正しくありません' },
        { status: 401 }
      )
    }

    // 3. ユーザーを検索または作成
    let userId: string

    // ニックネームで既存ユーザーを検索
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('display_name', nickname)
      .eq('jersey_number', jerseyNumber || null)
      .maybeSingle()

    console.log('[Team Login] Existing user:', { found: !!existingUser })

    if (existingUser) {
      userId = existingUser.id
    } else {
      // 新規ユーザー作成（RLSをバイパスするため管理者クライアントを使用）
      const adminClient = createAdminClient()
      
      // UUIDを生成
      const newUserId = crypto.randomUUID()
      
      const { data: newUser, error: createError } = await adminClient
        .from('users')
        .insert({
          id: newUserId,
          display_name: nickname,
          jersey_number: jerseyNumber || null,
          email: null, // メール不要
          is_admin: false,
        })
        .select('id')
        .single()

      console.log('[Team Login] New user:', { 
        created: !!newUser, 
        error: createError?.message 
      })

      if (createError || !newUser) {
        return NextResponse.json(
          { error: `ユーザーの作成に失敗しました: ${createError?.message}` },
          { status: 500 }
        )
      }

      userId = newUser.id
    }

    // 4. セッショントークンを生成してCookieに保存
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30日間有効

    // Cookieにセッション情報を保存
    const cookieStore = await cookies()
    cookieStore.set('team_session', JSON.stringify({
      userId,
      nickname,
      expiresAt: expiresAt.toISOString(),
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    console.log('[Team Login] Success:', { userId, nickname })

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        nickname,
        jerseyNumber,
      },
    })
  } catch (error: any) {
    console.error('[Team Login] Error:', error)
    return NextResponse.json(
      { error: error.message || 'ログイン処理でエラーが発生しました' },
      { status: 500 }
    )
  }
}
