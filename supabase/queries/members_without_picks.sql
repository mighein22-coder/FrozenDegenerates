-- Members who have not made all 5 picks for the current week.
--
-- Read-only; run it in the Supabase SQL Editor (it is not a migration).
--
-- "Current week" = the earliest week that is not COMPLETED, by Saturday date.
-- A member with no picks at all shows up with picks_made = 0, because the
-- picks join is a LEFT JOIN from profiles.
--
-- The deadline is not stored: it is Saturday 12:00 ET, derived the same way as
-- picks_revealed() in 0011, so `deadline_et` always agrees with the lock.
--
-- Every profile is listed, admins included; `role` is shown so you can skip
-- anyone who is not actually playing. Add `where p.role = 'member'` to hide them.
--
-- Ported from DegenNFL's src/lib/missing_Picks.sql. Left behind: the
-- 3-pointer flag and the stored final_lock_at column (neither exists here).
with current_week as (
  select id, week_number, saturday_date, status
  from public.weeks
  where status <> 'COMPLETED'
  order by saturday_date
  limit 1
)
select
  cw.id                                                  as week_id,
  cw.week_number,
  p.name,
  p.email,
  p.role,
  count(pk.id)                                           as picks_made,
  5 - count(pk.id)                                       as picks_missing,
  ((cw.saturday_date + time '12:00') at time zone 'America/New_York')
                    at time zone 'America/New_York'      as deadline_et,
  public.picks_revealed(cw.id)                           as locked
from current_week cw
cross join public.profiles p
left join public.picks pk
  on pk.user_id = p.id
 and pk.week_id = cw.id
group by cw.id, cw.week_number, cw.saturday_date, p.id, p.name, p.email, p.role
having count(pk.id) < 5
order by picks_made, p.name;
