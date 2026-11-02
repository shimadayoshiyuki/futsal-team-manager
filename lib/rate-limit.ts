import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ログイン失敗の回数制限（IP ごと）
//
// 回数は Supabase の login_attempts テーブルで数える（security-04 の関数を service role で呼ぶ）。
// Vercel のサーバーレスはインスタンスが入れ替わるので、メモリだけで数えるとコールドスタートや
// 複数インスタンスに分かれたときに数え直しになってしまうため。
// メモリでも並行して数え、DB に届かないとき（SQL を流す前・DB の障害時）はメモリの回数だけで止める。
//
// 失敗だけを数えるので、同じ Wi-Fi から全員がログインしても、正しいパスワードなら止まらない。
// DB には IP そのものではなくハッシュを保存する。

const WINDOW_SECONDS = 15 * 60 // 15分
const MAX_FAILURES = 10 // 15分で10回まで失敗できる
const MAX_TRACKED_KEYS = 10_000 // メモリを使いすぎないための上限

const failures = new Map<string, { count: number; resetAt: number }>()

function toKey(ip: string): string {
  return createHash('sha256').update(`team-login:${ip}`).digest('hex')
}

function prune(now: number) {
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key)
  }
  // それでも多すぎるときは古いものから捨てる（Map は追加順に並ぶ）
  for (const key of failures.keys()) {
    if (failures.size < MAX_TRACKED_KEYS) break
    failures.delete(key)
  }
}

function isLimitedInMemory(key: string): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (entry.resetAt <= Date.now()) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

function recordFailureInMemory(key: string) {
  const now = Date.now()
  if (failures.size >= MAX_TRACKED_KEYS) prune(now)

  const entry = failures.get(key)
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 })
  } else {
    entry.count += 1
  }
}

// DB の関数を呼ぶ。失敗してもログインの処理は止めず、ログに残してメモリの回数に任せる
async function callDb(fn: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createAdminClient().rpc(fn as never, args as never)
    if (error) {
      console.error(`[Rate Limit] ${fn} failed:`, error.message)
      return undefined
    }
    return data
  } catch (error: any) {
    console.error(`[Rate Limit] ${fn} failed:`, error?.message ?? error)
    return undefined
  }
}

export async function isRateLimited(ip: string): Promise<boolean> {
  const key = toKey(ip)
  if (isLimitedInMemory(key)) return true
  const limited = await callDb('login_is_rate_limited', { p_key: key, p_max_failures: MAX_FAILURES })
  return limited === true
}

export async function recordFailure(ip: string) {
  const key = toKey(ip)
  recordFailureInMemory(key)
  await callDb('record_login_failure', { p_key: key, p_window_seconds: WINDOW_SECONDS })
}

export async function clearFailures(ip: string) {
  const key = toKey(ip)
  failures.delete(key)
  await callDb('clear_login_failures', { p_key: key })
}

// Vercel では x-forwarded-for を Vercel 自身が付け直すので、先頭の値が接続元の IP になる
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
