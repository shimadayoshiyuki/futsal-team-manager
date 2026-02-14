'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface SettingsFormProps {
  initialSettings: any
}

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [formData, setFormData] = useState({
    appTitle: initialSettings?.app_title || 'フットサルチーム管理',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleUpdateTitle = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/settings/update-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appTitle: formData.appTitle }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '更新に失敗しました')
      }

      setMessage('アプリタイトルを更新しました')
      router.refresh()
    } catch (error: any) {
      setMessage(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage('')

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage('新しいパスワードが一致しません')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/settings/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '更新に失敗しました')
      }

      setMessage('チーム共通パスワードを更新しました')
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error: any) {
      setMessage(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/">
        <Button variant="ghost">
          <ArrowLeft className="w-4 h-4 mr-2" />
          戻る
        </Button>
      </Link>

      {/* アプリタイトル設定 */}
      <Card>
        <CardHeader>
          <CardTitle>アプリタイトル</CardTitle>
          <CardDescription>
            アプリの表示名を変更できます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateTitle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appTitle">アプリ名</Label>
              <Input
                id="appTitle"
                name="appTitle"
                type="text"
                placeholder="例: ○○FCフットサル"
                value={formData.appTitle}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="transition-all active:scale-95">
              {isLoading ? '更新中...' : 'タイトルを更新'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* チーム共通パスワード変更 */}
      <Card>
        <CardHeader>
          <CardTitle>チーム共通パスワード</CardTitle>
          <CardDescription>
            ログイン時に使用するチーム共通のパスワードを変更できます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">現在のパスワード</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新しいパスワード</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="transition-all active:scale-95">
              {isLoading ? '更新中...' : 'パスワードを更新'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {message && (
        <div className={`p-4 rounded-md ${message.includes('更新しました') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
