'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Copy } from 'lucide-react'
import Link from 'next/link'

interface PastEvent {
  id: string
  title: string
  description: string | null
  location: string
  start_time: string
  end_time: string
  max_participants: number | null
  participation_fee: number
}

const EMPTY_FORM = {
  title: '',
  description: '',
  location: '',
  start_date: '',
  start_time: '',
  end_time: '',
  max_participants: '',
  participation_fee: '0',
}

// DBはUTCのtimestamptz、保存時は+09:00固定（handleSubmit参照）なので、
// 取り出す側も日本時間で固定して端末のタイムゾーンに引きずられないようにする
const JST = 'Asia/Tokyo'

const toJstTimeValue = (isoString: string) =>
  new Date(isoString).toLocaleTimeString('sv-SE', {
    timeZone: JST,
    hour: '2-digit',
    minute: '2-digit',
  })

const formatPastEventLabel = (event: PastEvent) => {
  const date = new Date(event.start_time).toLocaleDateString('ja-JP', {
    timeZone: JST,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
  return `${date} ${toJstTimeValue(event.start_time)} ${event.title} / ${event.location}`
}

export default function CreateEventPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [pastEvents, setPastEvents] = useState<PastEvent[]>([])
  const [sourceEventId, setSourceEventId] = useState('')

  const [formData, setFormData] = useState(EMPTY_FORM)

  useEffect(() => {
    const fetchPastEvents = async () => {
      // events の RLS は authenticated 限定。イベント作成自体が管理アカウント
      // （Supabase Auth）でのログインを前提としているため、ここも同じ前提で引く
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, location, start_time, end_time, max_participants, participation_fee')
        .order('start_time', { ascending: false })
        .limit(20)

      // 複製はあくまで補助機能なので、取得に失敗してもフォーム自体は使えるようにする
      if (!error && data) setPastEvents(data as any)
    }

    fetchPastEvents()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const eventId = e.target.value
    setSourceEventId(eventId)

    if (!eventId) return

    const source = pastEvents.find(event => event.id === eventId)
    if (!source) return

    // 日付だけは意図的に空のままにする（過去の日付のまま登録される事故を防ぐ）
    setFormData({
      title: source.title,
      description: source.description || '',
      location: source.location,
      start_date: '',
      start_time: toJstTimeValue(source.start_time),
      end_time: toJstTimeValue(source.end_time),
      max_participants: source.max_participants?.toString() || '',
      participation_fee: source.participation_fee?.toString() || '0',
    })
  }

  const handleClear = () => {
    setSourceEventId('')
    setFormData(EMPTY_FORM)
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

      const { data: newEvent, error: insertError } = await supabase
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
        } as any)
        .select()
        .single()

      if (insertError) throw insertError

      // LINE NotifyのAPIを呼び出して通知を送信
      if (newEvent) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              eventId: (newEvent as any).id,
              type: 'event_created',
            }),
          })
        } catch (notifyError) {
          console.error('LINE通知の送信に失敗しました:', notifyError)
        }
      }

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
              {pastEvents.length > 0 && (
                <div className="space-y-2 rounded-lg bg-gray-50 border p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="source_event" className="flex items-center gap-1.5">
                      <Copy className="w-4 h-4 text-gray-500" />
                      過去の予定から複製（任意）
                    </Label>
                    {sourceEventId && (
                      <button
                        type="button"
                        onClick={handleClear}
                        disabled={isLoading}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        入力をクリア
                      </button>
                    )}
                  </div>
                  <select
                    id="source_event"
                    value={sourceEventId}
                    onChange={handleSourceChange}
                    disabled={isLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">選択しない（新規作成）</option>
                    {pastEvents.map(event => (
                      <option key={event.id} value={event.id}>
                        {formatPastEventLabel(event)}
                      </option>
                    ))}
                  </select>
                  {sourceEventId && (
                    <p className="text-xs text-gray-600">
                      内容を引き継ぎました。日付を入力してください。
                    </p>
                  )}
                </div>
              )}

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

              <Button type="submit" className="w-full transition-all active:scale-95" disabled={isLoading}>
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
