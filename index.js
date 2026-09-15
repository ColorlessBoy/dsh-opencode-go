/**
 * dsh-opencode-go — OpenCode Go integration for a dsh web profile.
 *
 * It owns two things about the OpenCode Go subscription:
 *
 * 1. **Model routes.** `@deepseek-ai/dsh-llm-pi-ai` ships a static catalog, so a
 *    model OpenCode adds to `https://opencode.ai/zen/go/v1/models` is invisible
 *    until a harness upgrade. This plugin fetches that live listing and writes
 *    the `llm-pi-ai` provider routes from it, one route per wire protocol
 *    because a hand-declared route carries a single `api`. A model the
 *    installed catalog already describes on the `opencode-go` route is written
 *    as a bare `{ id }` so it keeps the catalog's capacities, compat, and
 *    thinking levels; everything else is written out from `runtime/catalog.json`.
 *
 * 2. **Key pool usage and switching.** It reads keys named
 *    `OPENCODE_GO_KEY_<name>` from `$DSH_HOME/.credentials.yaml`, samples
 *    `GET https://opencode.ai/zen/go/v1/usage` for each, and serves a snapshot
 *    the browser widget renders. Selecting a key writes it into `OPENCODE_API_KEY`
 *    (the reference the model routes resolve) and marks `OPENCODE_GO_KEY_ACTIVE`.
 *    Secrets stay in this half; routes expose names, percentages, and status only.
 *
 * The Go endpoint rejects a chat request without an `x-opencode-session` header
 * (400 `MissingSessionID`), so every written route carries one.
 *
 * The usage widget is derived from `@xiaweiliang060035/dsh-opencode-go-usage`
 * (MIT); see LICENSE.
 *
 * @module dsh-opencode-go
 */

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'opencode-go'

/** Credentials resolve the pool and the live listing; the timer drives both refreshes. */
export const inject = ['credentials', 'timer']

/** User-settings namespace owned by `@deepseek-ai/dsh-llm-pi-ai`. */
const SETTINGS_NS = 'llm-pi-ai'

/** Credential reference the model routes resolve per request. */
const CREDENTIAL_REF = 'OPENCODE_API_KEY'

/** Prefix of one pool entry in the credential store (`OPENCODE_GO_KEY_<name>`). */
const POOL_PREFIX = 'OPENCODE_GO_KEY_'

/** Pool marker naming the active entry; drives the widget's highlight only. */
const ACTIVE_REF = 'OPENCODE_GO_KEY_ACTIVE'

/** The Go tier's live model listing; ids only, no metadata. */
const LISTING_URL = 'https://opencode.ai/zen/go/v1/models'

/** Required on every chat request; omission answers 400 `MissingSessionID`. */
const SESSION_HEADER = 'x-opencode-session'

/** Re-read the model listing every 30 minutes by default. */
const DEFAULT_MODEL_REFRESH_MS = 30 * 60 * 1000

/** Official usage endpoint; undocumented, discovered via farion1231/cc-switch#6433. */
const DEFAULT_USAGE_BASE_URL = 'https://opencode.ai/zen/go/v1/usage'

/** Sample every pool key's usage every 60 seconds by default. */
const DEFAULT_USAGE_REFRESH_MS = 60 * 1000

/** Bound one usage request by default. */
const DEFAULT_USAGE_TIMEOUT_MS = 15 * 1000

/** Bound each listing request so a hung endpoint cannot stall the refresh. */
const FETCH_TIMEOUT_MS = 10_000

/** Codes the settings service reports for a stale `expectedRevision` write. */
const CONFLICT_CODES = new Set(['SETTINGS_CONFLICT'])

const SNAPSHOT_PATH = '/plugins/dsh-opencode-go/snapshot'
const SELECT_PATH = '/plugins/dsh-opencode-go/select'

const CATALOG = JSON.parse(readFileSync(new URL('./runtime/catalog.json', import.meta.url), 'utf8'))

/** Positive-integer config with a default, validated loud. */
function positiveInt(value, fallback, label, min = 1) {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < min) {
    throw new TypeError(`opencode-go: config.${label} must be a number >= ${min}`)
  }
  return resolved
}

/** Resolve the plugin config with defaults and loud validation. */
function resolveConfig(config) {
  const source = config ?? {}
  return {
    modelRefreshMs: positiveInt(source.modelRefreshMs, DEFAULT_MODEL_REFRESH_MS, 'modelRefreshMs', 1000),
    usageRefreshMs: positiveInt(source.usageRefreshMs, DEFAULT_USAGE_REFRESH_MS, 'usageRefreshMs', 1000),
    usageTimeoutMs: positiveInt(source.usageTimeoutMs, DEFAULT_USAGE_TIMEOUT_MS, 'usageTimeoutMs', 1),
    baseUrl: source.baseUrl || DEFAULT_USAGE_BASE_URL,
    keyNames: Array.isArray(source.keyNames) ? source.keyNames.slice() : [],
    dshHome: source.dshHome || resolveDshHome(),
  }
}

/** Defensive read of one usage window. */
function pickWindow(w) {
  if (!w || typeof w !== 'object') return { status: null, percent: null, resetsAt: null }
  const p = typeof w.percent === 'number' ? w.percent : Number(w.percent)
  return {
    status: typeof w.status === 'string' ? w.status : null,
    percent: Number.isFinite(p) ? p : null,
    resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
  }
}

/** Human-readable labels for the three protocol routes. */
function displayName(route) {
  const suffix = route.replace('opencode-go', '').replace(/^-/, '')
  if (suffix.length === 0) return 'OpenCode Go'
  return `OpenCode Go (${suffix === 'anthropic' ? 'Anthropic' : 'Responses'})`
}

/**
 * Group live ids onto their protocol routes, spelling out entries the installed
 * catalog cannot inherit.
 * @param ids - model ids from the live listing.
 * @param sessionId - value for the endpoint's required routing header.
 * @param catalog - parsed `runtime/catalog.json`; defaults to the bundled snapshot.
 * @returns the `llm-pi-ai` `providers` object for the ids.
 */
export function buildProviders(ids, sessionId, catalog = CATALOG) {
  const routeFor = (id) => {
    const known = catalog.byId[id]
    if (known !== undefined) return known.route
    return catalog.hintRoutes?.find(hint => id.startsWith(hint.prefix))?.route ?? 'opencode-go'
  }
  const grouped = new Map()
  for (const id of ids) {
    const known = catalog.byId[id]
    const route = routeFor(id)
    const entry = known?.entry !== undefined ? { id, ...known.entry } : { id }
    const bucket = grouped.get(route)
    if (bucket === undefined) grouped.set(route, [entry])
    else bucket.push(entry)
  }
  const providers = {}
  for (const [route, spec] of Object.entries(catalog.routes)) {
    const models = grouped.get(route)
    if (models === undefined || models.length === 0) continue
    providers[route] = {
      displayName: displayName(route),
      apiKeyEnv: CREDENTIAL_REF,
      api: spec.api,
      baseURL: spec.baseURL,
      headers: { [SESSION_HEADER]: sessionId },
      models,
    }
  }
  return providers
}

/**
 * Mount the model refresher, the usage sampler, its routes, and its tools.
 * @param ctx - host cordis context.
 * @param config - deployment config: `modelRefreshMs`, `usageRefreshMs`, `usageTimeoutMs`, `baseUrl`, `keyNames`, `dshHome`.
 */
export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  // Stable for the process so repeat requests land on one upstream for cache
  // affinity; llm-pi-ai route headers are static, so it cannot be per session.
  const sessionId = `dsh-${randomUUID()}`
  const credPath = join(cfg.dshHome, '.credentials.yaml')

  const resolveRef = async (ref) => {
    const record = await ctx.credentials.resolve(credentialRef(ref))
    return typeof record?.value === 'string' && record.value.length > 0 ? record.value : undefined
  }

  /* ------------------------------- model routes ------------------------------ */

  let lastError
  let lastSyncedAt
  let lastCount

  /** Resolve the Go key through the credential seam, then the process environment. */
  const resolveApiKey = async () => {
    const stored = await resolveRef(CREDENTIAL_REF)
    if (stored !== undefined) return stored
    const fromEnvironment = process.env[CREDENTIAL_REF]
    return typeof fromEnvironment === 'string' && fromEnvironment.length > 0 ? fromEnvironment : undefined
  }

  /** Fetch the live listing's model ids. */
  const fetchLiveIds = async (apiKey) => {
    const headers = { accept: 'application/json' }
    if (apiKey !== undefined) headers.authorization = `Bearer ${apiKey}`
    const response = await fetch(LISTING_URL, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`GET ${LISTING_URL} answered ${response.status}`)
    const body = await response.json()
    const entries = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []
    const ids = entries
      .map(entry => (typeof entry === 'string' ? entry : entry?.id))
      .filter(id => typeof id === 'string' && id.length > 0)
    return [...new Set(ids)]
  }

  /** The `llm-pi-ai` namespace revision, for optimistic writes. */
  const currentRevision = () => {
    const settings = ctx.get('settings')
    if (settings?.describe === undefined) return undefined
    return settings.describe().find(descriptor => descriptor.ns === SETTINGS_NS)?.revision
  }

  /** Write, retrying once against a concurrent editor's revision. */
  const write = async (settings, patch) => {
    const revision = currentRevision()
    try {
      await settings.update(SETTINGS_NS, patch, revision)
    } catch (error) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined
      if (!CONFLICT_CODES.has(code) && !/conflict/i.test(String(error?.message ?? ''))) throw error
      await settings.update(SETTINGS_NS, patch, currentRevision())
    }
  }

  /**
   * Read the live listing and write the model routes.
   * @returns `{ count, routes, unchanged }` for the models just written.
   */
  const refreshModels = async () => {
    const settings = ctx.get('settings')
    if (settings?.update === undefined) {
      throw new Error('opencode-go: the settings service is unavailable; mount dsh-settings-file')
    }
    const apiKey = await resolveApiKey()
    const ids = await fetchLiveIds(apiKey)
    const providers = buildProviders(ids, sessionId)
    if (Object.keys(providers).length === 0) {
      throw new Error('opencode-go: the live listing returned no models')
    }
    const patch = { providers }
    const current = settings.get(SETTINGS_NS)?.providers
    const unchanged = Object.keys(providers).every(route =>
      JSON.stringify(current?.[route]) === JSON.stringify(providers[route]))
    if (!unchanged) await write(settings, patch)
    lastSyncedAt = new Date().toISOString()
    lastError = undefined
    lastCount = ids.length
    const routes = Object.fromEntries(Object.entries(providers).map(([route, profile]) => [route, profile.models.length]))
    return { count: ids.length, routes, unchanged }
  }

  /** Refresh models without throwing, so one failed tick cannot stop the interval. */
  const refreshModelsQuietly = async () => {
    try {
      await refreshModels()
      ctx.logger?.info?.(`opencode-go: synced ${lastCount} OpenCode Go models`)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.(`opencode-go: model refresh failed: ${lastError}`)
    }
  }

  const syncModelsNow = async () => {
    try {
      return await refreshModels()
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /* ------------------------------ key pool usage ----------------------------- */

  // Pure JSON so a route can serialize it straight back.
  let cache = { updatedAt: 0, error: null, entries: [] }
  let refreshing = null

  /** Pool names: explicit config first, else the legacy flat scan of the credential file. */
  const discoverKeyNames = () => {
    if (cfg.keyNames.length > 0) return cfg.keyNames
    let text = ''
    try {
      if (existsSync(credPath)) text = readFileSync(credPath, 'utf8')
    } catch { /* unreadable file reads as an empty pool */ }
    const names = []
    for (const m of text.matchAll(/^OPENCODE_GO_KEY_([A-Za-z0-9_]+)\s*:/gm)) {
      if (m[1] !== 'ACTIVE') names.push(m[1])
    }
    return names
  }

  /** Fetch one key's usage; every failure becomes a displayable code. */
  const fetchKey = async (key) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg.usageTimeoutMs)
    try {
      const res = await fetch(cfg.baseUrl, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: ctrl.signal,
      })
      if (res.status === 401) return { error: 'unauthorized', detail: 'HTTP 401' }
      if (!res.ok) return { error: `http-${res.status}`, detail: `HTTP ${res.status}` }
      let data
      try {
        data = await res.json()
      } catch {
        return { error: 'bad-json', detail: 'json parse failed' }
      }
      const usage = data && typeof data === 'object' && data.usage ? data.usage : data
      if (!usage || typeof usage !== 'object') return { error: 'bad-json', detail: 'no usage object' }
      return {
        error: null,
        detail: null,
        windows: {
          rolling: pickWindow(usage.rolling),
          weekly: pickWindow(usage.weekly),
          monthly: pickWindow(usage.monthly),
        },
      }
    } catch (e) {
      const msg = e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e)
      return { error: 'network', detail: msg.slice(0, 200) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Re-sample the whole pool; one key's failure does not affect the others. */
  const refreshUsage = async () => {
    if (refreshing) return refreshing
    refreshing = (async () => {
      try {
        const pool = []
        for (const poolName of discoverKeyNames()) {
          const key = await resolveRef(`${POOL_PREFIX}${poolName}`)
          if (key !== undefined) pool.push({ name: poolName, key })
        }
        // Empty pool: fall back to the single active key.
        let fallbackMain = false
        if (pool.length === 0) {
          const main = await resolveRef('OPENCODE_GO_API_KEY')
          if (main !== undefined) {
            pool.push({ name: 'active', key: main })
            fallbackMain = true
          }
        }
        // Sample first, read ACTIVE last: a switch during the refresh must win.
        const raw = await Promise.all(pool.map(async it => ({ name: it.name, ...(await fetchKey(it.key)) })))
        const active = await resolveRef(ACTIVE_REF)
        cache = {
          updatedAt: Date.now(),
          error: pool.length > 0 ? null : 'no-keys',
          fallback: fallbackMain,
          entries: raw.map(r => ({
            name: r.name,
            active: fallbackMain ? r.name === 'active' : r.name === active,
            error: r.error,
            detail: r.detail || null,
            windows: r.windows || null,
          })),
        }
      } catch (e) {
        cache = { ...cache, error: `internal: ${String((e && e.message) || e)}` }
      }
    })()
    try {
      await refreshing
    } finally {
      refreshing = null
    }
    return cache
  }

  /** Point the model routes at one pool key and mark it active. */
  const selectKey = async (poolName) => {
    if (!discoverKeyNames().includes(poolName)) throw new Error(`unknown key: ${poolName}`)
    const key = await resolveRef(`${POOL_PREFIX}${poolName}`)
    if (key === undefined) throw new Error(`empty key: ${poolName}`)
    await ctx.credentials.set(credentialRef(CREDENTIAL_REF), key)
    await ctx.credentials.set(credentialRef(ACTIVE_REF), poolName)
    // Optimistic highlight: the caller returns immediately, percentages re-sample behind it.
    cache = { ...cache, entries: (cache.entries || []).map(e => ({ ...e, active: e.name === poolName })) }
    return cache
  }

  /* --------------------------------- wiring --------------------------------- */

  ctx.interval(() => { void refreshModelsQuietly() }, cfg.modelRefreshMs)
  // The first model sync waits for settings: applying during tree load can
  // precede the settings service, and a one-shot tick would then be lost.
  ctx.inject(['settings'], () => { void refreshModelsQuietly() })

  ctx.interval(() => { void refreshUsage() }, cfg.usageRefreshMs)
  void refreshUsage()

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: SNAPSHOT_PATH,
      handler: async (req, res) => {
        const url = new URL(req.url || '/', 'http://x')
        if (url.searchParams.get('force') === '1') await refreshUsage()
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(cache))
      },
    }), 'dsh-opencode-go: snapshot route')

    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: SELECT_PATH,
      handler: async (req, res) => {
        const send = (code, body) => {
          res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { ok: false, error: 'method not allowed' })
        const name = new URL(req.url || '/', 'http://x').searchParams.get('name') || ''
        try {
          const next = await selectKey(name)
          send(200, { ok: true, active: name, entries: next.entries })
          refreshUsage()
        } catch (e) {
          send(400, { ok: false, error: String((e && e.message) || e) })
        }
      },
    }), 'dsh-opencode-go: select route')
  }

  ctx.inject(['tools'], (toolsCtx) => {
    const textOutput = render => ({
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: render(value) }],
    })

    toolsCtx.tools.register({
      name: 'oc_go_status',
      description: 'Report the OpenCode Go integration: model sync time and count, key pool usage, and any last error. Read-only.',
      parameters: { type: 'object', properties: {} },
      output: textOutput(value => JSON.stringify(value, null, 2)),
      isConcurrencySafe: () => true,
      timeoutMs: 5000,
      execute: () => ({
        models: { lastSyncedAt, lastCount, lastError, refreshMs: cfg.modelRefreshMs, credentialRef: CREDENTIAL_REF },
        keys: discoverKeyNames(),
        usage: cache.entries.map(e => ({ name: e.name, active: e.active, error: e.error, windows: e.windows })),
      }),
    })

    toolsCtx.tools.register({
      name: 'oc_go_sync',
      description: 'Fetch the live OpenCode Go model listing now and write the llm-pi-ai provider routes for it. Use when a model the endpoint serves is missing from the picker.',
      parameters: { type: 'object', properties: {} },
      output: textOutput(value => JSON.stringify(value, null, 2)),
      timeoutMs: 30000,
      execute: () => syncModelsNow(),
    })
  })
}
