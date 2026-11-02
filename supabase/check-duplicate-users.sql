-- ============================================
-- 確認用：同じ人のユーザー行が重複していないか（読むだけ。何も書き換えない）
-- ============================================
-- 実行場所：Supabase の管理画面 > SQL Editor
--
-- 以前のチームログインには、背番号なしの人はログインのたびに新しいユーザー行を作る不具合があった
-- （.eq('jersey_number', null) は SQL の NULL に一致しないため）。
-- 新しいアプリでは同じニックネーム＋背番号の行を探し、いちばん最近に出欠を付けた行でログインする。
-- 重複していた残りの行と、そこに付いた出欠は「同じ名前の別人」として画面に残る。
--
-- 結果が 0 行なら重複は無い。行が出たら、ログインで使われるのは will_use_on_login = true の行。
-- 他の行に今後のイベントの出欠が付いていれば、統合（出欠の付け替えと行の削除）を検討する。

WITH dup_groups AS (
  SELECT display_name, jersey_number
  FROM public.users
  WHERE is_admin IS NOT TRUE
  GROUP BY display_name, jersey_number
  HAVING count(*) > 1
),
rows AS (
  SELECT u.id, u.display_name, u.jersey_number, u.created_at,
         (SELECT count(*) FROM public.attendances a WHERE a.user_id = u.id) AS attendances,
         (SELECT count(*) FROM public.attendances a
            JOIN public.events e ON e.id = a.event_id
           WHERE a.user_id = u.id AND e.start_time >= now()) AS upcoming_attendances,
         (SELECT max(a.updated_at) FROM public.attendances a WHERE a.user_id = u.id) AS last_answered_at
  FROM public.users u
  JOIN dup_groups g
    ON g.display_name = u.display_name
   AND g.jersey_number IS NOT DISTINCT FROM u.jersey_number
  WHERE u.is_admin IS NOT TRUE
)
SELECT display_name, jersey_number, id, created_at, attendances, upcoming_attendances, last_answered_at,
       row_number() OVER (
         PARTITION BY display_name, jersey_number
         ORDER BY last_answered_at DESC NULLS LAST, created_at DESC
       ) = 1 AS will_use_on_login
FROM rows
ORDER BY display_name, jersey_number NULLS FIRST, last_answered_at DESC NULLS LAST, created_at DESC;
