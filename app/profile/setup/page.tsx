'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfileSetupPage() {
  const [displayName, setDisplayName] = useState('')
  const [jerseyNumber, setJerseyNumber] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // 既にプロフィールが設定されている場合はリダイレクト
    const checkProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .single()

      if (data?.display_name) {
        router.push('/')
      }
    }

    checkProfile()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ユーザーが見つかりません')

      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email!,
          display_name: displayName,
          jersey_number: jerseyNumber ? parseInt(jerseyNumber) : null,
        })

      if (insertError) throw insertError

      router.push('/')
      router.refresh()
    } catch (error: any) {
      setError(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">プロフィール設定</CardTitle>
          <CardDescription>
            チームメンバーに表示される情報を設定してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">
                表示名（ニックネーム）<span className="text-red-500">*</span>
              </Label>
              <Input
                id="displayName"
                type="text"
                placeholder="例: たろう"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={isLoading}
                maxLength={50}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="jerseyNumber">背番号（任意）</Label>
              <Input
                id="jerseyNumber"
                type="number"
                placeholder="例: 10"
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                disabled={isLoading}
                min="0"
                max="99"
              />
              <p className="text-xs text-muted-foreground">
                0〜99の番号を設定できます
              </p>
            </div>

            <Button type="submit" className="w-full transition-all active:scale-95" disabled={isLoading}>
              {isLoading ? '登録中...' : '登録して始める'}
            </Button>

            {error && (
              <p className="text-sm text-center text-red-600">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
