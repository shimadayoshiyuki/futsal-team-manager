'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale/ja'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, MapPin, Users, DollarSign, Clock } from 'lucide-react'

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
  event_id: string
  status: 'attending' | 'not_attending' | 'undecided'
  comment: string | null
}

interface EventListProps {
  events: Event[]
  myAttendances: Attendance[]
  isAdmin: boolean
}

const getStatusBadge = (status: Attendance['status']) => {
  switch (status) {
    case 'attending':
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          参加
        </span>
      )
    case 'not_attending':
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
          不参加
        </span>
      )
    case 'undecided':
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
          未定
        </span>
      )
  }
}

export default function EventList({ events, myAttendances, isAdmin }: EventListProps) {
  const getMyStatus = (eventId: string) => {
    return myAttendances.find(a => a.event_id === eventId)
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">今後の予定はありません</p>
        {isAdmin && (
          <Link href="/events/create" className="text-blue-600 hover:underline mt-2 inline-block">
            イベントを作成する
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">今後の予定</h2>
      
      {events.map((event) => {
        const myStatus = getMyStatus(event.id)
        const isFull = event.max_participants && event.total_participants >= event.max_participants
        
        return (
          <Link key={event.id} href={`/events/${event.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-xl">{event.title}</CardTitle>
                  {myStatus ? (
                    getStatusBadge(myStatus.status)
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                      未回答
                    </span>
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>
                      {format(new Date(event.start_time), 'M月d日(E) HH:mm', { locale: ja })}
                    </span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <Clock className="w-4 h-4 mr-2" />
                    <span>
                      {format(new Date(event.start_time), 'HH:mm', { locale: ja })} - {format(new Date(event.end_time), 'HH:mm', { locale: ja })}
                    </span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>{event.location}</span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center text-sm">
                        <Users className="w-4 h-4 mr-1 text-green-600" />
                        <span className="font-semibold text-green-600">
                          {event.total_participants}
                        </span>
                        {event.max_participants && (
                          <span className="text-gray-500 ml-1">/ {event.max_participants}人</span>
                        )}
                      </div>
                      
                      {event.participation_fee > 0 && (
                        <div className="flex items-center text-sm text-gray-600">
                          <DollarSign className="w-4 h-4 mr-1" />
                          <span>¥{event.participation_fee}</span>
                        </div>
                      )}
                    </div>
                    
                    {isFull && (
                      <span className="text-sm font-medium text-red-600">
                        満員
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
