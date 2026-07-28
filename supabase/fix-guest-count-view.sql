-- ============================================
-- Fix: Update event_details view to correct guest_count multiplication bug
-- ============================================

DROP VIEW IF EXISTS event_details;

CREATE OR REPLACE VIEW event_details AS
SELECT 
  e.id, e.title, e.description, e.location, e.start_time, e.end_time,
  e.max_participants, e.participation_fee, e.created_by, e.created_at, e.updated_at,
  COUNT(CASE WHEN a.status = 'attending' THEN 1 END) AS attending_count,
  COUNT(CASE WHEN a.status = 'not_attending' THEN 1 END) AS not_attending_count,
  COUNT(CASE WHEN a.status = 'undecided' THEN 1 END) AS undecided_count,
  COALESCE(g.guest_count, 0) AS guest_count,
  (COUNT(CASE WHEN a.status = 'attending' THEN 1 END) + COALESCE(g.guest_count, 0)) AS total_participants
FROM public.events e
LEFT JOIN public.attendances a ON e.id = a.event_id
LEFT JOIN (
  SELECT event_id, SUM(guest_count) as guest_count
  FROM public.event_guests
  GROUP BY event_id
) g ON e.id = g.event_id
GROUP BY 
  e.id, g.guest_count;
