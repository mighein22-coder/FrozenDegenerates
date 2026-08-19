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

Tick the box above once the pool admin has run it against production.

## Known gaps not covered here

- `profiles` has no `INSERT` policy in the schema as documented in
  `PLANNING.md`. Self-service signup (`useAuth.signUp`) writes the profile row
  from the client, so it needs either an INSERT policy or a
  `handle_new_user()` trigger on `auth.users`. Worth settling as part of the
  signup work rather than bolting onto this migration.
- Changing a member's email still has to be done by an admin. Doing it in-app
  needs Supabase's confirm-change flow plus a trigger keeping
  `profiles.email` in sync with `auth.users.email`.
