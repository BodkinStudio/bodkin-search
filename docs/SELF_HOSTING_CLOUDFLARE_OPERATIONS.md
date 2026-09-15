# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Save.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

### ChatGPT

Create a personal app/plugin in ChatGPT with the MCP URL above, OAuth authentication,
and Dynamic Client Registration. Use the HTTPS callback shown by ChatGPT when
available. ChatGPT uses either `https://chatgpt.com/connector/oauth/{callback_id}`
or `https://chatgpt.com/connector_platform_oauth_redirect`; see its
[authentication documentation](https://developers.openai.com/plugins/build/auth).
Cloudflare can allow the first form with `https://chatgpt.com/connector/oauth/*`
when ChatGPT does not expose the generated callback during setup. Localhost and
loopback callbacks are not needed for ChatGPT.

After connecting, refresh the plugin's actions if the list is initially empty.
Open a fresh chat, select the plugin, and ask it to call `whoami`, `list_projects`,
and `get_project_context` for one saved project. These are free reads. The shared
self-hosted workspace is not a project-specific client portal: an allowed account
can access all projects, and the MCP also exposes write and paid research tools.

### Preserve OAuth when updating

Managed OAuth is currently configured in the Cloudflare dashboard, outside the
installed Alchemy Access application's supported properties. That provider sends
a PUT when its managed application fields change and does not include the OAuth
configuration. Preservation of dashboard OAuth settings across such updates has
not been verified. Record the enabled state, callback allowlist, local callback
toggles, and token lifetimes before changing the Access application; check and
restore them afterward if necessary.

After deployment, verify that `/.well-known/oauth-authorization-server` returns
JSON, an unauthenticated `/mcp` request with `Accept: application/json` returns
`401` with a Bearer challenge, and the connected client can still read a saved
project. Discovery alone does not prove authentication or tool execution works.

## Troubleshoot MCP 502 errors

If discovery succeeds but tool execution returns 502, inspect the Worker's persisted
Observability events for the matching request time and `/mcp` path. Do not assume
the failure comes from OAuth or the analytics provider. An empty live tail is not
proof that the request never reached the Worker.

An `exceededCpu` outcome with `Worker exceeded CPU time limit` identifies a
Workers resource failure. The free plan allows only 10 ms of CPU per request;
waiting for network responses does not count toward CPU time. MCP discovery and
schema processing can exceed this limit before a tool executes. Cloudflare may
return 503 while the connector reports 502.

Check the account's Workers plan before changing code or authentication settings.
Workers Paid starts at $5/month plus usage and has a higher default CPU limit;
review the [current pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [CPU limits](https://developers.cloudflare.com/workers/platform/limits/).
Upgrading creates a paid subscription and requires the account owner's approval.
After activation, retry `whoami` and a read-only analytics request from the actual
client, then verify the corresponding Worker events completed successfully.
An upgrade alone is not a passed connection test.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
