-- ============================================
-- Fix: Update RLS policies for event_guests to support team session users
-- ============================================

-- 1. 閲覧権限（誰でも見れるように変更）
DROP POLICY IF EXISTS "Authenticated users can view all event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Anyone can view all event guests" ON public.event_guests;

CREATE POLICY "Anyone can view all event guests"
  ON public.event_guests
  FOR SELECT
  USING (true);

-- 2. 作成権限（チームログインユーザー(anon)も許可）
DROP POLICY IF EXISTS "Users can insert their own event guests" ON public.event_guests;

CREATE POLICY "Users can insert their own event guests"
  ON public.event_guests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'anon');

-- 3. 更新権限（チームログインユーザー(anon)も許可）
DROP POLICY IF EXISTS "Users can update their own event guests" ON public.event_guests;

CREATE POLICY "Users can update their own event guests"
  ON public.event_guests
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'anon' OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE
  ));

-- 4. 削除権限（チームログインユーザー(anon)も許可）
DROP POLICY IF EXISTS "Users can delete their own event guests" ON public.event_guests;

CREATE POLICY "Users can delete their own event guests"
  ON public.event_guests
  FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'anon' OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE
  ));
