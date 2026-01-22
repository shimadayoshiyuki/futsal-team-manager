'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClient()

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      setMessage('ログイン成功！リダイレクトしています...')
      window.location.href = '/'
    } catch (error: any) {
      setMessage(error.message || 'ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (usePassword) {
      return handlePasswordLogin(e)
    }
    
    setIsLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      setMessage('メールを送信しました！受信箱を確認してください。')
      setEmail('')
    } catch (error: any) {
      setMessage(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl font-bold text-center">
            ⚽ フットサルチーム管理
          </CardTitle>
          <CardDescription className="text-center">
            メールアドレスでログイン
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            
            {usePassword && (
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="パスワード"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={usePassword}
                  disabled={isLoading}
                />
              </div>
            )}
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading 
                ? (usePassword ? 'ログイン中...' : 'ログインメールを送信中...') 
                : (usePassword ? 'ログイン' : 'ログインリンクを送信')}
            </Button>
            
            <Button 
              type="button" 
              variant="ghost" 
              className="w-full text-sm"
              onClick={() => {
                setUsePassword(!usePassword)
                setMessage('')
              }}
            >
              {usePassword ? 'メールリンクでログイン' : 'パスワードでログイン'}
            </Button>
            
            {message && (
              <p className={`text-sm text-center ${message.includes('成功') || message.includes('送信しました') ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>初めての方はアカウントが自動作成されます</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
