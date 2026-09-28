# Local vs production workflow

How a change travels from a working tree to the live Bodkin Search instance,
what each environment actually is, and the gotchas learned shipping the Growth
Plan (September 2026). Read this before touching migrations or deploying.

## The environments

| Environment            | Database                                     | Auth                               | How to run                                                       | What it is for                                                                        |
| ---------------------- | -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Local dev              | wrangler local D1 (`.wrangler/`)             | local                              | `pnpm dev`                                                       | Day-to-day development with your own data                                             |
| Growth preview         | disposable local D1, seeded sample project   | `local_noauth`                     | `node scripts/growth-preview.mjs --port 3217`                    | Show a feature quickly with no credentials; runs from a snapshot of git-tracked files |
| Local Postgres         | Docker `openseo-postgres` on port 5433       | local                              | `docs/LOCAL_POSTGRES.md`                                         | Prove migrations and Postgres-gated tests before touching the hosted stage            |
| PR preview             | fresh stage `pr-<n>` on Cloudflare           | Cloudflare Access                  | opens automatically on a PR (`.github/workflows/pr-preview.yml`) | Live URL per PR, connect real Google accounts to it                                   |
| Self-hosted production | D1 `open-seo-db-selfhost`                    | Cloudflare Access, `.env.selfhost` | `pnpm deploy:selfhost --yes`                                     | **The live Bodkin instance (search.bodkin.studio)**                                   |
| Hosted production      | Postgres via Hyperdrive, stage `hosted-prod` | hosted OAuth, `.env.production`    | `pnpm deploy:postgres`                                           | The openseo.so SaaS stage; not the Bodkin instance                                    |

Two things people get wrong:

- The Bodkin instance is the **self-hosted D1 stage**, not the Postgres one. The
  migration that runs on deploy is the D1 chain in `drizzle/`, applied by
  Alchemy from `migrationsDir: "drizzle"`, tracked in the `d1_migrations` table.
- The Growth preview copies only **git-tracked** files. New files must be at
  least intent-added (`git add -N <path>`) or the preview will not see them. It
  runs from a snapshot, so source edits need a restart.

## Migrations

Both providers must stay in step. Schema modules live in `src/db/*.schema.ts`
with a Postgres twin under `src/db/pg/`, exported from three barrels
(`src/db/schema.ts`, `src/db/d1/schema.ts`, `src/db/pg/schema.ts`) and checked
by `src/db/schema-parity.test.ts`.

1. Edit both schema modules.
2. `pnpm db:generate` writes `drizzle/NNNN_*.sql` and `drizzle-pg/NNNN_*.sql`
   plus snapshots and journal entries. Never hand-write a migration; you may
   hand-guard a generated one (see below) and must say so in a comment.
3. Read the generated SQL for both providers. drizzle-kit makes different
   choices per dialect and both must be correct.
4. Prove D1 by replaying every migration into an in-memory libsql and, for
   anything that rebuilds a table, by importing a backup of the live database
   into a throwaway local D1 (`--persist-to <tmp>`) and running
   `wrangler d1 migrations apply DB --local --persist-to <tmp>`.
5. Prove Postgres from scratch in the Docker container with the documented
   `pnpm db:migrate:pg`. drizzle-kit runs the whole chain in one transaction and
   swallows the error text; if it fails, run the drizzle-orm migrator directly
   to see which statement broke.

### D1 table rebuilds

SQLite cannot add a foreign key or drop NOT NULL in place, so drizzle-kit
rewrites the table: create `__new_x`, copy, drop `x`, rename. D1 keeps foreign
keys enforced inside the migration, so the drop cascades into every table that
references `x`. The repo's pattern (`drizzle/0050_wet_omega_red.sql`,
`drizzle/0071_married_zaladane.sql`) snapshots the dependents into `__plan_*`
tables first and restores them after the rename, inside
`PRAGMA defer_foreign_keys=ON`.

Restores must be `INSERT OR IGNORE`. Rows that reference the rebuilt table
only through a **nullable** column survive the drop, and a plain `INSERT`
inserts them a second time. This is what broke the first Growth Plan deploy
(`growth_ai_briefs.approved_action_id`).

Split a change into "add columns and new tables" then "rebuild" when
drizzle-kit's rebuild would `SELECT` columns that do not exist yet.

### Postgres ordering

drizzle-kit can emit a foreign key before the unique index it depends on
(`drizzle-pg/0040`). A fresh database then cannot be provisioned. Always run
the from-scratch check in step 5; a database that was migrated incrementally
will not show the problem.

## Shipping a feature

1. Baseline first: `npx tsc --noEmit` and `npx vitest run` on the untouched tree,
   so you know which failures are pre-existing. `GrowthPreviewRender.test.ts`
   fails on a `cloudflare:workers` import; the MCP protocol tests are slow and
   carry a 20s budget.
2. Build, then `pnpm ci:check` (prettier, knip, tsc, oxlint, plugin skill sync).
   knip fails on any unused export, including contract schemas nothing imports
   yet.
3. Review before verify: a fresh reviewer over the diff, then fix. Two rounds
   was the norm for the Plan work.
4. Verify in a browser on the Growth preview, driving the real forms, and on
   local Postgres for anything touching the database.
5. Commit in slices that each make sense (schema and services, then UI), with
   journals matching the migration files in the same commit.
6. Push and open the PR. GitHub Actions is enabled but has never recorded a run
   in this repository, so PRs currently show no checks; run `pnpm ci:check` and
   the suite locally until that is fixed.
7. Back up production D1 before a deploy that migrates:
   `npx wrangler d1 export open-seo-db-selfhost --remote --output <file>`.
   The export is not directly restorable: its `d1_migrations` table lacks the
   `applied_at` default and inserts precede parent tables, so a restore needs
   `PRAGMA foreign_keys=OFF` and the migrations table recreated in wrangler's
   shape.
8. Deploy: `pnpm deploy:selfhost --yes`. It runs the preflight, builds, applies
   pending D1 migrations, uploads the worker. If a migration fails the worker
   has usually already been uploaded, so the new code is live against the old
   schema: fix forward quickly, do not roll back the worker.
9. Verify on the live database, not by eye:
   ```
   npx wrangler d1 execute open-seo-db-selfhost --remote --json \
     --command "select name from d1_migrations order by id desc limit 3"
   npx wrangler d1 execute open-seo-db-selfhost --remote --json \
     --command "PRAGMA foreign_key_check"
   npx wrangler deployments status --name open-seo-selfhost
   ```
   Then check the row counts of anything a rebuild snapshotted and that no
   `__plan_*` or `__new_*` tables remain.

## MCP tools across environments

- Reads are visible everywhere. Writes sit behind operation scopes
  (`growth:change:create`, `growth:plan:write`).
- The self-hosted transport grants every supported scope to the operator, who
  is already behind Cloudflare Access. `local_noauth` (the Growth preview) also
  grants them. Hosted OAuth and API keys grant only the read scopes unless the
  client consents to more.
- Chat clients cache the tool list per connection. After a deploy that adds
  tools, disconnect and reconnect the connector and start a new chat. Ask it to
  call `whoami`: the reply lists the token scopes, which separates a server
  problem from a client one.
- ChatGPT hides tools that are not marked read-only unless Developer mode is on
  (Settings, Connectors, Advanced). Write tools are honestly annotated, so they
  only appear there.
- Writing a plan from a chat: use the prompt pattern in
  `docs/growth/` (workstreams, actions with targets and evidence, series on
  measured evidence, fresh request keys per call, `growth_get_plan` to verify).
