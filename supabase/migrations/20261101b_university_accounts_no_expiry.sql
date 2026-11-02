-- 20261101b_university_accounts_no_expiry.sql (1 Nov 2026, Waqas): university accounts are free forever.
-- Run AFTER the app that reads public.users.academic is live (see 20261101a). Removes the expiry from every
-- university account on the student tier. A paid or comped tier is left as it is.
begin;
update public.users set trial_ends_at = null where academic and tier = 'edu' and trial_ends_at is not null;
commit;
