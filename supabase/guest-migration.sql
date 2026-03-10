-- ============================================
-- Migration: Add event_guests table and update guest management
-- ============================================

-- 1. Create event_guests table
CREATE TABLE IF NOT EXISTS public.event_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guest_count INTEGER NOT NULL CHECK (guest_count >= 0),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indicies
CREATE INDEX idx_event_guests_event_id ON public.event_guests(event_id);
CREATE INDEX idx_event_guests_user_id ON public.event_guests(user_id);

-- RLS
ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

-- Policies for event_guests
CREATE POLICY "Authenticated users can view all event guests"
  ON public.event_guests
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own event guests"
  ON public.event_guests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event guests"
  ON public.event_guests
  FOR UPDATE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE
  ));

CREATE POLICY "Users can delete their own event guests"
  ON public.event_guests
  FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE
  ));

-- Trigger for updated_at
CREATE TRIGGER update_event_guests_updated_at BEFORE UPDATE ON public.event_guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Migrate existing data
-- Insert existing guest counts as created by the event creator
INSERT INTO public.event_guests (event_id, user_id, guest_count, comment)
SELECT id, created_by, guest_count, '管理者による代理登録'
FROM public.events
WHERE guest_count > 0 AND created_by IS NOT NULL;

-- 3. Update view
DROP VIEW IF EXISTS event_details;

CREATE OR REPLACE VIEW event_details AS
SELECT 
  e.id, e.title, e.description, e.location, e.start_time, e.end_time,
  e.max_participants, e.participation_fee, e.created_by, e.created_at, e.updated_at,
  COUNT(CASE WHEN a.status = 'attending' THEN 1 END) AS attending_count,
  COUNT(CASE WHEN a.status = 'not_attending' THEN 1 END) AS not_attending_count,
  COUNT(CASE WHEN a.status = 'undecided' THEN 1 END) AS undecided_count,
  COALESCE(SUM(g.guest_count), 0) AS guest_count,
  (COUNT(CASE WHEN a.status = 'attending' THEN 1 END) + COALESCE(SUM(g.guest_count), 0)) AS total_participants
FROM public.events e
LEFT JOIN public.attendances a ON e.id = a.event_id
LEFT JOIN (
  SELECT event_id, SUM(guest_count) as guest_count
  FROM public.event_guests
  GROUP BY event_id
) g ON e.id = g.event_id
GROUP BY 
  e.id, g.guest_count;

-- 4. Remove old column
-- Note: It is safe to drop the column now as the view has been recreated to use event_guests.
ALTER TABLE public.events DROP COLUMN guest_count;
