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
import { Calendar, MapPin, Users, DollarSign, Clock, UserPlus, Trash2, Edit } from 'lucide-react'

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

interface EventGuest {
  id: string
  event_id: string
  user_id: string
  guest_count: number
  comment: string | null
  users: {
    display_name: string
    jersey_number: number | null
  }
}

interface EventDetailProps {
  event: Event
  attendances: Attendance[]
  eventGuests: EventGuest[]
  myAttendance: Attendance | null
  userId: string
  isAdmin: boolean
}

export default function EventDetail({ event, attendances, eventGuests, myAttendance, userId, isAdmin }: EventDetailProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(false)
  const [comment, setComment] = useState(myAttendance?.comment || '')

  // ゲスト追加・編集用State
  const [guestCount, setGuestCount] = useState('1')
  const [guestComment, setGuestComment] = useState('')
  const [isAddingGuest, setIsAddingGuest] = useState(false)
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null)

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

      // 少し遅延させてからローディング解除（視覚的フィードバック）
      setTimeout(() => {
        setIsLoading(false)
      }, 300)
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
      setIsLoading(false)
    }
  }

  const handleSaveGuest = async () => {
    if (parseInt(guestCount) < 1) {
      alert('助っ人は1人以上を指定してください')
      return
    }

    setIsLoading(true)

    try {
      if (editingGuestId) {
        // 更新
        const { error } = await supabase
          .from('event_guests')
          .update({
            guest_count: parseInt(guestCount),
            comment: guestComment || null
          })
          .eq('id', editingGuestId)

        if (error) throw error
      } else {
        // 新規追加
        const { error } = await supabase
          .from('event_guests')
          .insert({
            event_id: event.id,
            user_id: userId,
            guest_count: parseInt(guestCount),
            comment: guestComment || null
          })

        if (error) throw error
      }

      setIsAddingGuest(false)
      setEditingGuestId(null)
      setGuestCount('1')
      setGuestComment('')
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteGuest = async (guestId: string) => {
    if (!confirm('この助っ人情報を削除しますか？')) return

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('event_guests')
        .delete()
        .eq('id', guestId)

      if (error) throw error

      router.refresh()
    } catch (error: any) {
      alert(error.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const startEditGuest = (guest: EventGuest) => {
    setEditingGuestId(guest.id)
    setGuestCount(guest.guest_count.toString())
    setGuestComment(guest.comment || '')
    setIsAddingGuest(true)
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/events/${event.id}/edit`)}
                  disabled={isLoading}
                  className="transition-all active:scale-95"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  編集
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteEvent}
                  disabled={isLoading}
                  className="transition-all active:scale-95"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isLoading ? '削除中...' : '削除'}
                </Button>
              </div>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg flex items-center">
            <UserPlus className="w-5 h-5 mr-2" />
            助っ人（ゲスト）
            <span className="ml-2 text-sm font-normal text-gray-500">
              計 {event.guest_count}人
            </span>
          </CardTitle>
          {!isAddingGuest && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingGuestId(null)
                setGuestCount('1')
                setGuestComment('')
                setIsAddingGuest(true)
              }}
              disabled={isLoading}
              className="transition-all active:scale-95 text-sm h-9 px-3"
            >
              追加する
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4 pt-2">
            {/* 入力フォーム */}
            {isAddingGuest && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3 mb-4">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="guestCount" className="whitespace-nowrap">人数</Label>
                  <Input
                    id="guestCount"
                    type="number"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    min="1"
                    disabled={isLoading}
                    className="w-24 bg-white"
                  />
                  <span>人</span>
                </div>
                <div>
                  <Label htmlFor="guestComment" className="text-sm">メモ・名前など（任意）</Label>
                  <Input
                    id="guestComment"
                    value={guestComment}
                    onChange={(e) => setGuestComment(e.target.value)}
                    placeholder="例: 佐藤の友人"
                    disabled={isLoading}
                    className="bg-white mt-1"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingGuest(false)
                      setEditingGuestId(null)
                    }}
                    disabled={isLoading}
                    className="transition-all active:scale-95 bg-white text-sm h-8 px-3"
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleSaveGuest}
                    disabled={isLoading}
                    className="transition-all active:scale-95 text-sm h-8 px-3"
                  >
                    {isLoading ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            )}

            {/* ゲスト一覧リスト */}
            {eventGuests.length === 0 ? (
              <p className="text-sm text-gray-500">登録されている助っ人はいません</p>
            ) : (
              <div className="space-y-2">
                {eventGuests.map((guest) => {
                  const canEdit = isAdmin || guest.user_id === userId
                  return (
                    <div
                      key={guest.id}
                      className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <div>
                        <div className="font-medium text-gray-900 flex items-center">
                          <span className="text-blue-600 mr-2">{guest.guest_count}人</span>
                          <span className="text-sm text-gray-500 font-normal">
                            (登録: {guest.users?.display_name})
                          </span>
                        </div>
                        {guest.comment && (
                          <p className="text-sm text-gray-600 mt-1">
                            {guest.comment}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-gray-500"
                            onClick={() => startEditGuest(guest)}
                            disabled={isLoading}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteGuest(guest.id)}
                            disabled={isLoading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 出欠登録 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">出欠登録</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={(currentStatus === 'attending' ? 'default' : 'outline') as any}
              onClick={() => handleAttendance('attending')}
              disabled={isLoading}
              className="h-16 text-base font-semibold transition-all active:scale-95 active:opacity-80"
            >
              {isLoading ? '登録中...' : '参加'}
            </Button>
            <Button
              variant={(currentStatus === 'not_attending' ? 'destructive' : 'outline') as any}
              onClick={() => handleAttendance('not_attending')}
              disabled={isLoading}
              className="h-16 text-base font-semibold transition-all active:scale-95 active:opacity-80"
            >
              {isLoading ? '登録中...' : '不参加'}
            </Button>
            <Button
              variant={(currentStatus === 'undecided' ? 'secondary' : 'outline') as any}
              onClick={() => handleAttendance('undecided')}
              disabled={isLoading}
              className="h-16 text-base font-semibold transition-all active:scale-95 active:opacity-80"
            >
              {isLoading ? '登録中...' : '未定'}
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

      {/* 出欠確認セクション */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">出欠確認</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 参加者一覧 */}
          <div>
            <h3 className="font-semibold text-green-700 mb-3 flex items-center">
              <span className="bg-green-100 px-3 py-1 rounded-full text-sm">
                参加（{event.attending_count}人）
              </span>
            </h3>
            {attendances.filter(a => a.status === 'attending').length === 0 ? (
              <p className="text-gray-400 text-sm ml-4">まだ参加者がいません</p>
            ) : (
              <div className="space-y-2">
                {attendances.filter(a => a.status === 'attending').map((attendance) => (
                  <div
                    key={attendance.id}
                    className="flex items-start justify-between p-3 bg-green-50 rounded-lg border border-green-100"
                  >
                    <div>
                      <div className="font-medium text-green-900">
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
          </div>

          {/* 不参加者一覧 */}
          <div>
            <h3 className="font-semibold text-red-700 mb-3 flex items-center">
              <span className="bg-red-100 px-3 py-1 rounded-full text-sm">
                不参加（{event.not_attending_count}人）
              </span>
            </h3>
            {attendances.filter(a => a.status === 'not_attending').length === 0 ? (
              <p className="text-gray-400 text-sm ml-4">不参加者はいません</p>
            ) : (
              <div className="space-y-2">
                {attendances.filter(a => a.status === 'not_attending').map((attendance) => (
                  <div
                    key={attendance.id}
                    className="flex items-start justify-between p-3 bg-red-50 rounded-lg border border-red-100"
                  >
                    <div>
                      <div className="font-medium text-red-900">
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
          </div>

          {/* 未定者一覧 */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
              <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                未定（{event.undecided_count}人）
              </span>
            </h3>
            {attendances.filter(a => a.status === 'undecided').length === 0 ? (
              <p className="text-gray-400 text-sm ml-4">未定の人はいません</p>
            ) : (
              <div className="space-y-2">
                {attendances.filter(a => a.status === 'undecided').map((attendance) => (
                  <div
                    key={attendance.id}
                    className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
