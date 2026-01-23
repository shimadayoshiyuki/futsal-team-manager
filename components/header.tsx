'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, Plus, User, Settings } from 'lucide-react'

interface HeaderProps {
  user: {
    display_name: string
    jersey_number: number | null
    is_admin: boolean
  }
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl">⚽</span>
            <h1 className="text-xl font-bold text-gray-900">
              フットサルチーム管理
            </h1>
          </Link>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <User className="w-4 h-4" />
              <span className="font-medium">
                {user.display_name}
                {user.jersey_number !== null && (
                  <span className="ml-1 text-blue-600">#{user.jersey_number}</span>
                )}
              </span>
            </div>
            
            {user.is_admin && (
              <>
                <Link href="/events/create">
                  <Button size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">イベント作成</span>
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">設定</span>
                  </Button>
                </Link>
              </>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ログアウト</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
