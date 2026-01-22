import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 一時的にmiddlewareを無効化（デバッグ用）
  console.log('[MIDDLEWARE] Path:', request.nextUrl.pathname)
  
  // authルート以外はmiddlewareをスキップ
  if (!request.nextUrl.pathname.startsWith('/auth')) {
    console.log('[MIDDLEWARE] Bypassing middleware for:', request.nextUrl.pathname)
    return NextResponse.next()
  }
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
