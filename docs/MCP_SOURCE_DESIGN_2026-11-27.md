# Safety Lab reads from an MCP server (TD-11), 27 Nov 2026

## Why

Waqas to Violet Labs, 6 Nov 2026: "Safety Lab will pull the Jama and GENESYS data from Violet's MCP on its own
schedule, so nothing needs to be pushed to our API from your side", "every change that comes in through Violet waits in
Safety Lab until an engineer accepts it, and nothing leaves Safety Lab unless an engineer pushes it". 27 Nov 2026: build
it as a general connection (any MCP server, not only Violet's), with the engineer choosing what is brought in, a timed
check, the token in the server's vault, read only, tested against a stand-in server until Violet answers SL-IG-0001.

## What it is

One more tool on the Connections engine (site/alm_engine.js), id `mcp`, beside Polarion, Codebeamer, DOORS Next and
Cameo. Everything after the read is the engine's and unchanged: lines in Incoming changes, accept and sign, the owner
lock, History.

- **Read only.** The driver has no update, create, link or comment. `readOnly: true` makes `sendOn()` false, `send()`
  refuse, Ready to send empty, and `canOwn: false` stops an admin making Safety Lab the owner of what the server owns.
- **Readers.** An MCP server names and shapes its own tools, so the connection says how to read it, as one or more
  readers (one per kind of data behind the server, for example Jama and GENESYS). Each reader names three tools: the one
  that lists what can be read (optional), the one that lists the items of one source, the one that returns one item
  (optional). Argument names are filled from each tool's own `inputSchema`; field names are found from the usual names
  and can be said under Details.
- **Ids.** A source is `<reader key>|<the server's source id>`. An item is `<reader key>:<the server's item id>`. The
  reader key is set from the reader's name once, before the first save, and never changes after.
- **Protocol.** Streamable HTTP. `initialize`, then `notifications/initialized`, then `tools/list` and `tools/call`.
  Versions 2025-06-18, 2025-03-26, 2024-11-05. A session id is carried when the server gives one; a lost session (404,
  or 400) is one new handshake. An answer may be JSON or an event stream.
- **Paging.** By cursor (`nextCursor` and the like) or by offset to the total, read from the tool's description. A server
  that does not turn the page is noticed. 500 pages at most in one check; past that the source is partial and nothing
  from it is called missing.
- **The timer.** Every tool can now be checked again every N minutes while the project is open (this computer, like
  "check when this project opens"). An MCP server starts at 15 minutes; the others at 0 (never) unless asked. A hidden
  tab waits. The check is quiet. Staging lives in the open app, so there is nothing for a server to do while nobody has
  the project open.

## The fence (the same text in three places; tests compare them)

`almRequestProblem(tool, method, url, savedHost, headers, meta, body)` in site/alm_engine.js, the AI proxy's worker.js
and the desktop's bridge_main.js. For `mcp` it calls `mcpRequestProblem`:

- https, the host saved with the login, and exactly the path saved with the login; no query string;
- POST only;
- the body is one JSON-RPC message (no batch);
- the method is `initialize`, `notifications/initialized`, `ping`, `tools/list`, or `tools/call` of a tool whose name
  was saved with the login (`meta.tools`, the names joined by spaces);
- only MCP's own headers pass (`accept`, `content-type`, `mcp-protocol-version`, `mcp-session-id`).

So the token can never be used for another address, another method or another tool, even by a page that has been
tampered with. Choosing a new tool in Connection settings needs the token typed once more, because the tool names are
saved with the login. The relay writes the message out again from what the fence read, so a message written to read two
ways is sent the one way it was checked.

## Where the token lives

Per person, like every other connected tool. On a Safety Lab server: the vault, kind `mcp_token`
(supabase/migrations/20261127b_mcp_secret_kind.sql; kit file 31, identical). On the desktop: the OS keychain, kind
`mcp` (shell_rules.checkSecret: a public or approved host, a path, well-formed tool names). The relay
(`/v1/ai/bridge?tool=mcp&raw=1`) puts it on the request as a Bearer token and hands back the answer and the session
id. An event stream is read only until the answer to that request has arrived, then let go. A browser-only session
cannot connect.

On a customer's own server, an MCP server inside their network is named in `BRIDGE_INTERNAL_HOSTS` (ai-proxy.env), the
same setting as an internal Jama.

**Not yet on the all-in-one server or the appliance, for web users.** install.sh gives that AI service no database
address and no service key (no SUPABASE_URL, no SUPABASE_SERVICE_ROLE_KEY), so there it cannot read a saved login or
answer the API. Desktop users are not affected: the desktop makes the call itself, from the keychain. See HANDOFF,
27 Nov 2026 (later). Waits for Waqas's decision.

## Not built

- Writing through an MCP server (waits on who owns a record on write-back, SL-IG-0001 section 4).
- More than one MCP server per project (one login kind per person).
- Sign-in other than a Bearer token (waits on Violet's answer).
- Sources inside sources (a project, then its sets): today the tool that lists sources takes fixed arguments.

## Tests

- tests/regression_mcp_source_20261127.test.js: the real engine against a stand-in MCP server (a Jama with offset
  paging and folders, a GENESYS with cursor paging and text-only answers), the real relay, the timer, the vault, and the
  real app in a browser. 16 mutations.
- customer-install/db/tests/access_rules/checks_mcp_secret.txt: 11 checks on a database built from the kit.
- safety-lab-desktop/tests/regression_mcp_source_desktop_20261127.test.js: the real desktop bridge. 9 mutations.
