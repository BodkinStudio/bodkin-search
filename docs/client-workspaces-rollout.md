# Client workspace rollout

## Status and release gates

The migration tool is an **offline SQLite/D1-copy migration**, not a deployment command. It cannot contact Cloudflare or consume ambient credentials. The local rehearsal passed; this does not establish that the live database has the same contents. Keep the live Cloudflare Access gate and client invitations disabled until application authentication, isolation tests, independent code review and rendered UI review pass.

The Viewer Growth UI follow-up passed focused tests, lint, TypeScript and independent rendered review on 18 September 2026. Viewers no longer see editing controls, including through edit links, and receive a client-appropriate empty state.

Mail delivery and a workspace invitation template still need configuration. Do not remove Access to work around those missing dependencies. The hosted authentication cutover needs a separate reviewed deployment with a tested rollback. Preserve the existing Worker, D1 database, project identifiers and Growth content.

## Explicit identity and tenancy decisions

Record these choices before preparing a live migration:

- The existing owner **user ID**, verified by the operator. Never select or merge users automatically by email. The local rehearsal used `local-admin`; that is not the production identity.
- The exact source workspace ID and selected YakChat project ID (`765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc` in the current installation).
- A new target workspace ID and display name. Existing targets are rejected to avoid accidental workspace merges.
- Any selected workspace whose legacy `member` roles may become `editor`. No other workspace roles are rewritten.

The source configuration retains its existing payer when present, otherwise it explicitly becomes its own payer. The target inherits that same payer. Both workspaces receive an owner membership for the explicit existing owner. No subscription, credit grant or billing customer is created.

## Prepare a safe database copy

1. Quiesce writes for any production migration window, including scheduled jobs and workflows. Record current app version, schema version and workspace flags. Keep Access in place.
2. Export the intended D1 database using the existing authenticated operator workflow. Save the full export privately under ignored `.bodkin/` with mode `0600`. Do not print SQL, credentials, connection tokens or export download links. Keep an immutable backup separate from the working copy.
3. Restore into an offline SQLite copy under `.bodkin/`. For local D1, use Python's SQLite backup API, as the script's `--copy-from` option does; copying a live `.sqlite` file without its WAL is unsafe.
4. Inspect duplicates before applying the unique membership migration: `SELECT organization_id,user_id,count(*) FROM member GROUP BY organization_id,user_id HAVING count(*)>1`. Resolve duplicates deliberately; never discard rows automatically. Review all role values. Apply the reviewed workspace schema migration to the **offline copy**, including its membership uniqueness constraint. The script intentionally refuses a missing schema.
5. Run the dry run. All CLI arguments are explicit; there are no live database defaults.

```sh
python3 scripts/client-workspace-migration.py \
  --database .bodkin/workspace-rollout/working.sqlite \
  --owner-user-id EXISTING_OWNER_USER_ID \
  --source-org-id EXISTING_SOURCE_ORG_ID \
  --target-org-id NEW_YAKCHAT_WORKSPACE_ID \
  --target-name YakChat \
  --project-id 765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc \
  --evidence .bodkin/workspace-rollout/dry-run.json
```

Add `--normalize-legacy-org EXISTING_SOURCE_ORG_ID` only if that specific legacy-role conversion is approved. Add `--copy-from /absolute/path/to/source.sqlite` only when creating a fresh working copy; existing destinations are rejected.

The default transaction is rolled back. Add `--apply` to commit **only to the offline copy**. An exclusive, mode-0600 backup is created before every apply. Evidence contains row counts and SHA-256 hashes, not customer content.

## Preservation checks

The tool discovers every table with both `project_id` and `organization_id` and fails if that inventory differs from the reviewed list:

- `gsc_connections`
- `ga4_connections`
- `youtube_connections`
- `linkedin_page_connections`

Only the selected project and its rows in those tables change tenant. All project-only children, including Growth and analytics, retain their IDs and content. Organization-only state, other projects, credentials, sessions, billing and onboarding are preserved. Every non-control table is hashed before/after; only the selected rows' intended organization field is excluded. Existing control rows are checked against the exact permitted owner/legacy-role updates. Foreign-key failure or content mismatch rolls back the transaction. The complete dependency inventory is rediscovered on every run.

The current local rehearsal moved one project and three connections (GSC, GA4, YouTube; no LinkedIn row). All protected table hashes matched and the foreign-key check passed. Evidence is in `.bodkin/runs/2026-09-17-client-workspaces/migration/`. The rehearsal did not move projects in the active local D1 database. Local development separately received schema migrations through 0078 and an explicit owner membership for preview testing. Run focused checks with `python3 scripts/client-workspace-migration-test.py`.

## Production application and rollback

This tool deliberately does **not** import an entire copy over a live D1 database, emit unattended live commands or run remote migrations. A reviewed maintenance-window application mechanism is still required. Rehearse that mechanism against an isolated D1 database from a fresh export before applying it to production. Do not replace live data with an older local rehearsal snapshot. Repeat hashes against the fresh production snapshot and verify the exact selected project and all Growth rows after applying.

For rollback, retain the original snapshot and deployed app version. Before clients or new writes are admitted, restore the maintenance-window snapshot with the tested provider restoration procedure. After clients have written data, do not restore an old database blindly: stop writes and prepare a reviewed forward repair that preserves new records. Turning off client mode alone is not a safe tenancy rollback because legacy shared-workspace behavior may expose clients to shared data; keep clients blocked at Access until the rollback is verified.

Postgres is **not supported by this script**. The app schema supports it, but a Postgres migration needs its own transaction, backup/restore rehearsal and equivalent content checks. Do not convert a production Postgres database to SQLite or claim that this rehearsal validates Postgres.

## Authentication cutover and first client

1. Keep the same existing owner user row and ID. Establish email/password authentication on that row using a verified password-reset flow; do not create a replacement owner, change identifiers or automatically link another provider account by matching email. Verify the installed authentication configuration supports that reset before proceeding.
2. Test hosted sign-in and verified email delivery on a staging deployment, including owner recovery. Configure invitation delivery/template and the canonical HTTPS app URL. Keep public signup restricted according to the approved rollout policy.
3. Confirm the owner sees both workspaces and the selected project remains usable. Verify anonymous, viewer, editor and admin boundaries at server functions, direct endpoints, MCP, jobs, caches and realtime paths.
4. Review Access changes separately: authentication callbacks and required app-auth routes must work, while preview aliases and administration stay protected. Do not widen Access before application-level authorization is proven.
5. Enable invitations only after the gates pass. Invite one explicitly nominated YakChat client as Viewer, test acceptance, expiration, replay, revocation and workspace switching, and confirm that neither navigation nor guessed URLs reveal the agency's other workspaces.
6. Compare the production Growth baseline and connection ownership again. Monitor authorization failures and mail failures before inviting more clients.

### Preflight before the constraint migration

Before applying 0077/0078 to the offline SQLite copy, run:

```sh
python3 scripts/client-workspace-migration.py schema-preflight --database .bodkin/workspace-rollout/before.sqlite
```

This reads membership duplicates and role domains, invitation role/status domains, and existing workspace status values. Unknown values stop the procedure before table rebuilds. Investigate each row and agree an explicit correction or revocation; do not delete or coerce unknown records automatically. `member` is retained as a legacy schema value and is normalized to Editor only in explicitly selected workspaces during the data move.

The final local rehearsal applies 0078 to a fresh copy, proves every existing table's row hash is unchanged by the rebuild, then repeats the workspace move, dry-run rollback, protected-content hashes and foreign-key check. Repeat this exact sequence on a fresh live export before release.

### Email templates and staged authentication

Set `WORKSPACE_APP_URL` to the canonical HTTPS application origin. Configure Loops transaction templates for `LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID`, `LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID`, and `LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID`, plus the existing `LOOPS_API_KEY` secret. The invite template receives `workspaceName`, `inviterName`, `role` and `invitationUrl`; include the workspace/role and a single “Accept invitation” link. State that the link expires in seven days. Never put the invitation URL in analytics or public logs.

For the staged selfhost deployment, build and run with matching `AUTH_MODE=hosted` and `CLIENT_WORKSPACES_ENABLED=true`. Alchemy retains the existing Cloudflare Access application and uses the custom hostname for the auth origin. This is a staging step, not the public client cutover: external clients still cannot enter until the separate Access review passes. Client mode uses email sign-in and only permits new registration when the email has a pending invitation; verified email remains required. Existing owners establish credentials through the verified reset flow, preserving their original user ID.

Client mode currently disables paid automation, scheduled rank/Growth jobs, MCP/chat, external OAuth linking and billing changes. Stored reports and supported content edits remain available. Extending those operations requires explicit actor/payer authorization; workspace creation and invitations do not provision subscriptions or credits.
