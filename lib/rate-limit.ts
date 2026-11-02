// ログイン失敗の回数制限（IP ごと・メモリ上で数える簡易版）
//
// Vercel のサーバーレスでは、数えた回数は「同じインスタンスが使い回されている間」だけ残る。
// アクセスの少ないこのアプリでは大半のリクエストが同じインスタンスに届くので総当たりの速度は大きく落ちるが、
// コールドスタートや複数インスタンスに分かれたときは数え直しになる（完全な制限ではない）。
// 確実に数えたくなったら Supabase のテーブルで数える方式に置き換える。
//
// 失敗だけを数えるので、同じ Wi-Fi から全員がログインしても、正しいパスワードなら止まらない。

const WINDOW_MS = 15 * 60 * 1000 // 15分
const MAX_FAILURES = 10 // 15分で10回まで失敗できる
const MAX_TRACKED_KEYS = 10_000 // メモリを使いすぎないための上限

const failures = new Map<string, { count: number; resetAt: number }>()

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

export function isRateLimited(key: string): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (entry.resetAt <= Date.now()) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

export function recordFailure(key: string) {
  const now = Date.now()
  if (failures.size >= MAX_TRACKED_KEYS) prune(now)

  const entry = failures.get(key)
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    entry.count += 1
  }
}

export function clearFailures(key: string) {
  failures.delete(key)
}

// Vercel では x-forwarded-for を Vercel 自身が付け直すので、先頭の値が接続元の IP になる
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
