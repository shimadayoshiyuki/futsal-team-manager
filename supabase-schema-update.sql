-- ============================================
-- チーム共通パスワード認証への移行スキーマ
-- ============================================

-- 1. チーム設定テーブルの作成
CREATE TABLE IF NOT EXISTS public.team_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_password_hash TEXT NOT NULL,
  app_title TEXT DEFAULT 'フットサルチーム管理',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化
ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは閲覧可能
CREATE POLICY "Anyone can view team settings"
  ON public.team_settings FOR SELECT
  USING (true);

-- 管理者のみ更新可能
CREATE POLICY "Admins can update team settings"
  ON public.team_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- 2. usersテーブルの調整（emailをオプショナルに）
ALTER TABLE public.users 
  ALTER COLUMN email DROP NOT NULL;

-- 3. セッション管理テーブルの作成（Supabase Authを使わない場合）
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);

-- RLS有効化
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- 自分のセッションのみ閲覧可能
CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (user_id = auth.uid());

-- 4. 初期チーム設定データの挿入（パスワード: futsal2024）
INSERT INTO public.team_settings (team_password_hash, app_title)
VALUES (
  crypt('futsal2024', gen_salt('bf')),
  'フットサルチーム管理'
)
ON CONFLICT DO NOTHING;

-- 5. updated_atトリガーの追加
CREATE TRIGGER update_team_settings_updated_at
  BEFORE UPDATE ON public.team_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
