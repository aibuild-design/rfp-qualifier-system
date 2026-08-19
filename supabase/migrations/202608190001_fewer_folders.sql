-- Three folders, not five.
--
-- To decide, Writing, Waiting on the agency, Submitted and Archive were set up
-- as the standard lanes. All five sat empty while both real bids stayed
-- unfiled, which is the queue telling you something: two of them restate what
-- the desk already knows.
--
-- A bid is being written when a draft exists. It is submitted when it has been
-- decided and filed. Asking a person to drag a card to record either is asking
-- them to maintain a second copy of state the system can already see, and
-- nobody does that twice.
--
-- What is left is the three that carry a human's own intent, which nothing can
-- derive: this one is undecided, this one is waiting on an answer from the
-- agency, this one is over. Custom folders still work for anything else.
update rfp_folders set is_system = false
  where name in ('Writing', 'Submitted');

delete from rfp_folders
  where name in ('Writing', 'Submitted')
    and not exists (select 1 from rfps where rfps.folder_id = rfp_folders.id);

comment on table rfp_folders is
  'Piles a person sorts bids into. Deliberately few: a folder that restates state the desk already tracks is a second copy nobody maintains.';
