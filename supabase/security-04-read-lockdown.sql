-- ============================================
-- セキュリティ修正 その4：名簿・出欠・イベントを anon キーで読めなくする／ログイン失敗の回数を DB で数える
-- ============================================
-- 実行タイミング：読み取りをサーバー経由にした新しいアプリをデプロイした「後」に流す
--   （前に流すと、今動いている古いアプリはチームログインの人がトップ画面を読めなくなる）
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- 1. anon（ブラウザに配られている公開キー）からテーブルの権限をすべて外す
--    これまでは anon キーさえあれば、ログインしなくても名簿（ニックネーム・背番号）・出欠・イベントを
--    誰でも読めた。アプリの画面はサーバー側で service role を使って読むようにしたので、anon には何も要らない。
--    authenticated（メールでログインした管理者）の読み取りはそのまま残す（イベント作成・編集の画面が使う）。
--
-- 2. ログイン失敗の回数を数える login_attempts テーブルと関数を作る
--    これまではサーバーのメモリで数えていたので、Vercel のインスタンスが入れ替わるたびに数え直しになっていた。
--    テーブルは誰からも直接読み書きできず、service role だけが関数経由で使う。
--    キーは IP のハッシュ（IP そのものは保存しない）。

-- ============================================
-- 1. anon の権限を外す
-- ============================================
-- テーブルの権限を外すと、列ごとの権限（users・team_settings に付けていたもの）も一緒に外れる
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'events', 'attendances', 'event_guests', 'event_details', 'team_settings', 'notifications'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;

  -- 古いチームログインの仕組みの残り（今のアプリは使っていない）。あれば誰からも触れないようにする
  IF to_regclass('public.sessions') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.sessions FROM anon, authenticated';
  END IF;
END $$;

-- ============================================
-- 2. ログイン失敗の回数
-- ============================================
CREATE TABLE IF NOT EXISTS public.login_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Supabase は public スキーマの新しいテーブルを anon / authenticated にも自動で公開するので、明示的に外す
REVOKE ALL ON public.login_attempts FROM PUBLIC, anon, authenticated;

-- 期限内の失敗が上限に達しているか
CREATE OR REPLACE FUNCTION public.login_is_rate_limited(p_key text, p_max_failures integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.login_attempts
    WHERE key = p_key
      AND reset_at > now()
      AND failures >= p_max_failures
  );
$$;

-- 失敗を1回数え、期限内の失敗回数を返す（期限切れの行はここで掃除する）
CREATE OR REPLACE FUNCTION public.record_login_failure(p_key text, p_window_seconds integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_failures integer;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;

  DELETE FROM public.login_attempts WHERE reset_at <= now();

  INSERT INTO public.login_attempts AS a (key, failures, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE SET failures = a.failures + 1
  RETURNING a.failures INTO v_failures;

  RETURN v_failures;
END;
$$;

-- ログインに成功したら数え直す
CREATE OR REPLACE FUNCTION public.clear_login_failures(p_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.login_attempts WHERE key = p_key;
$$;

-- 実行できるのは service role だけ
REVOKE EXECUTE ON FUNCTION public.login_is_rate_limited(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_login_failure(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_login_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_is_rate_limited(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(text) TO service_role;

-- API（PostgREST）に新しい権限と関数を認識させる
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 確認用（流したあとに1つずつ実行して結果を見る）
-- ============================================
-- ① anon に残っているテーブルの権限：0行ならOK
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'anon'
-- ORDER BY table_name, privilege_type;

-- ② anon に残っている列の権限：0行ならOK
-- SELECT table_name, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND grantee = 'anon'
-- ORDER BY table_name, column_name;

-- ③ 管理者（メールログイン）の読み取りが残っているか：users・events・attendances・event_guests・event_details・team_settings の SELECT があればOK
--    （users と team_settings は列ごとの権限なので、②と同じ形で grantee = 'authenticated' にして見る）
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
-- ORDER BY table_name;

-- ④ 関数：anon_can / auth_can が false、service_can が true の3行ならOK
-- SELECT p.oid::regprocedure AS function,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can,
--        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('login_is_rate_limited', 'record_login_failure', 'clear_login_failures');

-- ⑤ login_attempts を anon / authenticated が触れないこと：どちらも false ならOK
-- SELECT has_table_privilege('anon', 'public.login_attempts', 'SELECT') AS anon_can,
--        has_table_privilege('authenticated', 'public.login_attempts', 'SELECT') AS auth_can;

-- ============================================
-- 元に戻すとき（アプリを修正前に戻した場合だけ。普段は流さない）
-- ============================================
-- GRANT SELECT ON public.events, public.attendances, public.event_guests, public.event_details TO anon;
-- GRANT SELECT (id, display_name, jersey_number, is_admin) ON public.users TO anon;
-- GRANT SELECT (id, app_title, created_at, updated_at) ON public.team_settings TO anon;
-- NOTIFY pgrst, 'reload schema';
