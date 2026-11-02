import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

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

  // チームログインのセッションをチェック（署名と有効期限を検証）
  const teamSessionCookie = request.cookies.get(SESSION_COOKIE)?.value
  const isTeamLoggedIn = !!(await verifySessionToken(teamSessionCookie))
  // 署名が合わない・期限切れの Cookie はリダイレクト時に消す
  const hasInvalidTeamSession = !!teamSessionCookie && !isTeamLoggedIn

  // ページ側で「署名は正しいがユーザーが存在しない」と判定されたときは /auth/login?reset=1 に来る。
  // Cookie を消してログイン画面を出す（消さないと / と /auth/login を往復し続けるため）
  if (request.nextUrl.pathname === '/auth/login' && request.nextUrl.searchParams.has('reset')) {
    supabaseResponse.cookies.delete(SESSION_COOKIE)
    return supabaseResponse
  }

  // Supabase認証またはチームログインのいずれかでログイン済み
  const isAuthenticated = user || isTeamLoggedIn

  // プロフィール未設定チェック（Supabase認証済みだがプロフィールがない場合）
  // チームログインの場合はスキップ
  if (user && !isTeamLoggedIn && 
      !request.nextUrl.pathname.startsWith('/profile/setup') && 
      !request.nextUrl.pathname.startsWith('/auth')) {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()

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
    const redirectResponse = NextResponse.redirect(url)
    if (hasInvalidTeamSession) {
      redirectResponse.cookies.delete(SESSION_COOKIE)
    }
    return redirectResponse
  }

  // 認証済みユーザーがログインページにアクセスしようとした場合
  if (isAuthenticated && request.nextUrl.pathname === '/auth/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
