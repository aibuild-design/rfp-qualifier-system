-- Let the desk know what Caravann actually does, not just where it has been.
--
-- Found by putting a real live solicitation through the pipeline: Central
-- Health's "Leadership Development & Cultural Transformation Services", due
-- 18 Aug 2026. It scored 42%, MAYBE, on the reasoning that Caravann's
-- healthcare-sector depth is "thin — 3 years, 4 engagements".
--
-- Caravann's own capability deck lists, in its own words: culture
-- transformation, change management, executive coaching, leadership retreats,
-- training and development, employee engagement. The solicitation asks for
-- leadership development, improvement coaching and organizational
-- transformation. It is close to a literal match for the firm's stated core
-- service — and the desk had no way to see that, because the only thing it
-- could weigh was a sector count.
--
-- Both rubric dimensions that scored low here ("sector depth" and "comparable
-- engagements — same kind of work") were being judged on sector alone. Nothing
-- about the rubric or the thresholds changes; it is the evidence underneath
-- them that was missing.
--
-- Three lists rather than one flat array, because they answer different
-- questions and a solicitation usually matches on one of them:
--   functional_areas — the engagement type (strategic planning, change mgmt)
--   key_capabilities — what is actually delivered (facilitation, coaching)
--   subject_areas    — the topic expertise (burnout, emotional intelligence)
alter table public.org_profile
  add column if not exists capabilities jsonb;

comment on column public.org_profile.capabilities is
  'What Caravann does, in its own words: { functional_areas, key_capabilities, subject_areas }. Sent to triage alongside the sector map so "have you done this kind of work?" can be answered from capability, not only from sector counts.';
