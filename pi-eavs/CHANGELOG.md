# Changelog

## 0.2.2

- Inference failures name the stage that failed instead of "failed or cancelled": request never built, blocked locally, cancelled, network error with its Node/OpenSSL code and request size, HTTP rejection, or stream failure after HTTP 200. Only stage, error code, status and size are shown; never URLs, headers, bodies or keys.
- Load the native API clients from `@earendil-works/pi-ai/compat`, an embedded module in bundled Pi runtimes, instead of `/api/*` subpaths that a bundled runtime may not expose. A test pins extension imports to the embedded set (read from the installed runtime when available).

## 0.2.1

- Projected requests now send `X-Provider` matching the catalog's provider-pinned path, overriding any caller value, so the gateway never falls back to model-name provider heuristics (e.g. a self-hosted `deepseek-*` model being routed to an unconfigured `deepseek` provider).
- Warn at session start when hand-written `models.json` providers target the saved EAVS origin directly; the warning names them and the remedy (`/login` → EAVS with the bare server URL). Provider names only; never keys.

## 0.2.0

- HTTPS remains the default. Explicit exact-origin HTTP exceptions support localhost, tailnet and other intentional gateways without inferring network trust.
- Native `/login` asks Cancel (default), Allow once, or Save exception before requesting a key or making a request. One-time exceptions expire on reload/session shutdown; saved exceptions live only in user agent `pi-eavs.json`, with private atomic writes. Project files and cached catalogs cannot grant exceptions.
- HTTP and HTTPS share bounded, origin-restricted, proxy-independent, redirect-refusing transport. TLS verification stays enforced for HTTPS.
- Inference failures now preserve safe HTTP status diagnostics, or distinguish failures before any response. Raw SDK messages, headers, keys and response bodies remain redacted. A single user-authorized live minimal request to FHGenie DeepSeek returned HTTP 200; the user's session-specific failure is not claimed fixed.

## 0.1.2

- Decouple model discovery from missing/null pricing, restoring self-hosted models. Preserve an explicit unknown-price marker and visible name suffix across cached metadata; zero numeric costs are Pi-local accounting placeholders, never verified-free rates or a gateway budget exemption.
- Accept explicit nonnegative price estimates, including zero; malformed supplied pricing and invalid capabilities remain rejected.
- Manual refresh reports accepted/omitted/unknown-price counts. Actual scoped metadata now projects and publishes all 40 models (five unknown-price) through installed 1.3 and repository SDK, including cache roundtrip. No inference or user-cache mutation.

## 0.1.1

- Add safe actionable refresh diagnostics for authorization, network/TLS, catalog schema, SDK compatibility, and local state/publication failures; never display raw errors or credentials.
- Reproduce native `CredentialSynchronizationError` and failed manual refresh with a synthetic truncated SDK models cache. Assert cache bytes remain unchanged; no automatic repair or credential deletion.
- Add synthetic HTTPS native-login coverage through the loaded extension and a real SDK session, including an optional installed-runtime comparison. Healthy-cache login still passes; no polling race fix or generic SDK cache repair is claimed.

## 0.1.0

- Native EAVS `/login` using scoped API keys and persisted server metadata.
- Metadata-only discovery, validated startup snapshots, native chat API dispatch,
  cancellation and logout integration; no inference during discovery.
- Session-scoped policy polling, backoff, offline mode and lifecycle cleanup.
- HTTPS-only, redirect-refusing bounded transport and private errors.
- Offline SDK lifecycle, dispatch, policy refresh and HTTPS security tests.
