import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { appTitle } = await request.json()

    if (!appTitle) {
      return NextResponse.json(
        { error: 'アプリタイトルは必須です' },
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

    // アプリタイトル更新
    const { error: updateError } = await supabase
      .from('team_settings')
      .update({ app_title: appTitle })
      .eq('id', (await supabase.from('team_settings').select('id').single()).data?.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Update title error:', error)
    return NextResponse.json(
      { error: error.message || 'タイトルの更新に失敗しました' },
      { status: 500 }
    )
  }
}
