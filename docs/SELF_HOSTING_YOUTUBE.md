# Self-hosting YouTube connection

This integration lets a project member select one YouTube channel and view its read-only channel, top-video, and traffic-source performance in the dashboard or through MCP. It does not upload, publish, manage comments, access advertising or monetary data, or expose traffic-source referrer details.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET`, then add this exact redirect URI in the Google Cloud OAuth client:

| Deployment   | Redirect URI                                                 |
| ------------ | ------------------------------------------------------------ |
| Deployed     | `https://your-openseo-domain.com/api/youtube/oauth/callback` |
| Local Docker | `http://localhost:3001/api/youtube/oauth/callback`           |

## Prerequisites

Create a Google Cloud OAuth web client, enable **YouTube Data API v3** and **YouTube Analytics API**, and configure the consent screen. While the app is in Google testing mode, add each connecting Google account as a test user. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET` in the deployment environment, then restart the app.

The consent request uses identity scopes plus `https://www.googleapis.com/auth/youtube.readonly` for channel discovery and `https://www.googleapis.com/auth/yt-analytics.readonly` for reporting. Both scopes are read-only. OpenSEO does not request permission to upload videos, manage the channel, or access advertising or monetary data. Existing YouTube connections made before Analytics was added must reconnect to grant the new reporting scope.

## Connect and disconnect

Open Project settings → Integrations → YouTube, choose **Connect with Google**, then choose a channel and save it. The app stores only the selected channel ID, title, optional custom URL, connector provenance, and timestamps. OAuth tokens stay encrypted in Better Auth's account table.

Disconnect always removes this project's selected channel. It removes the matching Google grant only when the same user connected it and no other project still uses it; other grants and other members' grants remain untouched. Channel, video, and traffic-source data is retrieved on demand; OpenSEO does not store report rows.

## Limitations and troubleshooting

This slice discovers channels through `channels.list?part=snippet&mine=true`. YouTube Studio channel-permission delegates cannot manage the channel through the YouTube API; connect as the channel owner or through a supported Brand Account owner/manager instead. Brand Account results should still be validated with the accounts used by your deployment.

If no channels appear or reports fail, confirm that both APIs are enabled, the exact callback URI matches the deployment scheme/host/port, and the Google account has supported channel access. A 403 commonly means missing access or a disabled API; a 429 means quota or rate limiting; reconnect after an expired or revoked grant. Reports cover the last 28 completed Pacific-time days by default. MCP exposes `get_youtube_channel_overview`, `get_youtube_video_performance`, and `get_youtube_traffic_sources`.
