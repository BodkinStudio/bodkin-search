# Self-hosting YouTube connection

This connection-only slice lets a project member select one YouTube channel. It does not collect or display YouTube Analytics reports, video metrics, or MCP results.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET`, then add this exact redirect URI in the Google Cloud OAuth client:

| Deployment   | Redirect URI                                                 |
| ------------ | ------------------------------------------------------------ |
| Deployed     | `https://your-openseo-domain.com/api/youtube/oauth/callback` |
| Local Docker | `http://localhost:3001/api/youtube/oauth/callback`           |

## Prerequisites

Create a Google Cloud OAuth web client, enable **YouTube Data API v3**, and configure the consent screen. While the app is in Google testing mode, add each connecting Google account as a test user. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET` in the deployment environment, then restart the app.

The consent request uses identity scopes plus `https://www.googleapis.com/auth/youtube.readonly`; it does not request upload, advertising, monetary, or YouTube Analytics access.

## Connect and disconnect

Open Project settings → Integrations → YouTube, choose **Connect with Google**, then choose a channel and save it. The app stores only the selected channel ID, title, optional custom URL, connector provenance, and timestamps. OAuth tokens stay encrypted in Better Auth's account table.

Disconnect always removes this project's selected channel. It removes the matching Google grant only when the same user connected it and no other project still uses it; other grants and other members' grants remain untouched.

## Limitations and troubleshooting

This slice discovers channels through `channels.list?part=snippet&mine=true`. YouTube Studio channel-permission delegates cannot manage the channel through the YouTube API; connect as the channel owner or through a supported Brand Account owner/manager instead. Brand Account results should still be validated with the accounts used by your deployment.

If no channels appear, confirm that the API is enabled, the exact callback URI matches the deployment scheme/host/port, and the Google account has supported channel access. A 403 commonly means missing access or a disabled API; a 429 means quota or rate limiting; reconnect after an expired or revoked grant. YouTube Analytics, dashboard reports, and MCP access are planned separately.
