# フットサルチーム管理アプリ ⚽

フットサルチームのスケジュール共有・出欠管理を簡単に行えるWebアプリケーションです。

## 🌐 本番環境

- **アプリURL**: https://futsal-team-manager-kappa.vercel.app
- **GitHubリポジトリ**: https://github.com/shimadayoshiyuki/futsal-team-manager

## ✅ ログイン方法

### パスワードログイン（推奨）

1. https://futsal-team-manager-kappa.vercel.app/auth/login にアクセス
2. 「パスワードでログイン」をクリック
3. メールアドレスとパスワードを入力
4. 「ログイン」をクリック

### メールリンクログイン

1. ログインページでメールアドレスを入力
2. 「ログインリンクを送信」をクリック
3. 受信したメールのリンクをクリック（5分以内）

## 主な機能

### ✅ 実装済み機能

1. **ユーザー認証**
   - メールアドレス + パスワード認証
   - メールリンク認証（Magic Link）
   - 初回ログイン時にニックネームと背番号を登録
   - セキュアなログイン・ログアウト

2. **イベント管理**（管理者のみ）
   - イベントの作成・編集・削除
   - タイトル、日時、場所、参加費、募集人数などを設定
   - 助っ人（ゲスト）人数の手動追加機能

3. **出欠登録**
   - 「参加」「不参加」「未定」の3択
   - コメント機能（例: 「遅れて行きます」）
   - リアルタイムで参加人数を反映

4. **ダッシュボード**
   - 今後のイベント一覧表示
   - 参加人数 / 募集人数の一目表示
   - 自分の回答ステータス表示

5. **イベント詳細**
   - 参加者リスト表示
   - 各参加者のコメント表示
   - リアルタイムな人数集計

6. **LINE Notify通知** ✨
   - イベント作成時の自動通知
   - 前日リマインダー通知（Cron設定が必要）
   - グループ全体への一斉通知

7. **助っ人（ゲスト）管理**
   - アプリ未登録のゲストの人数を追加可能
   - 管理者が手動で人数を調整

## 技術スタック

### Frontend
- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** (アイコン)

### Backend/Database
- **Supabase**
  - Authentication（メール認証）
  - PostgreSQL Database
  - Row Level Security (RLS)
  - Real-time subscriptions

### UI Library
- **shadcn/ui** スタイルのカスタムコンポーネント

### 通知
- **LINE Notify** API

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/shimadayoshiyuki/futsal-team-manager.git
cd futsal-team-manager
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. Supabaseプロジェクトのセットアップ

詳細は [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) を参照してください。

1. [Supabase](https://supabase.com/) でプロジェクトを作成
2. `supabase-schema.sql` を実行してデータベースを構築
3. 認証設定（Email認証を有効化）

### 4. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成:

```bash
cp .env.local.example .env.local
```

以下の環境変数を設定:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
LINE_NOTIFY_TOKEN=your_line_notify_token  # オプション
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

### 6. 初期管理者の設定

最初のユーザーを管理者にする必要があります。

Supabaseダッシュボードの SQL Editor で実行:

```sql
-- 管理者権限を付与
UPDATE public.users 
SET is_admin = TRUE 
WHERE email = 'your-email@example.com';
```

パスワードを設定する場合（パスワードログインを有効にする）:

```sql
-- パスワードを設定
UPDATE auth.users 
SET encrypted_password = crypt('your_password', gen_salt('bf'))
WHERE email = 'your-email@example.com';
```

## LINE Notify 通知の設定

LINE Notifyの設定方法は [LINE_NOTIFY_SETUP.md](./LINE_NOTIFY_SETUP.md) を参照してください。

## デプロイ

### Vercelにデプロイ

1. [Vercel](https://vercel.com/) にログイン
2. プロジェクトをインポート
3. 環境変数を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `LINE_NOTIFY_TOKEN` (オプション)
4. デプロイ

### Netlifyにデプロイ

1. [Netlify](https://www.netlify.com/) にログイン
2. プロジェクトをインポート
3. ビルド設定:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. 環境変数を設定
5. デプロイ

## データベーススキーマ

### users テーブル
- ユーザープロフィール情報
- 表示名、背番号、管理者フラグ

### events テーブル
- イベント情報
- タイトル、日時、場所、参加費、募集人数、助っ人人数

### attendances テーブル
- 出欠情報
- ユーザーID、イベントID、ステータス、コメント

### notifications テーブル
- LINE通知履歴
- イベントID、通知タイプ、ステータス

### event_details ビュー
- イベントと参加人数の集計情報

詳細なスキーマは `supabase-schema.sql` を参照してください。

## プロジェクト構造

```
futsal-team-manager/
├── app/
│   ├── api/
│   │   └── notify/          # LINE Notify API Route
│   ├── auth/
│   │   ├── login/           # ログインページ
│   │   └── callback/        # 認証コールバック
│   ├── events/
│   │   ├── create/          # イベント作成ページ
│   │   └── [id]/            # イベント詳細ページ
│   ├── profile/
│   │   └── setup/           # プロフィール設定
│   ├── layout.tsx           # ルートレイアウト
│   ├── page.tsx             # ダッシュボード
│   └── globals.css          # グローバルスタイル
├── components/
│   ├── ui/                  # UIコンポーネント
│   ├── header.tsx           # ヘッダー
│   ├── event-list.tsx       # イベント一覧
│   └── event-detail.tsx     # イベント詳細
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # クライアントサイド
│   │   ├── server.ts        # サーバーサイド
│   │   └── middleware.ts    # ミドルウェア
│   └── utils.ts             # ユーティリティ
├── types/
│   └── database.types.ts    # 型定義
├── supabase/
│   └── functions/           # Edge Functions
├── supabase-schema.sql      # データベーススキーマ
├── SUPABASE_SETUP.md        # Supabase設定ガイド
├── LINE_NOTIFY_SETUP.md     # LINE Notify設定ガイド
└── README.md
```

## 使い方

### 一般ユーザー

1. **初回登録**
   - メールアドレスでログイン
   - ニックネームと背番号を登録

2. **イベント確認**
   - ダッシュボードで今後のイベントを確認
   - イベントをクリックして詳細を表示

3. **出欠登録**
   - イベント詳細ページで「参加」「不参加」「未定」を選択
   - 必要に応じてコメントを追加

### 管理者

1. **イベント作成**
   - ヘッダーの「イベント作成」ボタンをクリック
   - タイトル、日時、場所などを入力
   - 作成すると自動的にLINE通知が送信される（設定済みの場合）

2. **助っ人の追加**
   - イベント詳細ページで「助っ人（ゲスト）」セクションを編集
   - アプリ未登録の参加者人数を手動で追加

3. **イベント削除**
   - イベント詳細ページの「削除」ボタンをクリック

## トラブルシューティング

### ログインできない

**メールリンクログインの場合:**
- メールの受信箱とスパムフォルダを確認
- リンクが期限切れ（5分以内にクリック）
- Supabaseの認証設定を確認

**パスワードログインの場合:**
- パスワードが設定されているか確認（SQLで確認）
- メールアドレスが正しいか確認

### 管理者権限がない
- SQLで `is_admin` フラグを手動で設定
```sql
UPDATE public.users SET is_admin = TRUE WHERE email = 'your-email@example.com';
```

### 通知が届かない
- `.env.local` の `LINE_NOTIFY_TOKEN` を確認
- [LINE_NOTIFY_SETUP.md](./LINE_NOTIFY_SETUP.md) を参照

### RLSエラーが発生する
- Supabaseダッシュボードでポリシーを確認
- `supabase-schema.sql` を再実行

## 今後の拡張案

- [ ] イベントの編集機能
- [ ] 出欠履歴の表示
- [ ] 参加費の精算機能
- [ ] カレンダービュー
- [ ] プッシュ通知（PWA化）
- [ ] 天気予報の統合
- [ ] チーム統計・レポート

## ライセンス

MIT License

## 作成者

Your Name - [@yourtwitter](https://twitter.com/yourtwitter)

## 謝辞

- [Supabase](https://supabase.com/) - Backend as a Service
- [Next.js](https://nextjs.org/) - Reactフレームワーク
- [Tailwind CSS](https://tailwindcss.com/) - CSSフレームワーク
- [Lucide](https://lucide.dev/) - アイコンライブラリ
- [LINE Notify](https://notify-bot.line.me/) - 通知サービス
