-- ============================================================================
-- 0012_delete_preseason_weeks.sql
--
-- Delete the two preseason dry-run weeks, week-2026-09-12 and week-2026-09-26,
-- with their games and picks.
--
-- Every pick week now lies inside a season segment (SEASON_START 2026-10-06,
-- first pick week 2026-10-10; see src/lib/segments.ts). These two weeks fall
-- outside all three segments, so their picks were inflating season totals
-- while appearing in no segment table.
--
-- games.week_id and picks.week_id both cascade from weeks, but the child rows
-- are deleted explicitly so the counts are visible when this runs. It is one
-- transaction: all or nothing.
--
-- PERMANENT. Run the pre-flight first and note the counts.
--
-- Safe to run more than once: a second run deletes nothing.
-- ============================================================================

-- Pre-flight (run on its own first):
--
--   select w.id,
--          (select count(*) from public.games g where g.week_id = w.id) as games,
--          (select count(*) from public.picks p where p.week_id = w.id) as picks
--   from public.weeks w
--   where w.id in ('week-2026-09-12', 'week-2026-09-26');

begin;

delete from public.picks
where week_id in ('week-2026-09-12', 'week-2026-09-26');

delete from public.games
where week_id in ('week-2026-09-12', 'week-2026-09-26');

delete from public.weeks
where id in ('week-2026-09-12', 'week-2026-09-26');

commit;

-- Verify — every count should be 0, and no week should sit before 2026-10-10:
--
--   select
--     (select count(*) from public.weeks where saturday_date < date '2026-10-10') as early_weeks,
--     (select count(*) from public.games where week_id in ('week-2026-09-12', 'week-2026-09-26')) as games,
--     (select count(*) from public.picks where week_id in ('week-2026-09-12', 'week-2026-09-26')) as picks;
