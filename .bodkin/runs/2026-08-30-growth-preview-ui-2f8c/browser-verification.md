# Final preview browser verification

Date: 30 August 2026. Local URL: `http://127.0.0.1:3217/p/growth-preview/growth`.
The in-app browser used the disposable launcher's local project. No real project, provider or model credentials were supplied. The inherited setup modal was dismissed; its existing API-key banner remains, while the Growth disclosure explicitly says no API key is needed for this sample.

## Final-source observations

- Default entry shows the example.com sample disclosure before the data. Pricing is the only initially flagged page.
- Selecting All sample pages exposes six outcomes. Selecting Growing page shows 224 baseline and 336 current clicks, and explicitly says the rule is not a general SEO-health assessment.
- Filtering for `incomplete` selects the only matching page, removes the unrelated Pricing detail and shows two Unavailable values. At 390px, each metric column's scroll width and client width were both 154px.
- A zero-match query removes the selected evidence and shows No pages match this filter. Reset filters clears the query, selects All sample pages and restores six list buttons.
- Pricing agrees with the detector/packet: 308 baseline clicks, 140 current clicks, 168 lost clicks, -54.5%, commercial weight 3 and priority score 504.
- At 390x844, clicking Pricing focuses its detail heading and brings it into view (heading top 223px). Back to page list focuses the list heading and brings the controls into view (heading top 175px).
- Current sample context, partial selected history and the non-causal explanation are separately readable. Expanding the native source disclosure reveals both complete identifiers and all five limitations. At 390px the document scroll width remains 390px; identifiers wrap.
- The filter, scope select, page button, return button and native disclosure summary are enabled native controls with `tabIndex: 0`. Selection/return focus effects were observed, not inferred from screenshots. Synthetic Tab/Enter delivery did not produce reliable browser default actions, so a complete keyboard-only traversal is **not claimed**. The native-control contract and focus behavior are covered, but a manual keyboard smoke check remains useful.

## Request-state fault injection

Only the task-owned temporary snapshot's `src/serverFunctions/growthPreview.ts` was temporarily changed. The real project middleware and request validator remained intact. A one-shot delayed rejection exercised the unchanged client pending/error states; a real click on Retry preview loaded the sample packet and removed the alert. A second delayed request provided an unobstructed loading capture.

The temporary handler was restored immediately after capture. `cmp` returned exit 0 against the repository's original server-function source. The live preview returned to normal Pricing evidence. No test fault, artificial delay or debug control was added to application source.

## Reload-loop repair

Earlier contradictory browser captures were caused by the disposable launcher, not established browser-host behavior. Omitting `.gitignore` allowed Tailwind's source scanner to watch the temporary D1 database and Wrangler registry. Ordinary writes therefore emitted Vite full reloads. The launcher now preserves the tracked ignore file and appends snapshot-only runtime exclusions.

Independent observations before repair: eight `full-reload` messages in 30 seconds. After repair: zero in 30 seconds (07:22:56.269–07:23:26.282 UTC). The actual Tailwind scanner found 939 source files and zero runtime files; a regression test reproduces this without copying `.git`. Subsequent mobile, filtering, provenance and retry flows stayed stable. The intentional source edits used for request-state testing are separate from that idle stability observation.

## Evidence boundary

The screenshot manifest names only inspected final-source captures and records their actual dimensions (877x830, 1440x1000 and 390x844). Earlier wrong-page, setup-modal-obscured and pre-final captures are excluded. This verifies a fixture-backed preview, not live-site usefulness, provider connectivity, production authentication end-to-end, or full Growth Gate 2.
