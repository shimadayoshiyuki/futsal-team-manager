'use client'

import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const locales = {
  ja: ja,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

interface EventCalendarProps {
  events: any[]
  myAttendances: any[]
}

export default function EventCalendar({ events, myAttendances }: EventCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())

  // イベントをカレンダー形式に変換
  const calendarEvents = useMemo(() => {
    return events.map((event) => {
      const myStatus = myAttendances.find((a) => a.event_id === event.id)?.status || 'undecided'
      
      // ステータスに応じた色
      const color = 
        myStatus === 'attending' ? '#10b981' : // 緑
        myStatus === 'not_attending' ? '#ef4444' : // 赤
        '#f59e0b' // 黄色（未定）

      return {
        id: event.id,
        title: `${event.title} (${event.attending_count + event.guest_count}/${event.max_participants || '∞'})`,
        start: new Date(event.start_time),
        end: new Date(event.end_time),
        resource: {
          ...event,
          myStatus,
          color,
        },
      }
    })
  }, [events, myAttendances])

  const handleSelectEvent = (event: any) => {
    router.push(`/events/${event.id}`)
  }

  const eventStyleGetter = (event: any) => {
    return {
      style: {
        backgroundColor: event.resource.color,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    }
  }

  const messages = {
    today: '今日',
    previous: '前',
    next: '次',
    month: '月',
    week: '週',
    day: '日',
    agenda: '予定表',
    date: '日付',
    time: '時間',
    event: 'イベント',
    noEventsInRange: 'この期間にイベントはありません',
    showMore: (total: number) => `+${total} 件`,
  }

  return (
    <div className="bg-white rounded-lg shadow p-4" style={{ height: '700px' }}>
      <Calendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventStyleGetter}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        messages={messages}
        culture="ja"
        popup
      />
      
      <div className="mt-4 flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500"></div>
          <span>参加</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500"></div>
          <span>不参加</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500"></div>
          <span>未定</span>
        </div>
      </div>
    </div>
  )
}
