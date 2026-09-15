/**
 * dsh-opencode-go-usage — Host half（分享版 0.2.0）
 * ------------------------------------------------------------------
 * 实时展示 OpenCode Go 订阅用量（滚动/每周/每月）的 DSH web 插件 Host 半。
 *
 * 数据源：官方用量端点 GET {baseUrl}/usage，Authorization: Bearer <key>。
 * 端点尚未写入官方公开文档，由 farion1231/cc-switch#6433 发现并验证。
 *
 * Key 池发现（三选一）：
 *   1. config.keyNames 显式指定（如 ['go1','go2']）
 *   2. 自动扫描 $DSH_HOME/.credentials.yaml 中所有 OPENCODE_GO_KEY_<名> 条目（排除 ACTIVE）
 *   3. 池为空时回退：显示当前生效键 OPENCODE_GO_API_KEY（单 key 场景）
 *
 * 配置项（插件行 config）：
 *   keyNames: string[]  可选，显式指定 key 池名称
 *   baseUrl:  string    默认 https://opencode.ai/zen/go/v1/usage
 *   refreshMs: number   默认 60000
 *   timeoutMs: number   默认 15000
 *   dshHome:  string    可选，覆盖 DSH home 目录（默认 resolveDshHome()）
 *
 * 安全：密钥只在 Host 侧使用；webServer 路由只返回名称/百分比/状态/重置时间。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/usage'
const SNAPSHOT_PATH = '/plugins/dsh-opencode-go-usage/snapshot'
const SELECT_PATH = '/plugins/dsh-opencode-go-usage/select'

/** 防御式解析单个窗口数据 */
function pickWindow(w) {
  if (!w || typeof w !== 'object') return { status: null, percent: null, resetsAt: null }
  const p = typeof w.percent === 'number' ? w.percent : Number(w.percent)
  return {
    status: typeof w.status === 'string' ? w.status : null,
    percent: Number.isFinite(p) ? p : null,
    resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
  }
}

export default {
  inject: ['credentials', 'timer'],
  apply(ctx, config = {}) {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const refreshMs = config.refreshMs || 60000
    const timeoutMs = config.timeoutMs || 15000
    const dshHome = config.dshHome || resolveDshHome()
    const credPath = join(dshHome, '.credentials.yaml')

    /** 发现 key 池名称：config.keyNames 优先，否则扫描凭证文件的 OPENCODE_GO_KEY_* 前缀 */
    function discoverKeyNames() {
      if (config.keyNames && config.keyNames.length) return config.keyNames.slice()
      let text = ''
      try {
        if (existsSync(credPath)) text = readFileSync(credPath, 'utf8')
      } catch { /* 读取失败按空处理 */ }
      const names = []
      for (const m of text.matchAll(/^OPENCODE_GO_KEY_([A-Za-z0-9_]+)\s*:/gm)) {
        if (m[1] !== 'ACTIVE') names.push(m[1])
      }
      return names
    }

    // ---- 缓存（纯 JSON，可直接序列化跨路由） ----
    let cache = { updatedAt: 0, error: null, entries: [] }
    let refreshing = null

    /** 全局 fetch 拉取单个 key 的用量；任何异常都归为可展示的 error */
    async function fetchKey(key) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch(baseUrl, {
          headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
          signal: ctrl.signal,
        })
        if (res.status === 401) return { error: 'unauthorized', detail: 'HTTP 401' }
        if (!res.ok) return { error: 'http-' + res.status, detail: 'HTTP ' + res.status }
        let data
        try {
          data = await res.json()
        } catch (e) {
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

    /** 刷新整个缓存（并发拉取所有 key；单个 key 失败不影响其他） */
    async function refresh() {
      if (refreshing) return refreshing
      refreshing = (async () => {
        try {
          const names = discoverKeyNames()
          const pool = []
          for (const n of names) {
            const cred = await ctx.credentials.resolve(credentialRef('OPENCODE_GO_KEY_' + n))
            if (cred && cred.value) pool.push({ name: n, key: cred.value })
          }
          // 池为空 → 回退显示当前生效键（单 key 场景）
          let fallbackMain = false
          if (pool.length === 0) {
            const main = await ctx.credentials.resolve(credentialRef('OPENCODE_GO_API_KEY'))
            if (main && main.value) {
              pool.push({ name: 'active', key: main.value })
              fallbackMain = true
            }
          }
          // 先拉用量，最后再读 ACTIVE：刷新期间发生的切换不会被旧值盖回去
          const raw = await Promise.all(pool.map(async (it) => ({ name: it.name, ...(await fetchKey(it.key)) })))
          let active = null
          const act = await ctx.credentials.resolve(credentialRef('OPENCODE_GO_KEY_ACTIVE'))
          if (act && act.value) active = act.value
          const results = raw.map((r) => ({
            name: r.name,
            active: fallbackMain ? r.name === 'active' : r.name === active,
            error: r.error,
            detail: r.detail || null,
            windows: r.windows || null,
          }))
          cache = {
            updatedAt: Date.now(),
            error: pool.length ? null : 'no-keys',
            fallback: fallbackMain,
            entries: results,
          }
        } catch (e) {
          cache = { ...cache, error: 'internal: ' + String((e && e.message) || e) }
        }
      })()
      try {
        await refreshing
      } finally {
        refreshing = null
      }
      return cache
    }

    // 首次立即刷新 + 定时轮询（fiber 清理自动停止）
    refresh()
    ctx.interval(() => { refresh() }, refreshMs)

    // webServer 路由（web profile 必有；懒获取避免阻塞非 web profile 的启动）
    const webServer = ctx.get('webServer')
    if (webServer !== undefined) {
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: SNAPSHOT_PATH,
        handler: async (req, res) => {
          const url = new URL(req.url || '/', 'http://x')
          if (url.searchParams.get('force') === '1') await refresh()
          const body = JSON.stringify(cache)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(body)
        },
      }), 'dsh-opencode-go-usage: snapshot route')
      // 切换生效 key：把池内某个 key 落到 llm-pi-ai 路由解析的 OPENCODE_API_KEY，
      // 并更新面板星标用的 ACTIVE 标记。走 credentials seam，写回凭证文件。
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
            if (!discoverKeyNames().includes(name)) throw new Error('unknown key: ' + name)
            const pool = await ctx.credentials.resolve(credentialRef('OPENCODE_GO_KEY_' + name))
            if (!pool || !pool.value) throw new Error('empty key: ' + name)
            await ctx.credentials.set(credentialRef('OPENCODE_API_KEY'), pool.value)
            await ctx.credentials.set(credentialRef('OPENCODE_GO_KEY_ACTIVE'), name)
            // 立即乐观更新星标并返回；用量百分比后台再拉，不把网络等待算进切换延迟
            cache = {
              ...cache,
              entries: (cache.entries || []).map((e) => ({ ...e, active: e.name === name })),
            }
            send(200, { ok: true, active: name, entries: cache.entries })
            refresh()
          } catch (e) {
            send(400, { ok: false, error: String((e && e.message) || e) })
          }
        },
      }), 'dsh-opencode-go-usage: select route')
    }
  },
}
