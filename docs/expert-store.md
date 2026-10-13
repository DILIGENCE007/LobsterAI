# Expert catalog delivery

Content source: https://gitlab.corp.youdao.com/yangwn/lobsterai-expert-store (private).
The source repo contains editable bilingual prompt Markdown, expert metadata,
categories, featured scenarios, avatar originals, compact WebP assets, build
validation, immutable distribution JSON and release manifests.

## Configuration

`getExpertStoreUrl()` follows the same `app.testMode` flag as kit-store and
skill-store. Overmind project 475 / `luna/hardware/lobsterai` uses the key
`expert-store`. Only **test** is provisioned for the initial release; publish a
validated manifest to prod separately before releasing this client change.

Overmind `data.value` is an object (or JSON string) with `schemaVersion: 1`,
`version`, `catalogUrl`, and `sha256`. The SHA-256 digest covers the raw UTF-8
bytes of the CDN catalog. The catalog has the same version plus `categories`,
`scenarios`, and `experts`; see `src/shared/agent/presets.ts` and
`expertCatalogValidation.ts` for the contract.

`ExpertStore` runs in the main process. It validates the complete response,
downloads only from supported HTTPS CDN origins, rejects redirects, caps the
manifest at 32 KiB and the catalog at 4 MiB, and enforces a 10-second timeout per
request. It deduplicates concurrent loads and checks Overmind at most every
5 minutes when requested. There is no background polling or baked-in catalog.
Adding an expert/category or reordering scenarios requires only a content
release; new protocol fields or presentation tokens require a client change.

The last valid catalog is atomically cached in `userData/expert-store`, keyed
by the full environment-specific endpoint. Network, schema, version or hash
failures retain this catalog and retry on a subsequent request after 30 seconds.
Without a valid cache, the plaza shows its existing retry state. An explicit
empty catalog is supported. Rollback is a normal manifest change, including
to a lower version; tests and production never share cached catalogs.

## Agent compatibility

The renderer obtains content through `agents:expertCatalog`. Legacy
`agents:presetTemplates` and `agents:presets` retain their array contracts.
Summon sends only a preset ID; the main process chooses the validated template
and creates an ordinary preset Agent using the selected locale. It awaits
OpenClaw config sync before returning. Starter questions remain unsent drafts.

Existing preset instances are reused offline and after catalog removal, without
overwriting user edits. Concurrent requests do not duplicate an installation.
Remote `skillIds` select existing capabilities; this path does not install new
skills or grant additional permissions. Configuration maintainers must check
that referenced skills exist in supported app versions.

Avatars can be existing SVG tokens or supported CDN PNG/JPEG/WebP URLs. Storage
normalization preserves valid image URLs; the renderer loads them lazily and
falls back to the default SVG on failure. The initial three images are 256×256
WebP, each below 5 KB. The source repo documents generation and compression.

## Verification

Run targeted Vitest tests for `agentManager`, `expertDiscovery`, `expertStore`,
`expertCatalogValidation`, `avatar`, agent IPC handlers and `expertOnboarding`,
plus changed-file ESLint, renderer TypeScript and `npm run compile:electron`.

`scripts/e2e-expert-plaza.cjs` uses a fresh test profile and a local model fixture.
It downloads the actual test catalog/CDN avatar, verifies persistence and Agent
creation, and checks discovery, drafts, OpenClaw sessions and theme/layout.
All Electron windows stay hidden; no native keyboard or mouse input is used.
Use `EXPERT_E2E_DEV_SERVER=http://localhost:5175` with Vite for dev validation,
or run against a production bundle after `npm run build`. Set
`PLAYWRIGHT_MODULE_PATH` if Playwright is provided outside this repository.
