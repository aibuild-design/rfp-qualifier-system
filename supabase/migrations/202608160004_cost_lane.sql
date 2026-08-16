-- How much this agency is buying on price.
--
-- Module 8 asked for a cost lane flag and never had one, so the Price section
-- drafted the same rate methodology whether cost was 15% of the award or 50%.
-- Those are two different bids: one is won on approach and lost by discounting
-- into a credibility problem, the other is won or lost on the number.
--
-- Derived, not asked for. The weighting is already captured as a rubric
-- compliance item, so this is arithmetic on something the desk already read,
-- and arithmetic belongs in the app rather than the model.
--
-- Null is the normal case for a solicitation that never states a weighting.
-- That is not a failure and must not read as one.
alter table rfps add column if not exists cost_weight_percent integer;
alter table rfps add column if not exists cost_lane text;
alter table rfps add column if not exists cost_lane_note text;

comment on column public.rfps.cost_weight_percent is
  'The cost weighting stated in the solicitation, 0-100. Null when the document never states one.';
comment on column public.rfps.cost_lane is
  'price_led at 40% and up, quality_led below 25%, balanced between.';
