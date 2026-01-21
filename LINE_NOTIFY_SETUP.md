# LINE Notify 通知機能

このドキュメントでは、LINE Notify通知機能のセットアップと使用方法を説明します。

## 概要

このアプリは以下のタイミングでLINE Notifyを使用してグループに通知を送信します：

1. **イベント作成時**: 新しいイベントが作成されたとき
2. **前日リマインダー**: イベント前日に自動通知（Cron設定が必要）

## セットアップ

### 1. LINE Notifyトークンの取得

1. [LINE Notify](https://notify-bot.line.me/) にアクセス
2. 「マイページ」→「トークンを発行する」をクリック
3. トークン名: 「フットサルチーム管理」（任意）
4. 通知先のグループを選択
5. 「発行する」をクリック
6. **トークンをコピー**（再表示できないので注意）

### 2. 環境変数の設定

#### Next.jsアプリ（本番環境）

Vercelにデプロイする場合:

1. Vercelダッシュボードの「Settings」→「Environment Variables」を開く
2. 以下の環境変数を追加:
   - Name: `LINE_NOTIFY_TOKEN`
   - Value: 取得したトークン
   - Environment: Production, Preview, Development

#### ローカル開発環境

`.env.local` ファイルに以下を追加:

```env
LINE_NOTIFY_TOKEN=your_line_notify_token_here
```

#### Supabase Edge Functions（オプション）

Supabase Edge Functionsを使用する場合:

```bash
supabase secrets set LINE_NOTIFY_TOKEN=your_line_notify_token_here
```

## 実装方法

### 方法1: Next.js API Route（推奨）

イベント作成時に自動的に通知を送信します。

**実装済み:**
- `/app/api/notify/route.ts` - LINE Notify API呼び出し
- イベント作成後に手動またはクライアントサイドから呼び出し可能

**使用例:**

```typescript
// イベント作成後にクライアントサイドから呼び出し
await fetch('/api/notify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    eventId: newEventId,
    type: 'event_created',
  }),
})
```

### 方法2: Supabase Webhook + Edge Functions

データベースのトリガーで自動通知を送信します。

#### Edge Functionのデプロイ

```bash
# Supabase CLIのインストール（未インストールの場合）
npm install -g supabase

# Supabaseにログイン
supabase login

# プロジェクトにリンク
supabase link --project-ref your-project-ref

# シークレットの設定
supabase secrets set LINE_NOTIFY_TOKEN=your_token_here

# Functionをデプロイ
supabase functions deploy line-notify
```

#### Database Webhookの設定

Supabaseダッシュボード:

1. 「Database」→「Webhooks」を開く
2. 「Create a new hook」をクリック
3. 以下を設定:
   - **Name**: `notify-event-created`
   - **Table**: `events`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://your-project.supabase.co/functions/v1/line-notify`
   - **HTTP Headers**: 
     - Key: `Authorization`
     - Value: `Bearer YOUR_SUPABASE_ANON_KEY`

## 前日リマインダーの実装

前日リマインダーを実装するには、以下のいずれかの方法を使用します:

### オプション1: Vercel Cron Jobs

`vercel.json` を作成:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminder",
      "schedule": "0 20 * * *"
    }
  ]
}
```

`/app/api/cron/reminder/route.ts` を作成:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  // Vercel Cron Secretの検証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // 明日のイベントを取得
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  
  const dayAfterTomorrow = new Date(tomorrow)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', tomorrow.toISOString())
    .lt('start_time', dayAfterTomorrow.toISOString())

  // 各イベントに対して通知を送信
  for (const event of events || []) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: event.id,
        type: 'reminder',
      }),
    })
  }

  return NextResponse.json({ success: true })
}
```

### オプション2: Supabase Cron (pg_cron)

Supabaseダッシュボードの SQL Editorで実行:

```sql
-- pg_cron拡張を有効化
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 毎日20時に実行するジョブを作成
SELECT cron.schedule(
  'send-event-reminders',
  '0 20 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-app.vercel.app/api/notify',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
        'eventId', id,
        'type', 'reminder'
      )::text
    )
  FROM events
  WHERE start_time::date = CURRENT_DATE + INTERVAL '1 day';
  $$
);
```

## トラブルシューティング

### 通知が送信されない場合

1. **トークンの確認**:
   ```bash
   # トークンが正しく設定されているか確認
   echo $LINE_NOTIFY_TOKEN
   ```

2. **通知履歴の確認**:
   Supabaseダッシュボードで `notifications` テーブルを確認

3. **ログの確認**:
   - Vercel: Functionログを確認
   - Supabase: Edge Functionログを確認

### LINE Notify APIエラー

- **401 Unauthorized**: トークンが無効または期限切れ
- **400 Bad Request**: メッセージフォーマットが不正

## メッセージのカスタマイズ

`/app/api/notify/route.ts` でメッセージを編集できます:

```typescript
const message = type === 'event_created'
  ? `カスタムメッセージ: ${event.title}...`
  : `リマインダーメッセージ: ${event.title}...`
```

## セキュリティ注意事項

- **トークンを公開しない**: `.env.local` を `.gitignore` に追加
- **Cron Secretの使用**: Vercel Cron Jobsには認証を追加
- **Rate Limit**: LINE Notify APIには時間あたりの送信制限があります
