# Database migrations

SQL that has to be applied to the Supabase project by hand. There is no
Supabase CLI wired into this repo yet, so these are **not** applied
automatically by any build or deploy step.

## Applying a migration

1. Open the Supabase dashboard for the IcePick project.
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of the migration file and run it.
4. Run the verification queries in the comment block at the bottom of the
   file and confirm the expected results.

Migrations are written to be idempotent, so re-running one is safe.

## Status

| Migration | Applied? | What it does |
| --- | --- | --- |
| `0001_lock_profile_privileged_columns.sql` | ☐ not yet | Stops a member from promoting themselves to `admin` by editing their own `profiles` row |
| `0002_allow_signup_profile_insert.sql` | ☐ not yet | Lets a new user create their own `profiles` row at signup, without being able to set `role` |

Tick the boxes above once the pool admin has run them against production. Apply
them in order — 0002 assumes 0001 is already in place.

## Signup and email confirmation

`0002` covers the signup flow the app actually implements today: the client
inserts its own `profiles` row right after `supabase.auth.signUp()`.

**That only works with email confirmation turned off** (Authentication →
Providers → Email → "Confirm email"). With confirmation on, `signUp()` returns
no session, so the insert arrives unauthenticated, `auth.uid()` is NULL, and
RLS refuses it — no INSERT policy can rescue a request that carries no
identity.

If the pool wants confirm-on-signup, the profile row has to be created
server-side instead, by a `SECURITY DEFINER` trigger on `auth.users` that
reads the display name out of `raw_user_meta_data`. That replaces the client
insert in `useAuth.signUp` rather than sitting alongside it, so it is a
different change, not an addition to `0002`.

## Known gaps not covered here

- Changing a member's email still has to be done by an admin. Doing it in-app
  needs Supabase's confirm-change flow plus a trigger keeping
  `profiles.email` in sync with `auth.users.email`.
- `games` and `picks` still need the RLS review described in ASSESSMENT.md
  item #10.
