// チームログインのセッションCookie（team_session）の発行と検証
//
// Cookie の中身は「payload.署名」の2つを base64url でつないだもの。
// 署名は SESSION_SECRET を鍵にした HMAC-SHA256 なので、中身（userId）を書き換えると検証で弾かれる。
// middleware（Edge ランタイム）でも動くよう、node:crypto ではなく Web Crypto（crypto.subtle）を使う。
// どちらも Node / Edge に最初から入っているもので、追加パッケージは不要。
//
// ⚠️ team_session の検証は必ず verifySessionToken() を通すこと（JSON.parse で直接読まない）

export const SESSION_COOKIE = 'team_session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30日間有効

export interface TeamSession {
  userId: string
  expiresAt: Date
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET
  // 短い鍵は総当たりされやすいので受け付けない
  if (!secret || secret.length < 32) return null
  return secret
}

function importKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

// ログイン成功時に発行する。SESSION_SECRET が無いときは発行しない（例外）
export async function createSessionToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const secret = getSecret()
  if (!secret) {
    throw new Error('SESSION_SECRET is not set or too short (32+ chars required)')
  }

  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000)
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ uid: userId, exp: Math.floor(expiresAt.getTime() / 1000) }))
  )
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(payload))

  return { token: `${payload}.${toBase64Url(new Uint8Array(signature))}`, expiresAt }
}

// 署名と有効期限を確かめて、正しければ中身を返す。少しでもおかしければ null
export async function verifySessionToken(token: string | null | undefined): Promise<TeamSession | null> {
  if (!token) return null

  const secret = getSecret()
  if (!secret) {
    console.error('[Session] SESSION_SECRET is not set or too short')
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts

  const signatureBytes = fromBase64Url(signature)
  const payloadBytes = fromBase64Url(payload)
  if (!signatureBytes || !payloadBytes) return null

  // crypto.subtle.verify は比較を一定時間で行う（タイミング攻撃対策）
  const isValid = await crypto.subtle.verify(
    'HMAC',
    await importKey(secret),
    signatureBytes as BufferSource,
    encoder.encode(payload)
  )
  if (!isValid) return null

  try {
    const data = JSON.parse(decoder.decode(payloadBytes))
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number') return null
    if (data.exp * 1000 <= Date.now()) return null
    return { userId: data.uid, expiresAt: new Date(data.exp * 1000) }
  } catch {
    return null
  }
}
