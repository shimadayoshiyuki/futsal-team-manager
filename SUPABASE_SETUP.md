# Supabase セットアップガイド

このドキュメントでは、フットサルチーム管理アプリのSupabaseセットアップ手順を説明します。

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/) にアクセスし、アカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクト名: `futsal-team-manager`（任意）
4. データベースパスワードを設定（安全な場所に保管）
5. リージョンを選択（日本の場合: Northeast Asia (Tokyo)）

## 2. データベーススキーマの適用

1. Supabaseダッシュボードで「SQL Editor」を開く
2. `supabase-schema.sql` の内容をコピー＆ペースト
3. 「Run」をクリックしてSQLを実行
4. エラーがないことを確認

## 3. 認証設定

### Email認証の有効化
1. 「Authentication」→「Providers」を開く
2. 「Email」が有効になっていることを確認
3. 「Confirm email」をONに設定（メール確認必須）

### リダイレクトURL設定
1. 「Authentication」→「URL Configuration」を開く
2. 「Redirect URLs」に以下を追加:
   - `http://localhost:3000/auth/callback` （開発環境）
   - `https://your-domain.com/auth/callback` （本番環境）

## 4. API認証情報の取得

1. 「Settings」→「API」を開く
2. 以下の情報をコピー:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...`
   
3. `.env.local` ファイルを作成し、以下を記述:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

## 5. 初期管理者の設定

最初のユーザーを管理者にする方法:

### 方法1: SQLで直接設定
1. Supabaseダッシュボードの「SQL Editor」を開く
2. 以下のSQLを実行（メールアドレスを実際のものに変更）:

```sql
-- まず、auth.usersテーブルでユーザーIDを確認
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- 上記で取得したIDを使ってusersテーブルを更新
UPDATE public.users 
SET is_admin = TRUE 
WHERE email = 'your-email@example.com';
```

### 方法2: Supabase Functionsを使用
後述のWebhookで自動設定（推奨）

## 6. Row Level Security (RLS) の確認

すべてのテーブルでRLSが有効になっていることを確認:

```sql
-- RLS有効化の確認
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

すべてのテーブルで `rowsecurity` が `true` になっていればOK。

## 7. LINE Notify設定（オプション）

### LINE Notifyトークンの取得
1. [LINE Notify](https://notify-bot.line.me/) にアクセス
2. 「マイページ」→「トークンを発行する」
3. トークン名: `フットサルチーム管理`
4. 通知先のグループを選択
5. トークンをコピー（再表示不可なので注意）

### 環境変数に追加
`.env.local` に以下を追加:

```env
LINE_NOTIFY_TOKEN=your_line_notify_token_here
```

## 8. Webhook設定（Supabase Edge Functions）

イベント作成時とリマインド通知のWebhookを設定します。

### Edge Functionのデプロイ準備
```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
```

### Functionのデプロイ
```bash
supabase functions deploy line-notify
```

### Database Webhookの設定
Supabaseダッシュボードで「Database」→「Webhooks」を開き、以下を設定:

1. **イベント作成時の通知**
   - Name: `notify-event-created`
   - Table: `events`
   - Events: `INSERT`
   - Type: `http`
   - Method: `POST`
   - URL: `https://your-project.supabase.co/functions/v1/line-notify`

## トラブルシューティング

### RLSエラーが発生する場合
- ポリシーが正しく設定されているか確認
- `auth.uid()` が正しく取得できているか確認

### 認証がうまくいかない場合
- `.env.local` のURLとキーが正しいか確認
- リダイレクトURLが正しく設定されているか確認

### 管理者権限が付与されない場合
- `users` テーブルの `is_admin` カラムを直接確認
- RLSポリシーが正しく設定されているか確認
