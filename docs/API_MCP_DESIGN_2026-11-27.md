# The Safety Lab API and MCP server: design (27 Nov 2026)

Waqas, 27 Nov 2026: "API and MCP yes, and then we need to [write] the instructions for violet labs". Both our cloud and
customer servers in one build. Violet instructions cover both directions. The deck ("One Thread Across Every Tool",
slides 10 and 11) is the contract: two ways to sign in, read the whole project, write under the same rules, no special
cases; MCP reads and proposes through the same gate; the engine makes fault trees and requirements.

## Where it runs
One module, `api_v1.js`, beside `worker.js` in safety-lab-proxy-deploy and (byte-identical) in
customer-install/selfhost/ai-proxy. Our cloud: api.safetylabaero.com/v1/... Customer server: https://<server>/v1/...
(Caddy sends /v1/projects*, /v1/oauth/*, /v1/mcp and /v1/api/* to the same service as /v1/ai). A project kept as a
file (no server) has no API.

## Sign-in
- API client (a system): client ID `slc_...` and a secret, made by a workspace admin. `POST /v1/oauth/token`
  (client credentials) gives a one-hour access token `sla_...`. Reads every project of its workspace, or only the
  projects the admin chose.
- Personal API key (a person's scripts): `slk_...`, sent as the Bearer token as is. Sees what that person sees.
- Either may be read-only or read-and-send. Secrets are shown once; the database keeps only a SHA-256 of them.
- Tables `api_clients`; RPCs `api_client_create`, `api_client_list`, `api_client_revoke` (the app's only doors).

## Reading (what is saved in the project document, `project_documents.data`)
`GET /v1/projects`, `/v1/projects/{id}`, and under a project: `functions`, `failure-conditions`, `fault-trees`,
`fault-trees/{tree}`, `requirements`, `assumptions`, `traces`. Every item carries `owner` ("safety-lab" or the tool
that owns it) and `scope` ("aircraft" or a system).

## Writing: the tool never touches the project
A tool keeps its own items in named collections on the server (`api_collections`, `api_items`): functions,
requirements or assumptions, each item under the tool's own id. In the app each API client is a connected tool on
the Connections page (same engine as Polarion and Codebeamer: alm_engine.js with a driver that reads the collections).
A check stages every difference as a line (added, changed, moved, renamed, removed); nothing enters the analysis until
an engineer accepts the line and signs. A client can only write its own collections, so it cannot change an item
another tool owns. An item it removes is flagged as missing, never deleted. What Safety Lab sends to the tool (items it
owns, failure conditions, safety requirements) is written into the tool's collection with origin "safety-lab" for the
tool to read. Each item shows the tool whether it is waiting, accepted (who, when) or rejected (why).

## MCP
`POST /v1/mcp` (Streamable HTTP, JSON answers, no session). Same tokens, same rules. Read tools for everything the API
reads; `propose_items` writes to a collection (staged like any other change). No tool writes a fault tree or a
requirement into the analysis.

## Reading other MCP sources
Safety Lab as an MCP client (Connections, "MCP source"): the address and token are kept in the vault, the server makes
the call. What it reads is staged through the same engine.
