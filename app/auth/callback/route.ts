import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('[AUTH CALLBACK] Starting authentication callback')
  console.log('[AUTH CALLBACK] Code present:', !!code)
  console.log('[AUTH CALLBACK] Origin:', origin)

  if (code) {
    const supabase = await createClient()
    console.log('[AUTH CALLBACK] Exchanging code for session...')
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('[AUTH CALLBACK] Error exchanging code:', error.message)
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }

    console.log('[AUTH CALLBACK] Session exchange successful')
    console.log('[AUTH CALLBACK] User ID:', data.user?.id)
    console.log('[AUTH CALLBACK] User Email:', data.user?.email)
    
    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'
    
    const redirectUrl = isLocalEnv 
      ? `${origin}${next}`
      : forwardedHost 
        ? `https://${forwardedHost}${next}` 
        : `${origin}${next}`
    
    console.log('[AUTH CALLBACK] Redirecting to:', redirectUrl)
    return NextResponse.redirect(redirectUrl)
  }

  console.error('[AUTH CALLBACK] No code provided')
  return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
}
