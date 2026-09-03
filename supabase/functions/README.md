# Supabase Edge Functions — export from the live deployment

Exported from the **live deployment** of Supabase project `fhrqkhdrwbfnizkepkch`
on **31 Aug 2026**, via the Supabase MCP (`list_edge_functions` /
`get_edge_function`). Files were written byte-for-byte as the API returned them:
no reformatting, no typo fixes, no added or removed comments.

## What was exported

| Slug | Deployed version | Path written |
| --- | --- | --- |
| notify-signup   | v14 | `notify-signup/index.ts` |
| notify-feedback | v11 | `notify-feedback/notify-feedback/index.ts` |
| notify-signin   | v12 | `notify-signin/notify-signin/index.ts` |
| stripe-webhook  | v8  | `stripe-webhook/index.ts` |
| notify-review   | v4  | `notify-review/index.ts` |
| notify-expiry   | v1  | `notify-expiry/index.ts` |
| notify-invite   | v3  | `notify-invite/index.ts` |

Note the nested paths for `notify-feedback` and `notify-signin`: the deployment
API returns those two files under a filename that already carries the slug
directory (`notify-feedback/index.ts`), so the export preserves that layout
rather than silently flattening it. Everything else returns a bare `index.ts`.

## These files are an EXPORT

The deployed function remains **authoritative**. This directory is a snapshot
taken for auditability — it records what was running on 31 Aug 2026. It does not
become the source of truth until someone re-deploys from this directory, at
which point the deployed version and these files are in step again. Until then,
treat any difference between a file here and the live function as the live
function being right and this snapshot being stale.
