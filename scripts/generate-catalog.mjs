#!/usr/bin/env node
/**
 * Regenerate runtime/catalog.json for dsh-opencode-go-live.
 *
 * The plugin splits the live OpenCode Go `/models` listing across one llm-pi-ai
 * route per wire protocol. The protocol is not in the listing, and the
 * installed pi-ai catalog disagrees with OpenCode's own documentation for
 * several Qwen and MiniMax ids, so {@link OFFICIAL_API} — transcribed from the
 * Go endpoint table — is the authority. pi-ai supplies capacities, compat, and
 * thinking levels; models.dev supplies them for ids pi-ai does not describe.
 *
 * A model on the `opencode-go` route that pi-ai describes with the same
 * protocol is written as a bare id (the catalog inherits); every other model is
 * written out, because metadata does not inherit across route keys.
 *
 * Usage:
 *   node scripts/generate-catalog.mjs \
 *     <pi-ai-open-code-go.json> <models-dev-models.json> <live-ids.json> <out.json>
 *
 * The first three inputs are read-only; only <out.json> is written.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [piAiPath, modelsDevPath, liveIdsPath, outPath] = process.argv.slice(2)
if (!outPath) {
  console.error('usage: generate-catalog.mjs <pi-ai-opencode-go.json> <models-dev-models.json> <live-ids.json> <out.json>')
  process.exit(2)
}

/** pi-ai protocol → the plugin's route key. */
const ROUTE_BY_API = {
  'openai-completions': 'opencode-go',
  'anthropic-messages': 'opencode-go-anthropic',
  'openai-responses': 'opencode-go-responses',
}

/** The catalog route inherits metadata by model id, so only it can carry bare ids. */
const INHERITING_ROUTE = 'opencode-go'

/**
 * Model id → wire protocol, from OpenCode's Go endpoint table
 * (https://opencode.ai/docs/go → Endpoints, fetched 2026-09-15). The AI SDK
 * packages are `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, and
 * `@ai-sdk/openai` respectively.
 */
const OFFICIAL_API = {
  'glm-5.3-flash': 'openai-completions',
  'glm-5.3': 'openai-completions',
  'glm-5.2': 'openai-completions',
  'glm-5.1': 'openai-completions',
  'kimi-k3': 'openai-completions',
  'kimi-k2.7-code': 'openai-completions',
  'kimi-k2.6': 'openai-completions',
  'longcat-2.0': 'openai-completions',
  'deepseek-v4.1-flash': 'openai-completions',
  'deepseek-v4-pro': 'openai-completions',
  'deepseek-v4-flash': 'openai-completions',
  'deepseek-v4-flash-vision-exp': 'openai-completions',
  'mimo-v2.5': 'openai-completions',
  'mimo-v2.5-pro': 'openai-completions',
  'hy4-preview': 'openai-completions',
  'hy3': 'openai-completions',
  'minimax-m3': 'anthropic-messages',
  'minimax-m2.7': 'anthropic-messages',
  'minimax-m2.5': 'anthropic-messages',
  'qwen3.8-max': 'anthropic-messages',
  'qwen3.8-flash': 'anthropic-messages',
  'qwen3.7-max': 'anthropic-messages',
  'qwen3.7-plus': 'anthropic-messages',
  'qwen3.6-plus': 'anthropic-messages',
  'grok-4.6': 'openai-responses',
  'gpt-5.6-luna': 'openai-responses',
  'muse-spark-1.3-contributor': 'openai-responses',
  'muse-spark-1.2-contributor': 'openai-responses',
}

/**
 * Protocol a newer member of a known family follows before the official table
 * lists it. The plugin applies the same list from `catalog.json`.
 */
const FAMILY_API = [
  [/^qwen/, 'anthropic-messages'],
  [/^minimax/, 'anthropic-messages'],
  [/^grok/, 'openai-responses'],
  [/^gpt-/, 'openai-responses'],
  [/^muse/, 'openai-responses'],
]

/**
 * Compat switches llm-pi-ai accepts. The installed catalog carries fields the
 * adapter does not expose (for example `sessionAffinityFormat` on
 * openai-responses), and copying one verbatim would make the whole route fail
 * validation, so an explicit entry carries only the accepted subset.
 */
const ALLOWED_COMPAT = new Set([
  'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming',
  'supportsFinishReason', 'maxTokensField', 'requiresToolResultName', 'requiresAssistantAfterToolResult',
  'requiresThinkingAsText', 'requiresReasoningContentOnAssistantMessages', 'thinkingFormat',
  'chatTemplateKwargs', 'chatTemplateArgs', 'supportsThinkingTokenBudget', 'thinkingTokenBudgetField',
  'vllmPriority', 'supportsMaxOutputTokens', 'supportsStrictMode', 'cacheControlFormat',
  'supportsLongCacheRetention', 'supportsEagerToolInputStreaming', 'supportsCacheControlOnTools',
  'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools',
])

const piAi = JSON.parse(readFileSync(piAiPath, 'utf8'))
const modelsDev = JSON.parse(readFileSync(modelsDevPath, 'utf8'))
const liveIds = JSON.parse(readFileSync(liveIdsPath, 'utf8'))

const devGo = modelsDev?.['opencode-go']?.models ?? {}
const live = (Array.isArray(liveIds) ? liveIds : liveIds?.data ?? []).map(entry =>
  typeof entry === 'string' ? entry : entry?.id).filter(id => typeof id === 'string' && id.length > 0)

/** pi-ai's own catalog entry and protocol, indexed by id. */
const catalogById = {}
for (const [api, models] of Object.entries(piAi)) {
  if (ROUTE_BY_API[api] === undefined) throw new Error(`unmapped pi-ai api "${api}"`)
  for (const [id, model] of Object.entries(models)) catalogById[id] = { api, model }
}

/** The protocol a live id is served with, official table first. */
function apiFor(id) {
  return OFFICIAL_API[id]
    ?? catalogById[id]?.api
    ?? FAMILY_API.find(([pattern]) => pattern.test(id))?.[1]
    ?? 'openai-completions'
}

/** Keep only the compat switches the adapter can validate on a hand-declared entry. */
function filterCompat(compat) {
  if (compat === undefined || compat === null || typeof compat !== 'object') return undefined
  const kept = Object.fromEntries(Object.entries(compat).filter(([field]) => ALLOWED_COMPAT.has(field)))
  return Object.keys(kept).length > 0 ? kept : undefined
}

/** thinkingLevelMap (pi-ai) → reasoningEfforts (llm-pi-ai): keep decided wire values only. */
function toReasoningEfforts(model) {
  const map = model.thinkingLevelMap
  if (map === undefined || map === null || typeof map !== 'object') return undefined
  const efforts = {}
  for (const [level, wire] of Object.entries(map)) {
    if (typeof wire === 'string' && wire.length > 0) efforts[level] = wire
  }
  return Object.keys(efforts).length > 0 ? efforts : undefined
}

/** Effort level names models.dev records for one id, when it records any. */
function modelsDevEfforts(id) {
  const values = devGo[id]?.reasoning_options?.find(option => option?.type === 'effort')?.values
  return Array.isArray(values) && values.length > 0 ? Object.fromEntries(values.map(level => [level, level])) : undefined
}

/**
 * Build the explicit entry for a model pi-ai describes.
 * @param id - model id, for the models.dev reasoning fallback.
 * @param model - the pi-ai catalog entry.
 * @param includeCompat - false when the official protocol differs from the
 *   catalog's, because the catalog compat belongs to the other protocol.
 * @returns the `llm-pi-ai` models entry without its id.
 */
function catalogEntry(id, model, includeCompat) {
  const entry = {
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    input: model.input,
  }
  // A catalog model that reasons without a wire map has no levels to translate;
  // models.dev occasionally knows them, and the entry is otherwise non-reasoning.
  const efforts = toReasoningEfforts(model) ?? modelsDevEfforts(id)
  if (efforts !== undefined) entry.reasoningEfforts = efforts
  const compat = includeCompat ? filterCompat(model.compat) : undefined
  if (compat !== undefined) entry.compat = compat
  return entry
}

/** Build the entry for a model only models.dev describes. */
function entryFromModelsDev(id) {
  const dev = devGo[id]
  const input = (dev?.modalities?.input ?? ['text']).filter(m => m === 'text' || m === 'image')
  const entry = {
    name: typeof dev?.name === 'string' && dev.name.length > 0 ? dev.name : id,
    contextWindow: dev?.limit?.context ?? 262144,
    maxTokens: dev?.limit?.output ?? 32768,
    input: input.length > 0 ? input : ['text'],
  }
  const efforts = modelsDevEfforts(id)
  if (efforts !== undefined) entry.reasoningEfforts = efforts
  if (id.startsWith('deepseek')) {
    entry.compat = {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: 'deepseek',
    }
  }
  return entry
}

const byId = {}
for (const id of live) {
  const api = apiFor(id)
  const route = ROUTE_BY_API[api]
  const base = catalogById[id]
  // Same-protocol catalog ids on the catalog route keep inheriting metadata;
  // every other id is spelled out because nothing inherits across route keys.
  if (route === INHERITING_ROUTE && base?.api === 'openai-completions') {
    byId[id] = { route }
    continue
  }
  byId[id] = { route, entry: base === undefined ? entryFromModelsDev(id) : catalogEntry(id, base.model, base.api === api) }
}

const out = {
  generatedAt: new Date().toISOString(),
  provenance: {
    piAi: piAiPath,
    modelsDev: modelsDevPath,
    live: liveIdsPath,
    officialApi: 'https://opencode.ai/docs/go (Endpoints, fetched 2026-09-15)',
  },
  routes: {
    'opencode-go': { api: 'openai-completions', baseURL: 'https://opencode.ai/zen/go/v1' },
    'opencode-go-anthropic': { api: 'anthropic-messages', baseURL: 'https://opencode.ai/zen/go' },
    'opencode-go-responses': { api: 'openai-responses', baseURL: 'https://opencode.ai/zen/go/v1' },
  },
  hintRoutes: [
    { prefix: 'qwen', route: 'opencode-go-anthropic' },
    { prefix: 'minimax', route: 'opencode-go-anthropic' },
    { prefix: 'grok', route: 'opencode-go-responses' },
    { prefix: 'gpt-', route: 'opencode-go-responses' },
    { prefix: 'muse', route: 'opencode-go-responses' },
  ],
  byId,
}
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
console.log(`wrote ${outPath}: ${Object.keys(byId).length} models, ${live.length} live ids`)
