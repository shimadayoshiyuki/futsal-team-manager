import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // チームログインのセッションをチェック
  const teamSession = request.cookies.get('team_session')
  let isTeamLoggedIn = false
  
  if (teamSession) {
    try {
      const session = JSON.parse(teamSession.value)
      // セッションの有効期限をチェック
      if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
        isTeamLoggedIn = true
      }
    } catch (e) {
      // JSON parse error - invalid session
    }
  }

  // Supabase認証またはチームログインのいずれかでログイン済み
  const isAuthenticated = user || isTeamLoggedIn

  // プロフィール未設定チェック（Supabase認証済みだがプロフィールがない場合）
  if (user && !request.nextUrl.pathname.startsWith('/profile/setup') && 
      !request.nextUrl.pathname.startsWith('/auth')) {
    const { data: profile, error } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()

    // プロフィールが存在しない、またはdisplay_nameが空の場合
    if (!profile || !profile.display_name) {
      const url = request.nextUrl.clone()
      url.pathname = '/profile/setup'
      return NextResponse.redirect(url)
    }
  }

  // 未認証ユーザーが保護されたルートにアクセスしようとした場合
  if (
    !isAuthenticated &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/login')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // 認証済みユーザーがログインページにアクセスしようとした場合
  if (isAuthenticated && request.nextUrl.pathname.startsWith('/auth/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
