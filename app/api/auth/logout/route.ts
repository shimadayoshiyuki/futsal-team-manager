import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const cookieStore = await cookies()
    
    // team_session Cookieを削除
    cookieStore.delete('team_session')
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Logout] Error:', error)
    return NextResponse.json(
      { success: false, error: 'ログアウトに失敗しました' },
      { status: 500 }
    )
  }
}
