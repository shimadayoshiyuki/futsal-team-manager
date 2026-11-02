-- ============================================
-- セキュリティ修正 その2：ブラウザ（anon / authenticated）から触れる範囲を絞る
-- ============================================
-- 実行タイミング：security-01-functions.sql を流し、新しいアプリのデプロイが終わった「後」に流す
--               （先に流すと、古いアプリのログイン・出欠・助っ人登録が動かなくなる）
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- やること
--   1. team_settings の team_password_hash 列をブラウザから読めなくする
--   2. 古いパスワード関数を消す
--   3. 出欠・助っ人・通知ログの書き込みをブラウザから直接できなくする
--      （新しいアプリはセッションを確かめるサーバーのAPI経由で書き込む）
--
-- RLS は「どの行を見せるか」しか決められないので、列を隠すには GRANT で絞る。
-- 列単位の GRANT はテーブル単位の GRANT があると無視されるので、必ず先に REVOKE する。

BEGIN;

-- 1. team_settings：ハッシュの列を除いて読めるようにし、更新はタイトルだけにする
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.team_settings FROM anon, authenticated;
GRANT SELECT (id, app_title, created_at, updated_at) ON public.team_settings TO anon, authenticated;
-- タイトル変更（/api/settings/update-title）は管理者のログインで行うので authenticated に残す。
-- 管理者かどうかは既存のポリシー "Admins can update team settings" が判定する。
GRANT UPDATE (app_title) ON public.team_settings TO authenticated;

-- 2. 古いパスワード関数（ハッシュを外から受け取る形）を削除
-- 本番で手作業で作られた関数で、リポジトリに定義が無い。引数の型が違って消えなかった場合は、
-- 下の確認用クエリ③で名前と引数を確かめて DROP FUNCTION を書き直す。
DROP FUNCTION IF EXISTS public.verify_team_password(text, text);
DROP FUNCTION IF EXISTS public.generate_password_hash(text);

-- 3. 助っ人：anon でも書き込めたポリシーを削除し、書き込み権限そのものを外す
DROP POLICY IF EXISTS "Users can insert their own event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Users can update their own event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Users can delete their own event guests" ON public.event_guests;
REVOKE INSERT, UPDATE, DELETE ON public.event_guests FROM anon, authenticated;

-- 4. 出欠：同じくブラウザからの書き込み権限を外す
-- （本番には anon 向けのポリシーがある可能性があるが、権限を外せばポリシーに関係なく書き込めない）
REVOKE INSERT, UPDATE, DELETE ON public.attendances FROM anon, authenticated;

-- 5. 通知ログ：書き込むのはサーバー（service role）だけ
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- イベント削除時の出欠・助っ人の連鎖削除（ON DELETE CASCADE）はテーブルの所有者の権限で動くので、
-- ここで権限を外しても管理者のイベント削除はそのまま動く。

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- 確認用（流したあとに実行して結果を見る）
-- ============================================
-- ① team_settings の列の権限：team_password_hash が一行も出てこなければOK
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'team_settings'
--   AND grantee IN ('anon', 'authenticated')
-- ORDER BY grantee, privilege_type, column_name;
--
-- ② anon / authenticated がテーブル単位で持っている権限：
--    attendances / event_guests / notifications に INSERT・UPDATE・DELETE が無ければOK。
--    events などに anon の INSERT・UPDATE・DELETE が残っていたら、③のポリシーと合わせて確認する
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
-- ORDER BY table_name, grantee, privilege_type;
--
-- ③ ポリシーの一覧（本番はリポジトリの SQL と違うことがあるので目で確認する）
--    qual / with_check に auth.role() = 'anon' や true が入った書き込み用ポリシーが残っていないか
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd, policyname;
--
-- ④ パスワード関数：verify_team_password(text) と set_team_password(text) だけが残っていればOK
-- SELECT p.oid::regprocedure AS function,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('verify_team_password', 'set_team_password', 'generate_password_hash');

-- ============================================
-- 元に戻すとき（新しいアプリに不具合があり、古いアプリへ戻す場合だけ）
-- ============================================
-- ※ 戻すと、ハッシュが再び誰でも読める・誰でも出欠や助っ人を書き換えられる状態に戻る
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_settings TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.event_guests, public.attendances, public.notifications TO anon, authenticated;
-- そのうえで supabase/fix-guest-rls.sql を流し直し、古い関数を作り直す（定義はリポジトリに無い）
