-- ============================================
-- public.users のメールアドレス露出を止める
-- ============================================
--
-- 【背景】
-- NEXT_PUBLIC_SUPABASE_ANON_KEY はクライアントバンドルに含まれるため実質公開情報。
-- この鍵で public.users を SELECT すると、全ユーザーの email が誰でも読み取れる状態だった。
-- （supabase-schema.sql 上は authenticated 限定のはずだが、本番のポリシーは乖離している）
--
-- 【方針】
-- RLS は「行」の出し分けしかできず、「列」を隠すことはできない。
-- そのため列単位の GRANT で email を落とす。
--
-- 名簿（display_name / jersey_number）自体は anon から隠せない。
-- チームログインが「ニックネーム＋背番号」で users を anon 検索する実装
-- （app/api/auth/team-login/route.ts）になっており、ここを塞ぐと誰もログインできなくなるため。
--
-- 【事前条件 ⚠️】
-- アプリ側の users への .select('*') を明示列指定に置き換えたコミットを先にデプロイすること。
--   app/page.tsx / app/settings/page.tsx / app/events/[id]/page.tsx
-- SQL だけ先に適用すると `permission denied for column email` で画面が落ちる。

BEGIN;

-- ------------------------------------------------
-- 1) テーブル全体の SELECT を落とし、必要な列だけ返す
-- ------------------------------------------------
-- 列単位の GRANT はテーブル単位の GRANT があると無視されるので、必ず先に REVOKE する。
REVOKE SELECT ON public.users FROM anon, authenticated;

-- is_admin を含めているのは、events / attendances の RLS ポリシーが
-- `SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true` を
-- 参照しているため（supabase-schema.sql 参照）。ここを外すとイベント操作が壊れる。
GRANT SELECT (id, display_name, jersey_number, is_admin)
  ON public.users TO anon, authenticated;

-- email / created_at / updated_at はどのコードパスも読んでいないので付与しない。
-- ※ service_role（管理APIで使用）は対象外なので、サーバー側からは従来どおり全列読める。

-- ------------------------------------------------
-- 2) 書き込みを自分の行だけに限定する
-- ------------------------------------------------
-- is_admin を自分で true にできてしまわないよう、UPDATE に WITH CHECK を追加する。
-- （元の定義には USING しかなく、更新後の行が検証されていなかった）
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

COMMIT;


-- ============================================
-- 適用後の確認クエリ（SQL Editor で実行）
-- ============================================
-- 期待値: anon / authenticated に email 行が出てこないこと
--
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'users'
--   AND grantee IN ('anon', 'authenticated')
-- ORDER BY grantee, column_name;
--
-- 期待値: 想定外の書き込みポリシーが残っていないこと
--
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'users'
-- ORDER BY cmd, policyname;


-- ============================================
-- ロールバック（画面が壊れた場合）
-- ============================================
-- GRANT SELECT ON public.users TO anon, authenticated;
