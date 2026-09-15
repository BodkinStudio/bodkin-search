# Bodkin Search: local development and live releases

Production is the source of truth for client work. Local development has separate
test data. We release code and database migrations; we do not synchronise the two
databases.

| Environment                  | Purpose                                                  | Storage and configuration                                                                                  |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Local                        | Build and test features with clearly named test projects | Local D1 emulation under `.wrangler/state`; `.env.local`; `AUTH_MODE=local_noauth`                         |
| Live, `search.bodkin.studio` | Real projects, integrations, approvals and measurements  | Cloudflare D1 `open-seo-db-selfhost`; Alchemy stage `selfhost`; private `.env.selfhost`; Cloudflare Access |

The current local port is 3219. Start it with `pnpm dev --port 3219`; check for
an existing server first. Port 3001 may belong to another application.
`wrangler.jsonc` describes local/Docker bindings. Its database ID is not the live
selfhost database ID. Keep local bindings local.

## Normal change process

1. Work on a feature branch. Preserve unrelated uncommitted changes; do not treat
   a dirty workspace as a reviewed release. Record exactly which changes are
   included in the build.
2. Generate migrations for both SQLite and Postgres when changing the schema.
   Inspect the SQL, then run `pnpm db:migrate:local`. Use synthetic test data to
   exercise draft, validation, save and reload behavior.
3. Run focused tests while developing, then `pnpm ci:check`, `pnpm test:ci` and
   the selfhost production build at the release checkpoint. Review the changed
   workflow in the browser.
4. Before a live migration, confirm the account and exact database with
   `pnpm exec wrangler d1 list --json`. Record a fresh recovery bookmark using
   `pnpm exec wrangler d1 time-travel info <verified-database-uuid>` in a private
   release record. Do not paste credentials into release notes.
5. Release with `pnpm deploy:selfhost`. This runs the preflight, builds the
   selfhost app, checks types and deploys the `selfhost` Alchemy stage. Alchemy
   applies the migrations in `drizzle/`. Do not substitute `deploy`,
   `db:migrate:prod`, or the `hosted-prod` stage: those are different paths and
   are not this installation's release process.
6. Check the live page, a saved project read, and the MCP OAuth checks in
   [the operations guide](../SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#preserve-oauth-when-updating).
   Do not create client approvals just to smoke-test a deployment.

When a build has already passed for the exact reviewed workspace, the deployment
step alone is `pnpm alchemy deploy --env-file .env.selfhost --stage selfhost`.
Any subsequent application edit requires rebuilding before using that shortcut.

## Data and recovery

Keep API keys, OAuth grants and real client decisions in production. A production
export is an exceptional debugging aid: copy only the needed data, remove secrets
and personal data, and load it into a disposable local fixture. Never upload the
local database over the live database. Local IDs and client records can diverge;
that is expected.

Prefer additive schema changes so the previous application can still run. A code
rollback and a database restore are different operations. Restoring a D1 bookmark
also removes legitimate writes made after that point, so assess those writes and
agree on recovery before restoring. Do not destroy the Alchemy stack to roll back
an application release.

Cloudflare documents [independent local D1 development](https://developers.cloudflare.com/d1/best-practices/local-development/),
[migration tracking](https://developers.cloudflare.com/d1/reference/migrations/),
and [Time Travel recovery](https://developers.cloudflare.com/d1/reference/time-travel/).
