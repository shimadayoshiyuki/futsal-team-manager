'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function CreateEventPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    start_date: '',
    start_time: '',
    end_time: '',
    max_participants: '',
    participation_fee: '0',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ユーザーが見つかりません')

      // 日時の結合（日本時間として扱う）
      const startDateTime = `${formData.start_date}T${formData.start_time}:00+09:00`
      const endDateTime = `${formData.start_date}T${formData.end_time}:00+09:00`

      const { error: insertError } = await supabase
        .from('events')
        .insert({
          title: formData.title,
          description: formData.description || null,
          location: formData.location,
          start_time: startDateTime,
          end_time: endDateTime,
          max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
          participation_fee: parseInt(formData.participation_fee) || 0,
          created_by: user.id,
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">イベント作成</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">
                  タイトル<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  placeholder="例: 週末フットサル練習"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">備考</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="例: 初心者歓迎！動きやすい服装でお越しください"
                  value={formData.description}
                  onChange={handleChange}
                  disabled={isLoading}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">
                  場所<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="location"
                  name="location"
                  type="text"
                  placeholder="例: 〇〇体育館"
                  value={formData.location}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">
                    日付<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_time">
                    開始時刻<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    value={formData.start_time}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time">
                  終了時刻<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="end_time"
                  name="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_participants">募集人数（任意）</Label>
                  <Input
                    id="max_participants"
                    name="max_participants"
                    type="number"
                    placeholder="無制限"
                    value={formData.max_participants}
                    onChange={handleChange}
                    disabled={isLoading}
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="participation_fee">参加費（円）</Label>
                  <Input
                    id="participation_fee"
                    name="participation_fee"
                    type="number"
                    placeholder="0"
                    value={formData.participation_fee}
                    onChange={handleChange}
                    disabled={isLoading}
                    min="0"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '作成中...' : 'イベントを作成'}
              </Button>

              {error && (
                <p className="text-sm text-center text-red-600">{error}</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
