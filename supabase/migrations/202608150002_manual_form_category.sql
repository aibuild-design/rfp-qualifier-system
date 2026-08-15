-- Allow the compliance category for documents that must be filled by hand.
--
-- The triage prompt was asked to raise these, and the model's response schema
-- was widened to let it. The database still refused the value, and because the
-- checklist inserts as one batch, a single rejected row took every other
-- compliance item with it: a solicitation came back with eleven items one run
-- and zero the next.
--
-- The lesson is that the instruction, the response schema and the constraint all
-- have to agree. Two out of three is worse than none, because it fails silently
-- and takes good data with it.
alter table rfp_compliance_items
  drop constraint if exists rfp_compliance_items_category_check;

alter table rfp_compliance_items
  add constraint rfp_compliance_items_category_check
  check (category in ('deadline','page_limit','format','submission','insurance','rubric','manual_form','other'));
