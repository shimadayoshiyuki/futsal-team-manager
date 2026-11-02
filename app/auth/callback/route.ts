import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 移動先はサイト内のパス（"/" 始まり）だけにする。"@example.com" のような値だと、前に付けるドメインと
  // 合わさって "https://本来のドメイン@example.com"（＝example.com への移動）になってしまうため。
  // "//" と "/\" で始まる値も念のため外す
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
    ? nextParam
    : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // エラー時はログインページへ
  return NextResponse.redirect(`${origin}/auth/login`)
}
