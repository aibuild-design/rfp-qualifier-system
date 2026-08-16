-- The tailored version of a section, kept beside the stitched one.
--
-- The draft is assembled from Caravann's approved language and never invented,
-- which is right for a document submitted to a government agency. The cost is
-- that every proposal reads the same regardless of which solicitation it is
-- for: "we facilitate executive teams" rather than anything about this agency,
-- this scope, this timeline. The SOW scoped a tailoring pass after assembly and
-- it was never built.
--
-- `body` stays exactly as stitched. The tailored text is a separate column, so
-- the original is always recoverable and the two can be compared: a rewrite you
-- cannot see the before of is a rewrite nobody can check.
alter table rfp_proposal_sections add column if not exists tailored_body text;
alter table rfp_proposal_sections add column if not exists tailored_at timestamptz;

comment on column rfp_proposal_sections.tailored_body is
  'The section adapted to this solicitation. Null until the tailoring pass has run. The stitched original stays in body and is never overwritten.';
