# pi-eavs

Self-contained native provider for Pi's native-provider SDK (tested against repository and bundled runtimes). Try without installing:

```sh
pi -e ./pi-eavs/index.ts
```

Run `/login`, choose **EAVS**, enter a server origin (or its `/v1` API base),
then an **EAVS scoped virtual key**. HTTPS is the default; HTTP requires explicit consent as described below. A secret prompt is used. Login performs only
`GET /v1/eavs/catalog`, validates the key-filtered chat catalog, and saves the
connection through Pi. No provider probe, inference, OAuth exchange, browser,
credential command, upstream account identity or JWT parsing is involved.

**Pi's `auth.json` is not encrypted.** The stored credential is an ordinary
`api_key` with `key` and `env.EAVS_SERVER`. Protect the agent directory and load
only trusted extensions. Never enter an operator/master key. The extension
accepts the `eavs-…` virtual-key format, but only the server can enforce key
scope. It never requests or manages operator credentials.

## HTTP exceptions

HTTP is denied by default, including localhost and tailnet addresses. For an
unapproved HTTP address, `/login` asks **before the secret prompt or network**:

- **Cancel** (first/default choice): no key request or network access.
- **Allow once**: permit that exact origin until reload/session shutdown. The
  credential is still saved normally, but after restart it cannot be used over
  HTTP until consent is given again. Cancelled/failed login revokes the new
  one-time permission.
- **Save exception**: persist that exact origin in `<agent-dir>/pi-eavs.json`
  (`~/.pi/agent/pi-eavs.json` by default; honors `PI_CODING_AGENT_DIR`). This
  saves the network exception independently of whether key entry later succeeds.

```json
{
  "allowHttpOrigins": [
    "http://localhost:8080",
    "http://eavs.my-tailnet.ts.net:8080"
  ]
}
```

Origins must be canonical (no trailing slash, path, credentials, query, fragment
or wildcard); scheme, hostname and port must match exactly. No private-IP or
Tailscale trust is inferred. HTTP exposes the key and request to the underlying
connection; use it only on a trusted channel (such as your Tailscale tunnel).
Saved configuration is rechecked before HTTP requests; removing an exception
blocks subsequent requests. A still-active one-time permission must also expire
or be cleared via reload/session shutdown.

For security this policy deliberately reads **user agent configuration only**,
not cwd/project configuration or catalog/cache data. Writes are locked, private
and atomic; malformed/busy files fail closed. Symlinked configuration may be
read, but must be edited manually rather than overwritten by login. See
`pi-eavs.schema.json` and `pi-eavs.example.json`. HTTPS still verifies TLS;
redirects and environment proxies stay disabled for both protocols.

## Models and lifecycle

- One stable Pi provider ID: `eavs`. One saved server/key at a time. Logging into
  another server replaces this connection; simultaneous multi-server profiles
  are deliberately not implemented. Model IDs are `<gateway-provider>/<model>`
  to avoid collisions, while native requests use the original upstream model ID.
- Native Chat Completions, Responses and Anthropic Messages are dispatched
  through Pi's installed API implementations. Gateway Codex uses ordinary
  Responses, not client-side subscription OAuth. Explicit catalog provider
  paths are checked and preserved, never replaced with a generic `/v1` path.
  Anthropic's dispatch base omits only the validated route's terminal `/v1`,
  because its installed SDK appends `/v1/messages` itself; an offline native SDK
  test proves the resulting request path.
- Server input is restricted to an HTTP(S) origin or `/v1` base, with no URL
  credentials/query/fragment. HTTP needs an explicit exact-origin exception.
  Arbitrary mount prefixes, provider URL inputs and separate listener credentials
  are not supported. Origin and `/v1` inputs produce exactly one catalog `/v1`.
- Online CLI startup is primed with a bounded metadata read before provider
  registration, using Pi's public `readStoredCredential()` (no command execution).
  Pi also restores a validated model snapshot during cache-only initialization
  and refreshes at session startup. The snapshot in Pi's model store has a one-way
  server/key binding in the provider-owned validator field (`etag`); it contains
  metadata, not keys. That validator is local and is never sent to the server.
  Snapshots are hints, not proof of current authorization.
- After `session_start`, authenticated metadata polling runs every **60 seconds**,
  without overlapping polls, backing off exponentially to **15 minutes** on
  failure. `/eavs-refresh` joins the poll if one is running. Login can reactivate
  polling; logout, shutdown and reload abort/clean up session polling.
- A valid empty scope or 401/403 removes models. Invalid catalogs fail closed.
  Transient network/server failures retain last-known matching-scope models
  and back off; the gateway still authorizes every actual request. Policy
  changes are therefore eventually visible, not instantaneous.
- `PI_OFFLINE` being set disables login validation and all metadata network
  refresh, including manual refresh. Cached models may still be listed. It is
  not an inference firewall.
- Models are never automatically selected or replaced. Refresh removes revoked
  models from the registry, but Pi can retain an already-selected model object;
  dispatch rechecks current model membership, connection, API and route before
  use. A stale selected object whose route changed must be selected again.
- Chat candidates require complete declared limits, modalities and reasoning;
  missing/null pricing does not hide self-hosted models. These models carry
  `eavsPricing: "unknown"` and a visible `[price unknown]` name suffix, preserved
  across cache reloads. Pi requires numeric costs, so their cost fields use zero
  **local accounting placeholders**, not fabricated price estimates or verified
  free inference. Pi session cost totals therefore exclude unknown charges.
  Gateway authorization and budget enforcement remain unchanged and may still
  reject an unpriced request for a capped key.
- Supplied estimates must have finite nonnegative rates (explicit zero is valid).
  Malformed pricing/capabilities are skipped; an entirely invalid catalog is
  rejected. Estimates are **unverified**, not settlement. `/eavs-refresh` reports
  accepted, omitted and unknown-price counts. No media/classifier discovery.

TLS certificate verification is explicit (even with ambient TLS disabling),
redirects are refused, proxy environment variables are not used, and credentials
are restricted to the selected origin. Metadata has a six-second total deadline,
4 MiB body limit, 16 KiB header limit, cancellation and private errors. Native
inference also uses the redirect-refusing TLS transport, with caller cancellation
rather than a short timeout that would interrupt reasoning models. Node is
required: Bun transport is refused rather than relying on its proxy/TLS shim.

No external services, secret sync, direct-upstream fallback, global installation,
models.json editing or EAVS source dependencies are included. Projection rules
are adapted from EAVS `adapters/pi/provider-library.ts`; the package carries its
own implementation and only uses host-provided Pi peers. There is no runtime
configuration file/schema: configuration is the native login credential.

## Troubleshooting inference

Use only `/login` → EAVS with the bare server URL (for example
`https://eavs.example`); the catalog supplies every provider route. Do not add
hand-written `models.json` providers for the EAVS origin: they skip the pinned
`/<provider>/v1` routes, and the gateway's unprefixed route may pick a provider
from the model name. The extension warns at session start when it finds such
entries. Projected requests also send `X-Provider` matching the pinned path.

Inference failures expose only the HTTP status, or indicate that no HTTP
response was received (transport/SDK setup). A 200 followed by a failure points
to streaming/protocol/cancellation, not initial key admission. A 401/403 can be
gateway or upstream rejection; it is not automatically proof the scoped key is
invalid. Raw SDK error text, response bodies and headers are never displayed.

## Troubleshooting login and refresh

`/eavs-refresh` reports only safe categories: authorization denied (check key/scope),
network/TLS (check connectivity/trust), catalog schema (check gateway compatibility),
SDK API compatibility, or local state/publication (check Pi storage integrity and
permissions). It never displays raw exception text, cache fragments or credentials.

Catalog validation and credential synchronization are separate steps. A successful
validation followed by `CredentialSynchronizationError` does **not** imply a rejected
key: Pi may have already saved `key` and `env.EAVS_SERVER` in `auth.json`, then failed
to read or publish its shared models cache. A synthetic truncated models-store JSON
reproduces both native login failure (with a `SyntaxError` cause) and manual refresh
failure even with a valid catalog. Restarting or `/reload` cannot repair that file.

Do not delete credentials, edit `models.json`, or silently reset the generic SDK
cache. Obtain explicit consent before privately backing up/quarantining a corrupt
`models-store.json`, preserving its exact bytes and restrictive permissions. Repair
belongs to Pi's storage lifecycle; this extension only diagnoses and leaves cache
bytes untouched. A healthy-cache metadata refresh remains a separate verification
step after any authorized recovery. Poll scheduling is unchanged in this release.

## Verification (repository root)

```sh
node --import jiti/register --test pi-eavs/*.test.ts
npm run typecheck
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop pi-eavs/*.ts
node_modules/.bin/biome check pi-eavs
npm pack ./pi-eavs --dry-run
```

To additionally exercise native login in a particular installed SDK, set
`EAVS_TEST_INSTALLED_SDK` to its absolute `pi-coding-agent/dist/index.js` path
when running the tests. The HTTPS test loads the actual extension, creates and
binds a real SDK session, performs native API-key login, and verifies the published
model ID against both SDKs. It does not drive the terminal login dialog. Child
processes have isolated HOME/agent directories and trust only the temporary CA.
Failure diagnostics expose only allowlisted error categories/codes, not error
messages, credentials, response bodies or auth files.

Tests use synthetic keys, mock native APIs, private temporary SDK credential/model
stores and local HTTPS fixtures. OpenSSL is needed only for fixture certificates;
no CA is installed globally. No inference network request is made, even to fixtures.

The installed SDK provides native `ApiKeyAuth.login`, secret/text prompts,
provider-scoped credential `env`, `refreshModels`, and generation-checked
publication. No OAuth compatibility shim is necessary. It has no dedicated
logout event for extensions; session polling observes the provider auth
checks/resolution used by Pi's login/logout synchronization. External edits from
another Pi process become visible on the next refresh, not as an immediate
notification. Native provider registration starts an unawaited cache refresh in
this SDK: offline/cached-only initial model selection or `--list-models` can race
that restoration, although the cache becomes available subsequently. The online
CLI path is explicitly primed and tested with an isolated HTTPS fixture. Embedded
SDK applications with a custom credential store must initialize/refresh that
runtime themselves; the factory reader uses Pi's default agent-directory auth
path. No supported EAVS catalog change-event endpoint was established.

The repo typecheck uses its existing `skipLibCheck` setting. Checking **all**
installed dependency declarations without it currently fails in upstream Pi
JSON-import declarations and a missing optional Google MCP peer; no SDK stubs,
ambient shims or dependency modifications are used to conceal this limitation.
