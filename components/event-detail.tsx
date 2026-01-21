'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar, MapPin, Users, DollarSign, Clock, UserPlus, Trash2 } from 'lucide-react'

interface Event {
  id: string
  title: string
  description: string | null
  location: string
  start_time: string
  end_time: string
  max_participants: number | null
  participation_fee: number
  guest_count: number
  attending_count: number
  not_attending_count: number
  undecided_count: number
  total_participants: number
}

interface Attendance {
  id: string
  event_id: string
  user_id: string
  status: 'attending' | 'not_attending' | 'undecided'
  comment: string | null
  users: {
    display_name: string
    jersey_number: number | null
  }
}

interface EventDetailProps {
  event: Event
  attendances: Attendance[]
  myAttendance: Attendance | null
  userId: string
  isAdmin: boolean
}

export default function EventDetail({ event, attendances, myAttendance, userId, isAdmin }: EventDetailProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  const [comment, setComment] = useState(myAttendance?.comment || '')
  const [guestCount, setGuestCount] = useState(event.guest_count.toString())
  const [isEditingGuest, setIsEditingGuest] = useState(false)

  const handleAttendance = async (status: 'attending' | 'not_attending' | 'undecided') => {
    setIsLoading(true)

    try {
      if (myAttendance) {
        // 更新
        const { error } = await supabase
          .from('attendances')
          .update({ status, comment: comment || null })
          .eq('id', myAttendance.id)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase
          .from('attendances')
          .insert({
            event_id: event.id,
            user_id: userId,
            status,
            comment: comment || null,
          })

        if (error) throw error
      }

      router.refresh()
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateGuestCount = async () => {
    setIsLoading(true)

    try {
      const { error } = await supabase
        .from('events')
        .update({ guest_count: parseInt(guestCount) || 0 })
        .eq('id', event.id)

      if (error) throw error

      setIsEditingGuest(false)
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteEvent = async () => {
    if (!confirm('本当にこのイベントを削除しますか？')) return

    setIsLoading(true)

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id)

      if (error) throw error

      router.push('/')
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const currentStatus = myAttendance?.status

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-3xl">{event.title}</CardTitle>
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteEvent}
                disabled={isLoading}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                削除
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start text-gray-700">
              <Calendar className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
              <span className="font-medium">
                {format(new Date(event.start_time), 'yyyy年M月d日(E)', { locale: ja })}
              </span>
            </div>

            <div className="flex items-start text-gray-700">
              <Clock className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
              <span>
                {format(new Date(event.start_time), 'HH:mm', { locale: ja })} - {format(new Date(event.end_time), 'HH:mm', { locale: ja })}
              </span>
            </div>

            <div className="flex items-start text-gray-700">
              <MapPin className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
              <span>{event.location}</span>
            </div>

            <div className="flex items-start text-gray-700">
              <Users className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-green-600 text-lg">
                  {event.total_participants}人
                </span>
                {event.max_participants && (
                  <span className="text-gray-500 ml-1">/ {event.max_participants}人</span>
                )}
                <div className="text-sm text-gray-500 mt-1">
                  参加: {event.attending_count}人 / 不参加: {event.not_attending_count}人 / 未定: {event.undecided_count}人
                </div>
              </div>
            </div>

            {event.participation_fee > 0 && (
              <div className="flex items-start text-gray-700">
                <DollarSign className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span>¥{event.participation_fee}</span>
              </div>
            )}

            {event.description && (
              <div className="pt-3 border-t">
                <p className="text-gray-600 whitespace-pre-wrap">{event.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 助っ人（ゲスト）管理 */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <UserPlus className="w-5 h-5 mr-2" />
              助っ人（ゲスト）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditingGuest ? (
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                  min="0"
                  disabled={isLoading}
                  className="w-24"
                />
                <span>人</span>
                <Button
                  size="sm"
                  onClick={handleUpdateGuestCount}
                  disabled={isLoading}
                >
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditingGuest(false)
                    setGuestCount(event.guest_count.toString())
                  }}
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">
                  {event.guest_count}人
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditingGuest(true)}
                >
                  編集
                </Button>
              </div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              アプリに登録していない助っ人の人数を追加できます
            </p>
          </CardContent>
        </Card>
      )}

      {/* 出欠登録 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">出欠登録</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={currentStatus === 'attending' ? 'default' : 'outline'}
              onClick={() => handleAttendance('attending')}
              disabled={isLoading}
              className="h-16 text-base font-semibold"
            >
              参加
            </Button>
            <Button
              variant={currentStatus === 'not_attending' ? 'destructive' : 'outline'}
              onClick={() => handleAttendance('not_attending')}
              disabled={isLoading}
              className="h-16 text-base font-semibold"
            >
              不参加
            </Button>
            <Button
              variant={currentStatus === 'undecided' ? 'secondary' : 'outline'}
              onClick={() => handleAttendance('undecided')}
              disabled={isLoading}
              className="h-16 text-base font-semibold"
            >
              未定
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">コメント（任意）</Label>
            <Textarea
              id="comment"
              placeholder="例: 少し遅れて行きます"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isLoading}
              rows={2}
            />
            <p className="text-xs text-gray-500">
              コメントを変更した場合は、上の出欠ボタンを押して保存してください
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 参加者一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">参加者一覧（{event.attending_count}人）</CardTitle>
        </CardHeader>
        <CardContent>
          {attendances.length === 0 ? (
            <p className="text-gray-500 text-center py-4">まだ参加者がいません</p>
          ) : (
            <div className="space-y-3">
              {attendances.map((attendance) => (
                <div
                  key={attendance.id}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {attendance.users.display_name}
                      {attendance.users.jersey_number !== null && (
                        <span className="ml-2 text-blue-600">
                          #{attendance.users.jersey_number}
                        </span>
                      )}
                    </div>
                    {attendance.comment && (
                      <p className="text-sm text-gray-600 mt-1">
                        {attendance.comment}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
