-- ============================================
-- セキュリティ修正 その1：パスワード照合をDBの中に閉じ込める
-- ============================================
-- 実行タイミング：新しいアプリをデプロイする「前」に流す（既存の仕組みは壊さない追加だけ）
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- これまでの照合は「ブラウザからも読める team_settings からハッシュを取り出し、
-- verify_team_password(input_password, stored_hash) に渡す」形だったため、ハッシュ自体が誰でも読めた。
-- 新しい関数はハッシュを関数の中で読み、結果（true/false）だけを返す。
-- さらに実行できるのを service role（サーバーのAPIだけが持つ鍵）に限るので、
-- 公開されている anon キーで直接総当たりすることもできない。
--
-- 旧関数 verify_team_password(text, text) / generate_password_hash(text) は、
-- デプロイ後に security-02-lockdown.sql で削除する。

-- crypt() / gen_salt() を使うための拡張（Supabase では通常すでに入っている）
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. チーム共通パスワードの照合
CREATE OR REPLACE FUNCTION public.verify_team_password(input_password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  stored_hash text;
BEGIN
  IF input_password IS NULL OR input_password = '' THEN
    RETURN false;
  END IF;

  SELECT team_password_hash INTO stored_hash
  FROM public.team_settings
  ORDER BY created_at, id
  LIMIT 1;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN crypt(input_password, stored_hash) = stored_hash;
END;
$$;

-- 2. チーム共通パスワードの変更（ハッシュ化もこの中で行う）
CREATE OR REPLACE FUNCTION public.set_team_password(new_password text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters';
  END IF;

  UPDATE public.team_settings
  SET team_password_hash = crypt(new_password, gen_salt('bf'))
  WHERE id = (
    SELECT id FROM public.team_settings
    ORDER BY created_at, id
    LIMIT 1
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_settings row not found';
  END IF;
END;
$$;

-- 3. 実行できるのは service role だけ
-- （Supabase は public スキーマの関数を anon / authenticated にも自動で公開するので、明示的に外す）
REVOKE EXECUTE ON FUNCTION public.verify_team_password(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_team_password(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_team_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_team_password(text) TO service_role;

-- API（PostgREST）に新しい関数を認識させる
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 確認用（流したあとに実行して結果を見る）
-- ============================================
-- anon_can / auth_can が false、service_can が true になっていればOK
-- SELECT p.oid::regprocedure AS function,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can,
--        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('verify_team_password', 'set_team_password', 'generate_password_hash');
