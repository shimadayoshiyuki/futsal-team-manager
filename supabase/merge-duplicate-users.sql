-- ============================================
-- 重複していたユーザー行を1人1行にまとめる
-- ============================================
-- 実行タイミング：check-duplicate-users.sql で重複を確かめ、どのグループも本当に同じ人だと確認した「後」に1回だけ流す
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- 以前のチームログインには、背番号なしの人はログインのたびに新しいユーザー行を作る不具合があった。
-- そのため同じ人の過去の出欠が何行にも分かれ、画面では「同じ名前の別人」として出ていた。
-- ここでは同じニックネーム＋背番号のグループごとに、
--   ・残す行 ＝ ログインで使われる行（いちばん最近に出欠を付けた行。出欠が無ければいちばん新しい行）
--     ※ check-duplicate-users.sql の will_use_on_login と、アプリのログイン処理と同じ決め方
--   ・残りの行の出欠と助っ人を、残す行へ付け替える
--   ・同じイベントに2つ以上の回答があるときは、いちばん新しく更新された回答だけを残す
--   ・残りの行を消す
-- 管理者（is_admin）の行と、メールでログインする人の行は扱わない（メールの行が含まれていたら止まる）。
--
-- 安全のための仕組み
--   ・全部を1つのまとまりで実行する。途中で1つでも引っかかったら何も変わらない
--   ・下の「想定の数」が check-duplicate-users.sql で見た数と違ったら止まる（見たときからデータが変わっていたら流さない）
--   ・2回目に流すと重複が0組なので止まる
--   ・消した行と変えた出欠は控えの表（merge_backup_*）に残す。いちばん下の手順で元に戻せる
--   ・付け替えのあいだは出欠・助っ人・イベントのトリガーを止める（「最終更新日時」が今日の日付に書き換わらないように）
--
-- Supabase の画面で「破壊的な操作を含む」と確認が出たら、そのまま実行してよい。
-- 流し終わると、まとめた人ごとの結果（残した行・消した行の数・付け替えた出欠・重なりで外した出欠）が表で出る。
--
-- 流したあと：消した行でログインしたままの人は、次にアプリを開くとログイン画面に戻る。
--   同じニックネームでログインし直せば、まとめた行に入る（過去の出欠もそこにそろっている）。
--
-- 止まったとき（どれもデータは何も変わっていない）
--   ・「確認したときと数が違います」… 確認したあとにデータが変わった。check-duplicate-users.sql を流し直して、結果を見てから決め直す
--   ・「想定外の列があります」「メールでログインする人の行」「must be owner of table」… そのままにして相談する
--
-- 試験：本番と同じ形の表と、確認した57行と同じ偽データ（PGlite）で、通しの実行・2回目・数の違い・想定外の表・
--   メールの行・途中での失敗・元に戻す手順・確認用の②③を試してある（2026-11-04）。

-- ============================================
-- 1. 控え（バックアップ）の表
-- ============================================
-- 元の行は丸ごと jsonb で持つ（列が増えていても取りこぼさない）。誰からも直接は読めないようにする。
CREATE TABLE IF NOT EXISTS public.merge_backup_users (
  merged_at timestamptz NOT NULL DEFAULT now(),
  keeper_id uuid NOT NULL,
  user_row jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.merge_backup_attendances (
  merged_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('moved', 'dropped')),  -- moved＝付け替えた／dropped＝重なりで外した
  keeper_id uuid NOT NULL,
  attendance_row jsonb NOT NULL                                 -- 変える前の行
);

CREATE TABLE IF NOT EXISTS public.merge_backup_refs (
  merged_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL,       -- event_guests / events
  row_id uuid NOT NULL,
  original_user_id uuid NOT NULL,
  keeper_id uuid NOT NULL
);

ALTER TABLE public.merge_backup_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merge_backup_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merge_backup_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merge_backup_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.merge_backup_attendances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.merge_backup_refs FROM PUBLIC, anon, authenticated;

-- ============================================
-- 2. まとめる
-- ============================================
DO $$
DECLARE
  -- 想定の数：check-duplicate-users.sql の結果に合わせる
  c_expected_people      CONSTANT integer := 10;   -- 重複していた人数（will_use_on_login = true の行の数）
  c_expected_removed     CONSTANT integer := 47;   -- 消える行の数（全行 − 人数）
  c_expected_attendances CONSTANT integer := 101;  -- 消える行に付いている出欠の合計

  v_unknown_refs text;
  v_people integer;
  v_removed integer;
  v_removed_attendances integer;
  v_with_email integer;
  v_before integer;
  v_after integer;
  v_dropped integer;
  v_moved integer;
  v_deleted integer;
BEGIN
  -- users を指している列が、ここで扱うもの以外に無いか（あれば消す前に止める）
  SELECT string_agg(format('%I.%I.%I', n.nspname, cl.relname, a.attname), ', ')
    INTO v_unknown_refs
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
    AND c.confrelid = 'public.users'::regclass
    AND format('%I.%I.%I', n.nspname, cl.relname, a.attname) NOT IN (
      'public.attendances.user_id',
      'public.event_guests.user_id',
      'public.events.created_by',
      'public.sessions.user_id'
    );

  IF v_unknown_refs IS NOT NULL THEN
    RAISE EXCEPTION 'users を指している想定外の列があります（%）。何も変えずに止めました', v_unknown_refs;
  END IF;

  -- まとめる対象：消す行 → 残す行 の対応表
  DROP TABLE IF EXISTS pg_temp.merge_map;
  CREATE TEMP TABLE merge_map ON COMMIT DROP AS
  WITH dup_groups AS (
    SELECT display_name, jersey_number
    FROM public.users
    WHERE is_admin IS NOT TRUE
    GROUP BY display_name, jersey_number
    HAVING count(*) > 1
  ),
  members AS (
    SELECT u.id, u.display_name, u.jersey_number, u.created_at,
           (SELECT max(a.updated_at) FROM public.attendances a WHERE a.user_id = u.id) AS last_answered_at
    FROM public.users u
    JOIN dup_groups g
      ON g.display_name = u.display_name
     AND g.jersey_number IS NOT DISTINCT FROM u.jersey_number
    WHERE u.is_admin IS NOT TRUE
  ),
  ranked AS (
    SELECT id,
           row_number() OVER w AS rn,
           first_value(id) OVER w AS keeper_id
    FROM members
    WINDOW w AS (
      PARTITION BY display_name, jersey_number
      ORDER BY last_answered_at DESC NULLS LAST, created_at DESC
    )
  )
  SELECT id AS user_id, keeper_id
  FROM ranked
  WHERE rn > 1;

  -- 見たときと同じデータか
  SELECT count(DISTINCT keeper_id), count(*) INTO v_people, v_removed FROM merge_map;
  SELECT count(*) INTO v_removed_attendances
  FROM public.attendances a
  WHERE a.user_id IN (SELECT user_id FROM merge_map);

  IF v_people <> c_expected_people
     OR v_removed <> c_expected_removed
     OR v_removed_attendances <> c_expected_attendances THEN
    RAISE EXCEPTION '確認したときと数が違います（人数 %・消える行 %・その出欠 %。想定は % ・ % ・ %）。check-duplicate-users.sql を流し直して確かめてください。何も変えていません',
      v_people, v_removed, v_removed_attendances,
      c_expected_people, c_expected_removed, c_expected_attendances;
  END IF;

  -- メールでログインする人の行は扱わない
  SELECT count(*) INTO v_with_email
  FROM public.users u
  WHERE u.email IS NOT NULL
    AND (u.id IN (SELECT user_id FROM merge_map) OR u.id IN (SELECT keeper_id FROM merge_map));

  IF v_with_email > 0 THEN
    RAISE EXCEPTION 'メールでログインする人の行が % 件含まれています。何も変えずに止めました', v_with_email;
  END IF;

  -- 出欠：グループごと・イベントごとに、いちばん新しく更新された回答を1つ選ぶ（同時刻なら残す行の回答）
  DROP TABLE IF EXISTS pg_temp.merge_attendances;
  CREATE TEMP TABLE merge_attendances ON COMMIT DROP AS
  WITH members AS (
    SELECT user_id, keeper_id FROM merge_map
    UNION
    SELECT keeper_id, keeper_id FROM merge_map
  )
  SELECT a.id, a.user_id, m.keeper_id,
         row_number() OVER (
           PARTITION BY m.keeper_id, a.event_id
           ORDER BY a.updated_at DESC NULLS LAST,
                    (a.user_id = m.keeper_id) DESC,
                    a.created_at DESC NULLS LAST,
                    a.id
         ) AS rn
  FROM public.attendances a
  JOIN members m ON m.user_id = a.user_id;

  SELECT count(*) INTO v_before FROM merge_attendances;

  -- 付け替えのあいだは updated_at を書き換えるトリガーなどを止める（外部キーの確認は止まらない）
  ALTER TABLE public.attendances DISABLE TRIGGER USER;
  ALTER TABLE public.event_guests DISABLE TRIGGER USER;
  ALTER TABLE public.events DISABLE TRIGGER USER;

  -- 控えを取ってから、重なりを外し、残りを付け替える
  INSERT INTO public.merge_backup_attendances (action, keeper_id, attendance_row)
  SELECT CASE WHEN t.rn > 1 THEN 'dropped' ELSE 'moved' END, t.keeper_id, to_jsonb(a)
  FROM merge_attendances t
  JOIN public.attendances a ON a.id = t.id
  WHERE t.rn > 1 OR t.user_id <> t.keeper_id;

  DELETE FROM public.attendances a
  USING merge_attendances t
  WHERE a.id = t.id AND t.rn > 1;
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  UPDATE public.attendances a
  SET user_id = t.keeper_id
  FROM merge_attendances t
  WHERE a.id = t.id AND t.rn = 1 AND t.user_id <> t.keeper_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- 助っ人（同じイベントに複数あってよい表なので、そのまま付け替える）
  INSERT INTO public.merge_backup_refs (table_name, row_id, original_user_id, keeper_id)
  SELECT 'event_guests', g.id, g.user_id, m.keeper_id
  FROM public.event_guests g
  JOIN merge_map m ON m.user_id = g.user_id;

  UPDATE public.event_guests g
  SET user_id = m.keeper_id
  FROM merge_map m
  WHERE g.user_id = m.user_id;

  -- イベントの作成者（管理者が作るので通常は0件）
  INSERT INTO public.merge_backup_refs (table_name, row_id, original_user_id, keeper_id)
  SELECT 'events', e.id, e.created_by, m.keeper_id
  FROM public.events e
  JOIN merge_map m ON m.user_id = e.created_by;

  UPDATE public.events e
  SET created_by = m.keeper_id
  FROM merge_map m
  WHERE e.created_by = m.user_id;

  ALTER TABLE public.attendances ENABLE TRIGGER USER;
  ALTER TABLE public.event_guests ENABLE TRIGGER USER;
  ALTER TABLE public.events ENABLE TRIGGER USER;

  -- 古いチームログインの仕組みの残り（今のアプリは使っていない）
  IF to_regclass('public.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.sessions s USING pg_temp.merge_map m WHERE s.user_id = m.user_id';
  END IF;

  -- 控えを取ってから、ユーザー行を消す
  INSERT INTO public.merge_backup_users (keeper_id, user_row)
  SELECT m.keeper_id, to_jsonb(u)
  FROM public.users u
  JOIN merge_map m ON m.user_id = u.id;

  DELETE FROM public.users u
  USING merge_map m
  WHERE u.id = m.user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 最後の確かめ（どれか1つでも合わなければ全部元に戻る）
  SELECT count(*) INTO v_after
  FROM public.attendances a
  WHERE a.user_id IN (SELECT keeper_id FROM merge_map);

  IF v_deleted <> c_expected_removed THEN
    RAISE EXCEPTION '消した行の数が想定と違います（% 行。想定は % 行）。全部元に戻しました', v_deleted, c_expected_removed;
  END IF;

  IF v_after <> v_before - v_dropped THEN
    RAISE EXCEPTION '出欠の数が合いません（前 %・重なりで外した %・後 %）。全部元に戻しました', v_before, v_dropped, v_after;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE is_admin IS NOT TRUE
    GROUP BY display_name, jersey_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '重複がまだ残っています。全部元に戻しました';
  END IF;
END $$;

-- ============================================
-- 3. 結果（流すとこの表が出る）
-- ============================================
-- removed_rows＝消した行／moved＝付け替えた出欠／dropped＝同じイベントに新しい回答があったので外した古い回答
-- attendances_now＝残した行の出欠の数（まとめる前の合計 − dropped と同じになる）
SELECT u.display_name,
       u.jersey_number,
       u.id AS kept_id,
       (SELECT count(*) FROM public.merge_backup_users b WHERE b.keeper_id = u.id) AS removed_rows,
       (SELECT count(*) FROM public.merge_backup_attendances b WHERE b.keeper_id = u.id AND b.action = 'moved') AS moved,
       (SELECT count(*) FROM public.merge_backup_attendances b WHERE b.keeper_id = u.id AND b.action = 'dropped') AS dropped,
       (SELECT count(*) FROM public.attendances a WHERE a.user_id = u.id) AS attendances_now
FROM public.users u
WHERE u.id IN (SELECT keeper_id FROM public.merge_backup_users)
ORDER BY u.display_name, u.jersey_number NULLS FIRST;

-- ============================================
-- 確認用（流したあとに実行して結果を見る）
-- ============================================
-- ① 重複が残っていないこと：check-duplicate-users.sql を流して 0 行ならOK

-- ② 控えの表を anon / authenticated が読めないこと：すべて false ならOK
-- SELECT t AS table_name,
--        has_table_privilege('anon', t, 'SELECT') AS anon_can,
--        has_table_privilege('authenticated', t, 'SELECT') AS auth_can
-- FROM unnest(ARRAY['public.merge_backup_users', 'public.merge_backup_attendances', 'public.merge_backup_refs']) AS t;

-- ③ トリガーが元どおり動いていること：tgenabled がすべて 'O' ならOK
-- SELECT tgrelid::regclass AS table_name, tgname, tgenabled
-- FROM pg_trigger
-- WHERE NOT tgisinternal
--   AND tgrelid IN ('public.attendances'::regclass, 'public.event_guests'::regclass, 'public.events'::regclass);

-- ============================================
-- 後片付け（1か月ほど使ってみて問題がなければ流す。控えの表を消すので、以後は元に戻せない）
-- ============================================
-- DROP TABLE public.merge_backup_users, public.merge_backup_attendances, public.merge_backup_refs;

-- ============================================
-- 元に戻すとき（まとめた直後に、まとめ方が間違っていたと分かった場合だけ。普段は流さない）
-- ============================================
-- まとめた後に付けた出欠はそのまま残る（同じイベントに元の回答と重なると止まるので、そのときは相談する）
-- 消した古い仕組みのセッション（今のアプリは使っていない）は戻らない
-- DO $$
-- BEGIN
--   INSERT INTO public.users
--   SELECT (jsonb_populate_record(NULL::public.users, user_row)).* FROM public.merge_backup_users;
--
--   ALTER TABLE public.attendances DISABLE TRIGGER USER;
--   ALTER TABLE public.event_guests DISABLE TRIGGER USER;
--   ALTER TABLE public.events DISABLE TRIGGER USER;
--
--   UPDATE public.attendances a
--   SET user_id = (b.attendance_row->>'user_id')::uuid
--   FROM public.merge_backup_attendances b
--   WHERE b.action = 'moved' AND a.id = (b.attendance_row->>'id')::uuid;
--
--   INSERT INTO public.attendances
--   SELECT (jsonb_populate_record(NULL::public.attendances, attendance_row)).*
--   FROM public.merge_backup_attendances WHERE action = 'dropped';
--
--   UPDATE public.event_guests g SET user_id = r.original_user_id
--   FROM public.merge_backup_refs r WHERE r.table_name = 'event_guests' AND g.id = r.row_id;
--
--   UPDATE public.events e SET created_by = r.original_user_id
--   FROM public.merge_backup_refs r WHERE r.table_name = 'events' AND e.id = r.row_id;
--
--   ALTER TABLE public.attendances ENABLE TRIGGER USER;
--   ALTER TABLE public.event_guests ENABLE TRIGGER USER;
--   ALTER TABLE public.events ENABLE TRIGGER USER;
--
--   DELETE FROM public.merge_backup_users;
--   DELETE FROM public.merge_backup_attendances;
--   DELETE FROM public.merge_backup_refs;
-- END $$;
