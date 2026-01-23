'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar, List } from 'lucide-react'
import EventList from '@/components/event-list'
import EventCalendar from '@/components/event-calendar'

interface DashboardViewProps {
  events: any[]
  myAttendances: any[]
  allAttendances: any[]
  isAdmin: boolean
}

export default function DashboardView({ events, myAttendances, allAttendances, isAdmin }: DashboardViewProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')

  return (
    <div className="space-y-4">
      {/* ビュー切り替えボタン */}
      <div className="flex justify-end gap-2">
        <Button
          variant={viewMode === 'calendar' ? 'default' : 'outline'}
          onClick={() => setViewMode('calendar')}
          className="flex items-center gap-2"
        >
          <Calendar className="w-4 h-4" />
          カレンダー
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          onClick={() => setViewMode('list')}
          className="flex items-center gap-2"
        >
          <List className="w-4 h-4" />
          リスト
        </Button>
      </div>

      {/* ビュー表示 */}
      {viewMode === 'calendar' ? (
        <EventCalendar events={events} myAttendances={myAttendances} />
      ) : (
        <EventList events={events} myAttendances={myAttendances} allAttendances={allAttendances} isAdmin={isAdmin} />
      )}
    </div>
  )
}
