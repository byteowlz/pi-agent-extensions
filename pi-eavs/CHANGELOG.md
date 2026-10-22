# Changelog

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
