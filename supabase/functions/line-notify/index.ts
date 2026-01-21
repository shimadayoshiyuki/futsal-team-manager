// Supabase Edge Function for LINE Notify Webhook
// This function is triggered by database webhooks when events are created

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record } = await req.json()
    
    // イベント作成時のみ通知
    if (!record || !record.id) {
      throw new Error('Invalid webhook payload')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // イベント情報を取得
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('*')
      .eq('id', record.id)
      .single()

    if (eventError || !event) {
      throw new Error('Event not found')
    }

    // LINE Notify トークン
    const lineNotifyToken = Deno.env.get('LINE_NOTIFY_TOKEN')
    
    if (!lineNotifyToken) {
      console.error('LINE_NOTIFY_TOKEN is not set')
      throw new Error('LINE Notify token not configured')
    }

    // メッセージの構築
    const startDate = new Date(event.start_time)
    const message = `\n⚽ 新しいイベントが作成されました！\n\n📅 ${event.title}\n📍 ${event.location}\n🕐 ${startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} ${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}\n\n出欠登録をお願いします！`

    // LINE Notify API呼び出し
    const lineResponse = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lineNotifyToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `message=${encodeURIComponent(message)}`,
    })

    if (!lineResponse.ok) {
      throw new Error('LINE Notify API request failed')
    }

    // 通知履歴を保存
    await supabaseClient.from('notifications').insert({
      event_id: event.id,
      notification_type: 'event_created',
      status: 'sent',
    })

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
