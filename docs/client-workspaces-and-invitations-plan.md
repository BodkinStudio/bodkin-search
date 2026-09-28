# Client workspaces and invitations

Status: proposed implementation plan; no application or deployment changes made.

## Outcome

James can create a workspace for each client, move the client's existing projects into it, and invite people by email. Invitees default to Viewer and can access only workspaces where they hold an active membership. James can switch between his workspaces. YakChat's existing Growth plan, evidence, actions, integrations and analytics survive the transition.

## Product decisions and assumptions

- Reuse the existing `organization` entity as the workspace; do not introduce a second competing tenant model.
- A workspace contains projects. Membership grants access to all projects in that workspace. Project-specific sharing is outside the first release.
- Four roles: Owner, Admin, Editor, Viewer. No implicit cross-workspace access for platform administrators.
- Clients use application-managed authentication and email invitations. Cloudflare remains hosting/security infrastructure, rather than the client membership system.
- Recommend reusing the installed Better Auth organization/authentication capabilities, with verified email sign-in and an invitation acceptance flow. Validate the installed version's permissions and invite semantics before choosing extensions.
- Keep the existing live Access gate during development and staging. Removing that gate is a separate, reviewed cutover after application authentication and tenant enforcement pass. Public tracking paths retain their separate validation.
- Do not enable billing, create subscriptions, or issue new credit grants as a side effect of adding workspaces. Existing account entitlements must retain an explicit payer mapping; unsupported commercial operations fail closed until that mapping is defined.
- Preserve private/internal work in the current workspace. Move only the explicitly selected YakChat project and its dependent data into a new YakChat workspace.

## Permissions

| Capability                                                      | Owner                         | Admin | Editor                       | Viewer |
| --------------------------------------------------------------- | ----------------------------- | ----- | ---------------------------- | ------ |
| View workspace projects, Growth plans and aggregate analytics   | Yes                           | Yes   | Yes                          | Yes    |
| Edit plans, actions and ordinary project content                | Yes                           | Yes   | Yes                          | No     |
| Run research, crawls, AI tasks or other metered operations      | Yes                           | Yes   | Within workspace entitlement | No     |
| Manage integrations, tracking configuration and API credentials | Yes                           | Yes   | No                           | No     |
| Invite/remove Editors and Viewers                               | Yes                           | Yes   | No                           | No     |
| Appoint/remove Admins or transfer ownership                     | Yes                           | No    | No                           | No     |
| Delete workspace or change billing                              | Yes, with separate safeguards | No    | No                           | No     |

Personal journey inspection, customer exports and erasure remain separately restricted to authorized administrators and existing privacy settings. Viewer access does not expose credentials, raw personal telemetry, member-only internal notes, or mutation tools. Never remove/demote the last Owner. Editors/Admins cannot grant capabilities above their own.

## Existing code to build on

- `src/db/better-auth-schema.ts` and the Postgres equivalent already define organizations, members and invitations.
- `src/lib/auth-config.ts` disables invitations and organization creation to protect the one-user/one-workspace billing invariant. Do not simply change `invitationLimit`.
- `src/middleware/ensure-user/delegated.ts` and `src/server/auth/delegated-organization.ts` assign every Access user to `shared-workspace`.
- `src/middleware/ensureUser.ts` checks project ownership against one organization, but is not an action-level role gate.
- `src/middleware/ensure-user/hosted.ts` trusts the active organization from the session; revalidate current membership and workspace status on every protected request.
- `src/server/mcp/project-auth.ts`, API-key authentication, OAuth grants and billing resolution must agree on the authorized workspace for each operation. Eliminate first-membership assumptions.
- `src/serverFunctions/workspace.ts` currently lets any Access-authenticated user run a global legacy workspace merge. Disable this path before client access exists.
- `AnalyticsAccess` currently supports a deployment-wide administrator allowlist. Replace this with workspace-specific authorization for client mode.

## Delivery slices

### 1. Tenant and permission foundation

Inventory every read, write, export, file download, search, server function, REST route, MCP tool, AI tool and background job. Record its resource, tenant and required capability. Add a shared authorization service using the existing server-function → service → repository pattern. Resolve resource ownership server-side, check current membership, and enforce action-level permissions before business logic or billable calls.

Use normalized membership/invitation relationships, enforce unique workspace/user membership and valid roles, and mirror migrations for SQLite and Postgres. Scope nested identifiers, cache keys, R2 objects, Durable Object access, queued work, webhooks and provider integrations. A caller-supplied workspace/project ID is never authority. Give equivalent non-disclosing errors for inaccessible and nonexistent resources.

**Exit:** direct cross-workspace and Viewer mutation tests pass, including MCP/AI and background-job entry points. Keep invites disabled.

### 2. Safe ownership and data migration

Back up the live database and record project IDs, Growth record hashes, ownership links, integration references and analytics counts. Rehearse against a copy. Explicitly assign the current account Owner membership; do not make every historical Access user an owner/member.

Create YakChat's workspace and move its existing project with a transaction or resumable, validated migration appropriate to D1. Preserve project and dependent record IDs. Inventory tables that also store organization IDs, billing ownership, OAuth grants and storage references; move or rebind these deliberately. Personal Google/OAuth credentials must not become visible to clients or be blindly copied. Keep all other projects in the private workspace. Disable the global workspace-merge fallback and automatic membership creation in client mode.

**Exit:** hashes and relationships prove the Growth plan is unchanged; only intended ownership fields differ. Private projects remain inaccessible to the YakChat workspace. A reviewed rollback preserves isolation: never restore the old shared-access behavior while client accounts remain admitted.

### 3. Client authentication and invitations

Configure production application sessions, verified email and a working transactional email sender in staging first. Preserve `BETTER_AUTH_SECRET` and existing encrypted integration credentials. Reconcile Access user IDs with application identities through a verified migration; do not create duplicate owners or link accounts from untrusted email claims. Keep authenticated identity separate from connected Google/provider accounts.

Invite flow: workspace Settings → People → email and role (Viewer default) → Send invitation → recipient signs in/verifies the invited email → sees workspace/inviter/role → accepts → membership created → workspace opens. Existing users gain a membership rather than a replacement account or automatic default workspace. Invite-only users do not receive unrelated workspaces or trial credits.

Support pending, accepted, expired and revoked states; resend invalidates the old invitation. Acceptance must be atomic, single-use, bound to the verified recipient, and safe under concurrent requests. Recheck inviter authority at acceptance; revoked membership or reduced authority cannot leave privilege-granting invitations valid. Use expiring unguessable credentials with safe storage, rate limits and generic unauthenticated responses. Invitation links alone never authorize workspace reads. Record invitation and membership changes without logging secrets.

**Exit:** delivery and all invitation lifecycle tests pass. Invitees cannot enumerate workspaces before acceptance or accept under another email. Existing owner login still works.

### 4. Workspace and member UI

Add a workspace switcher listing only current memberships, then a project switcher within the selected workspace. Clear tenant-scoped client caches and sensitive panels on switching, logout and access revocation; stale tabs cannot write to the previous workspace accidentally.

Add People settings with member roles, pending invitations, resend, revoke, removal and ownership transfer. Clearly label the workspace and access being granted. Viewers see readable plans and aggregate reports without edit controls or metered-action buttons; server checks still enforce every restriction. Show an access-removed state when membership disappears.

Use existing components and approved product guidance through Bodkin UI. Cover loading, empty/no-membership, invitation send failure/retry, expired/revoked/wrong-account invitations, successful acceptance, forbidden actions and last-owner protection. Verify keyboard navigation, responsive settings tables and long names/emails. Retain the existing shadcn lint configuration and connect relevant checks to UI preflight.

**Exit:** an independent rendered review passes both the agency-owner and client-Viewer journeys, including mobile and error states.

### 5. Integrated verification and controlled rollout

Run focused tests while implementing, then one integrated independent security/code review and rendered UI review. Use one lead and at most one helper/reviewer, no recursive delegation, with two shared repair rounds. Run final repository checks and report unrelated baseline failures separately.

Stage two client workspaces plus a private workspace. Exercise the matrix below using real separate sessions and tokens. Verify email delivery and authentication callbacks on the intended hostname. Review the exact deployment and Access changes before cutover. Application authentication, CSRF/session protection and tenant checks must cover every previously Access-protected surface before admitting client traffic. Preserve security for worker aliases/preview URLs too.

Deploy compatible schema and application changes before enabling invitations. Migrate the owner/YakChat workspace, verify data preservation, then perform the reviewed client-authentication cutover. Invite one pilot Viewer; do not bulk invite clients until the isolation checks pass. Monitor authorization failures, invitation delivery and denied mutations. If rollback is needed, revoke/block client admission first and preserve new memberships and audit records.

## Required acceptance tests

- YakChat Viewer can see its saved Growth plan and aggregate analytics, and cannot list or access private/Bodkin projects by URL, API, export, search, chat or MCP.
- Viewer cannot edit via forged requests, invoke AI mutations, run paid research, connect providers, change tracking, invite people or access personal journeys.
- Every resource-ID path checks its owning workspace, including nested children and downloads.
- Membership removal and role changes take effect on subsequent requests despite existing sessions, API keys, OAuth tokens or open tabs. Define and test cache invalidation; queued user-authorized jobs recheck access before execution.
- Workspace switching cannot mix query results, credentials, billing customers or chat context across tenants.
- Invitations handle wrong account, unverified email, expiry, revocation, resend, replay, concurrent acceptance and inviter removal without granting unintended access.
- Last-owner removal/demotion is rejected even under concurrent requests. Privilege escalation through organization-plugin endpoints is denied.
- Multi-workspace requests bill the correct authorized payer; creating/joining a workspace cannot generate free grants or resurrect deleted billing customers.
- Existing YakChat project IDs, Growth contents, evidence, actions and analytics survive migration; all unselected projects remain private.
- SQLite and Postgres migration/service tests pass. Independent code and rendered UI reviews pass before client invitations are enabled.

## Out of scope for the first release

Public share links, per-project exceptions within a workspace, custom roles, enterprise SSO/SCIM, client subscription checkout and unrestricted self-service workspace signup. Do not include workspace deletion in the initial UI until its retention/billing and last-owner safeguards are implemented.

## Release decision

This is a security-sensitive feature, not an invite-button patch. Build isolation first and keep live client invitations disabled until the full authorization inventory, migration rehearsal, authentication cutover and independent reviews pass. Implementation may proceed with these defaults; any unresolved identity mapping, payer mapping or destructive data move is a specific release blocker to resolve before live changes.
