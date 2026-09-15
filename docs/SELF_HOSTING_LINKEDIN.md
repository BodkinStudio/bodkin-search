# Self-hosting LinkedIn Page analytics

LinkedIn Page analytics is disabled by default. It requires LinkedIn Community
Management development access and a read-only application before it can be
enabled.

Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and a 32-character-or-longer
`BETTER_AUTH_SECRET`, then explicitly set `LINKEDIN_PAGE_ANALYTICS_ENABLED=true`.
Register `${PUBLIC_ORIGIN}/api/linkedin/oauth/callback` as the OAuth redirect
URL. The integration requests only `r_organization_admin` and
`rw_organization_admin`; if LinkedIn grants a different scope, reconnect after
correcting the app's approved products and scopes.

The application encrypts grants in Better Auth's account table. It stores one
selected company Page per project and a Page-level overview cache for at most one
year. LinkedIn does not reliably issue programmatic refresh tokens, so an
expired or revoked grant requires reconnecting. Manual Page Content exports
remain available independently and are never mixed into API results.
