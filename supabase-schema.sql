-- ============================================
-- フットサルチーム管理アプリ - データベーススキーマ
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Users テーブル（プロフィール情報）
-- ============================================
-- Supabase Authのユーザーに紐づくプロフィール情報
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  jersey_number INTEGER, -- 背番号（任意）
  is_admin BOOLEAN DEFAULT FALSE, -- 管理者フラグ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) を有効化
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のプロフィールを読み取れる
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- ポリシー: ユーザーは自分のプロフィールを更新できる
CREATE POLICY "Users can update their own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- ポリシー: 認証済みユーザーは全ユーザーを閲覧できる（参加者リスト表示用）
CREATE POLICY "Authenticated users can view all users"
  ON public.users
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ポリシー: 新規ユーザーは自分のプロフィールを作成できる
CREATE POLICY "Users can insert their own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. Events テーブル（イベント情報）
-- ============================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT, -- 備考
  location TEXT NOT NULL, -- 場所
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  max_participants INTEGER, -- 募集人数上限（NULL = 無制限）
  participation_fee INTEGER DEFAULT 0, -- 参加費（円）
  guest_count INTEGER DEFAULT 0, -- 助っ人（ゲスト）人数
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス: 日時でソート
CREATE INDEX idx_events_start_time ON public.events(start_time DESC);

-- RLS を有効化
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- ポリシー: 認証済みユーザーは全イベントを閲覧できる
CREATE POLICY "Authenticated users can view all events"
  ON public.events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ポリシー: 管理者のみがイベントを作成できる
CREATE POLICY "Admins can insert events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ポリシー: 管理者のみがイベントを更新できる
CREATE POLICY "Admins can update events"
  ON public.events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ポリシー: 管理者のみがイベントを削除できる
CREATE POLICY "Admins can delete events"
  ON public.events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ============================================
-- 3. Attendances テーブル（出欠情報）
-- ============================================
CREATE TYPE attendance_status AS ENUM ('attending', 'not_attending', 'undecided');

CREATE TABLE IF NOT EXISTS public.attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status attendance_status NOT NULL DEFAULT 'undecided',
  comment TEXT, -- コメント（例：「遅れて行きます」）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- 1ユーザーにつき1イベント1回答
);

-- インデックス: イベントごとの出欠検索
CREATE INDEX idx_attendances_event_id ON public.attendances(event_id);
CREATE INDEX idx_attendances_user_id ON public.attendances(user_id);

-- RLS を有効化
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- ポリシー: 認証済みユーザーは全出欠情報を閲覧できる
CREATE POLICY "Authenticated users can view all attendances"
  ON public.attendances
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ポリシー: ユーザーは自分の出欠を登録できる
CREATE POLICY "Users can insert their own attendance"
  ON public.attendances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ポリシー: ユーザーは自分の出欠を更新できる
CREATE POLICY "Users can update their own attendance"
  ON public.attendances
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ポリシー: ユーザーは自分の出欠を削除できる
CREATE POLICY "Users can delete their own attendance"
  ON public.attendances
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Notifications テーブル（LINE通知履歴）
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'event_created', 'reminder'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT
);

-- インデックス: イベントごとの通知検索
CREATE INDEX idx_notifications_event_id ON public.notifications(event_id);

-- RLS を有効化
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ポリシー: 管理者のみが通知履歴を閲覧できる
CREATE POLICY "Admins can view notifications"
  ON public.notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ============================================
-- 5. トリガー: updated_at自動更新
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. ビュー: イベント詳細（参加人数含む）
-- ============================================
CREATE OR REPLACE VIEW event_details AS
SELECT 
  e.*,
  COUNT(CASE WHEN a.status = 'attending' THEN 1 END) AS attending_count,
  COUNT(CASE WHEN a.status = 'not_attending' THEN 1 END) AS not_attending_count,
  COUNT(CASE WHEN a.status = 'undecided' THEN 1 END) AS undecided_count,
  (COUNT(CASE WHEN a.status = 'attending' THEN 1 END) + e.guest_count) AS total_participants
FROM public.events e
LEFT JOIN public.attendances a ON e.id = a.event_id
GROUP BY e.id;

-- ============================================
-- 7. 初期データ投入（サンプル管理者）
-- ============================================
-- 注意: 実際の運用では、最初のユーザーを手動で管理者にする必要があります
-- 以下はサンプルコメントです
-- INSERT INTO public.users (id, email, display_name, is_admin)
-- VALUES ('your-auth-user-id', 'admin@example.com', '管理者', TRUE);
