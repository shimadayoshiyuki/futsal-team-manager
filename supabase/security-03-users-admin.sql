-- ============================================
-- セキュリティ修正 その3：自分で自分を管理者にできないようにする
-- ============================================
-- 実行タイミング：security-02-lockdown.sql の後ならいつでも（アプリの変更は要らない）
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- 【穴】
-- ログイン画面のメールログイン（マジックリンク）は、初めてのメールアドレスでもアカウントを作る
-- （signInWithOtp の既定の動き。Supabase の「Allow new users to sign up」がオンのとき）。
-- users の INSERT / UPDATE ポリシーは「自分の行かどうか」しか見ていないので、
-- 誰でもメールでログイン → ブラウザから自分の行を is_admin = true で作る（または書き換える）
-- → 管理者として、イベントの作成・削除、LINE グループへの通知、チームのパスワード変更ができた。
--
-- さらに本番には、リポジトリに無いポリシー "Enable insert for team login"
-- （INSERT、anon と authenticated、条件は「自分の行 または email が空」）があり、
-- ログインしていない人でも users に行を作れた（名簿に偽の行を足せる。
-- 管理者の印を付けた行をメンバーのニックネームで作れば、その人はチームログインできなくなる）。
-- 今のチームログインはサーバー（service role）で行を作るので、このポリシーは要らない。
--
-- 【方針】
-- 列単位の GRANT で、ブラウザから書ける列を決める。is_admin は書けない（既定値の false になる）。
-- 管理者にするのは、これまでどおり管理画面（Table Editor / SQL Editor）で行う。
--
-- ブラウザから users に書いているのはプロフィール設定（app/profile/setup/page.tsx）の INSERT だけで、
-- 書く列は id, email, display_name, jersey_number。UPDATE・DELETE はどの画面からもしていない。
-- チームログインのユーザー作成はサーバー（service role）なので、ここで権限を外しても影響しない。

BEGIN;

-- 0. 要らなくなったポリシーを消す
-- 未ログインでも users に行を作れたポリシー（今のチームログインは service role なので使っていない）
DROP POLICY IF EXISTS "Enable insert for team login" ON public.users;
-- 出欠の「誰でも作れる・誰でも書き換えられる」ポリシー（条件が true）。
-- security-02 で書き込み権限ごと外したので今は効いていないが、権限を戻したときに穴が開かないよう消しておく。
-- 出欠は /api/attendances（サーバー）が本人のセッションを確かめて書く。
DROP POLICY IF EXISTS "Users can insert their own attendance" ON public.attendances;
DROP POLICY IF EXISTS "Users can update their own attendance" ON public.attendances;

-- 1. users：テーブル単位の書き込み権限を外し、プロフィール設定に要る列だけ INSERT を許す
-- 列単位の GRANT はテーブル単位の GRANT があると無視されるので、必ず先に REVOKE する。
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT INSERT (id, email, display_name, jersey_number) ON public.users TO authenticated;
-- 「自分の行だけ」は既存のポリシー "Users can insert their own profile" が判定する。

-- 2. events：作成・編集・削除は管理者のメールログイン（authenticated）で行うので、anon には要らない
-- （authenticated に残す書き込みは、既存の "Admins can ..." ポリシーが管理者だけに絞っている）
REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon;

-- 3. event_details（集計のビュー）：もともと書き込めない形のビューだが、権限も外しておく
REVOKE INSERT, UPDATE, DELETE ON public.event_details FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- 確認用（流したあとに実行して結果を見る）
-- ============================================
-- ① users の列の権限：INSERT が authenticated の id / email / display_name / jersey_number だけで、
--    UPDATE が一行も出てこなければOK（SELECT は fix-users-email-exposure.sql で付けた4列）
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'users'
--   AND grantee IN ('anon', 'authenticated')
--   AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
-- ORDER BY grantee, privilege_type, column_name;
--
-- ② すでに誰かが管理者になっていないか：知っている管理者だけが出てくればOK
--    （メールアドレスが出るので、結果は貼り付けずに目で確かめる）
--    email も last_sign_in_at も空の行は、メールログインしていない＝外から作られた疑いがある
-- SELECT u.display_name, u.email, u.created_at, a.last_sign_in_at
-- FROM public.users u
-- LEFT JOIN auth.users a ON a.id = u.id
-- WHERE u.is_admin = true
-- ORDER BY u.created_at;
--
-- ③ メールログインのアカウント一覧：知らないメールアドレスが無ければOK
-- SELECT email, created_at, last_sign_in_at
-- FROM auth.users
-- ORDER BY created_at DESC;

-- ============================================
-- 元に戻すとき（プロフィール設定などが動かなくなった場合だけ）
-- ============================================
-- ※ 戻すと、メールでログインした誰もが自分を管理者にできる状態に戻る
-- GRANT INSERT, UPDATE, DELETE ON public.users TO authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.events TO anon;
-- 消したポリシーは戻さない（チームログインと出欠はサーバー経由なので使わない）。
-- 古いアプリに戻す（security-02 の「元に戻すとき」）場合だけは、出欠の2つのポリシーも作り直しが要る。
