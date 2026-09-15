/**
 * dsh-opencode-go-usage — Client half（分享版 0.2.0）
 * ------------------------------------------------------------------
 * 浏览器 bundle（window.__ModuleLoader__.load 格式）。
 * 挂载点：shell.overlay（全帧悬浮层，list 型、无替换风险）。
 * 数据流：fetch('/plugins/dsh-opencode-go-usage/snapshot') 拉 Host 缓存，
 *         60s 自动轮询 + 手动强制刷新（?force=1）。
 * 视觉：主题 token（--dsw-alias-*）；三档分级色；按钮角标显示全池最差窗口。
 * 语言：按浏览器语言自动选中/英（navigator.language 前缀 zh → 中文）。
 */
window.__ModuleLoader__.load({
  id: '@xiaweiliang060035/dsh-opencode-go-usage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    // ---- 中英字典 ----
    const zh = {
      title: 'OpenCode Go 用量',
      update: '更新',
      refresh: '刷新',
      collapse: '收起',
      loading: '加载中…',
      failed: '快照拉取失败，请重试',
      noKeys: '未配置 opencode-go key（.credentials.yaml 无 OPENCODE_GO_KEY_*）',
      hostError: 'Host 错误',
      noEntries: '未发现 key',
      keyFail: '该 key 查询失败',
      rolling: '滚动',
      weekly: '每周',
      monthly: '每月',
      limited: '⚠ 已限流',
      reset: '已重置',
      network: '网络失败',
      unauthorized: '密钥无效(401)',
      badJson: '响应解析失败',
      fabTitle: 'OpenCode Go 用量（角标=当前key最差窗口，点击展开）',
      clickToSwitch: '点击切换到此 key',
    }
    const en = {
      title: 'OpenCode Go usage',
      update: 'Updated',
      refresh: 'Refresh',
      collapse: 'Collapse',
      loading: 'Loading…',
      failed: 'Failed to fetch snapshot, retry later',
      noKeys: 'No opencode-go keys configured (no OPENCODE_GO_KEY_* in .credentials.yaml)',
      hostError: 'Host error',
      noEntries: 'No keys found',
      keyFail: 'Query failed for this key',
      rolling: 'Rolling',
      weekly: 'Weekly',
      monthly: 'Monthly',
      limited: '⚠ rate-limited',
      reset: 'Reset',
      network: 'Network error',
      unauthorized: 'Invalid key (401)',
      badJson: 'Response parse failed',
      fabTitle: 'OpenCode Go usage (badge = worst window of the current key)',
      clickToSwitch: 'Click to switch to this key',
    }
    const isZh = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')
    const t = isZh ? zh : en

    // ---- 样式注入（data-plugin-css 标记防重复） ----
    const CSS_ID = 'dsh-opencode-go-usage/css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = `
.oguf-fab {
  position: fixed; left: 14px; bottom: 14px;
  z-index: 1000; width: 38px; height: 38px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(150deg, var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-overlay));
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 2px 8px rgba(0,0,0,.16), inset 0 1px 0 rgba(255,255,255,.03);
  cursor: pointer; user-select: none;
  transition: transform .18s cubic-bezier(.2,.8,.3,1.2), box-shadow .18s ease;
}
.oguf-fab:hover { transform: scale(1.08); box-shadow: 0 4px 14px rgba(0,0,0,.26); }
.oguf-fab:active { transform: scale(.96); }
.oguf-fab-bars { display: flex; align-items: flex-end; gap: 2.5px; height: 13px; }
.oguf-fab-bars i { width: 3px; border-radius: 1.5px; background: var(--dsw-alias-label-secondary); transition: background .2s; }
.oguf-fab:hover .oguf-fab-bars i { background: var(--dsw-alias-label-primary); }
.oguf-fab .oguf-fab-dot {
  position: absolute; right: -3px; top: -3px; min-width: 15px; height: 15px;
  border-radius: 7.5px; font-size: 8px; line-height: 15px; text-align: center;
  padding: 0 2.5px; color: #fff; font-weight: 700;
  border: 1.5px solid var(--dsw-alias-bg-overlay);
}
.oguf-fab.oguf-lv-ok .oguf-fab-dot { background: var(--dsw-alias-state-success-primary); }
.oguf-fab.oguf-lv-warn .oguf-fab-dot { background: var(--dsw-alias-state-warn-primary); }
.oguf-fab.oguf-lv-err .oguf-fab-dot { background: var(--dsw-alias-state-error-primary); animation: oguf-pulse 1.2s infinite; }
.oguf-fab.oguf-lv-na .oguf-fab-dot { background: var(--dsw-alias-label-secondary); }
@keyframes oguf-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,60,60,.45); } 50% { box-shadow: 0 0 0 5px rgba(220,60,60,0); } }

.oguf-panel {
  position: fixed; left: 14px; bottom: 62px;
  z-index: 999; width: 320px; max-height: 76vh; overflow: auto;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,.26);
  padding: 10px 12px 8px; font-size: 11px;
  animation: oguf-pop .16s ease;
}
@keyframes oguf-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.oguf-panel-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.oguf-panel-title { font-size: 12.5px; font-weight: 700; color: var(--dsw-alias-label-primary); flex: 1; }
.oguf-panel-time { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.oguf-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 5px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.oguf-icon-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.oguf-icon-btn svg { display: block; }

.oguf-key {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); padding: 6px 8px; margin-bottom: 6px;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease;
}
.oguf-key:last-child { margin-bottom: 0; }
.oguf-key.oguf-key-clickable { cursor: pointer; }
/* 可点击提示：中性描边 + 底色 + 轻微抬起，刻意不用品牌色 */
.oguf-key.oguf-key-clickable:hover {
  border-color: var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 1px 6px rgba(0,0,0,.12);
  transform: translateY(-1px);
}
/* 当前生效：品牌色描边 + 左侧强调条，与 hover 态不重合 */
.oguf-key.oguf-key-active {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: inset 3px 0 0 0 var(--dsw-alias-brand-primary);
}
.oguf-key-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.oguf-key-name { font-weight: 700; font-size: 11px; color: var(--dsw-alias-label-primary); }
.oguf-key-err { margin-left: auto; font-size: 10px; color: var(--dsw-alias-state-error-primary); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oguf-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.oguf-row-label { width: 38px; flex: none; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.oguf-bar { flex: 1; height: 4px; border-radius: 2px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; min-width: 50px; }
.oguf-bar-fill { height: 100%; border-radius: 2px; transition: width .3s ease; }
.oguf-bar-fill.ok { background: var(--dsw-alias-state-success-primary); }
.oguf-bar-fill.warn { background: var(--dsw-alias-state-warn-primary); }
.oguf-bar-fill.err { background: var(--dsw-alias-state-error-primary); }
.oguf-row-pct { width: 34px; flex: none; text-align: right; font-size: 10px; font-weight: 700; color: var(--dsw-alias-label-primary); }
.oguf-row-reset { width: 82px; flex: none; text-align: right; font-size: 9px; color: var(--dsw-alias-label-secondary); }
.oguf-limit { font-size: 9px; font-weight: 700; color: var(--dsw-alias-state-error-primary); }
.oguf-empty { color: var(--dsw-alias-label-secondary); padding: 12px 0; text-align: center; }
`
      document.head.appendChild(tag)
    }

    // ---- 数据路由 ----
    const API = '/plugins/dsh-opencode-go-usage/snapshot'
    const API_SELECT = '/plugins/dsh-opencode-go-usage/select'

    // ---- 工具函数 ----
    // 用量分级：rate-limited 视为最严重；>=85 红，>=60 橙，否则绿；无数据灰
    function level(p, status) {
      if (status === 'rate-limited') return 'err'
      if (p === null || p === undefined || Number.isNaN(p)) return 'na'
      if (p >= 85) return 'err'
      if (p >= 60) return 'warn'
      return 'ok'
    }
    const LV_RANK = { na: 0, ok: 1, warn: 2, err: 3 }
    // 角标取数：优先「当前生效 key(active)」的最差窗口；无 active 标记时回退全池最差
    function worstActiveOf(data) {
      if (!data || !data.entries || !data.entries.length) return null
      const actives = data.entries.filter((e) => e.active)
      const candidates = actives.length ? actives : data.entries
      let w = null
      for (const e of candidates) {
        if (!e.windows) continue
        for (const k of ['rolling', 'weekly', 'monthly']) {
          const win = e.windows[k]
          if (!win) continue
          const lv = level(win.percent, win.status)
          const p = (typeof win.percent === 'number' && Number.isFinite(win.percent)) ? win.percent : -1
          if (!w || LV_RANK[lv] > LV_RANK[w.lv] || (LV_RANK[lv] === LV_RANK[w.lv] && p > w.p)) {
            w = { lv: lv, p: p, name: e.name, key: k }
          }
        }
      }
      return w
    }
    // 重置倒计时文案
    function fmtRemain(iso) {
      if (!iso) return '—'
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return '—'
      const ms = d.getTime() - Date.now()
      if (ms <= 0) return t.reset
      const min = Math.floor(ms / 60000)
      if (min < 60) return min + 'm'
      const h = Math.floor(min / 60)
      if (h < 24) return h + 'h' + (min % 60) + 'm'
      return Math.floor(h / 24) + 'd' + (h % 24) + 'h'
    }
    function fmtTime(ts) {
      if (!ts) return '—'
      const d = new Date(ts)
      return d.toLocaleTimeString()
    }
    function errText(code) {
      const map = { network: t.network, unauthorized: t.unauthorized, 'bad-json': t.badJson }
      if (code && code.startsWith('http-')) return 'HTTP ' + code.slice(5)
      return map[code] || (code || t.keyFail)
    }
    const WIN_LABEL = { rolling: t.rolling, weekly: t.weekly, monthly: t.monthly }

    // ---- 悬浮按钮 + 展开面板 ----
    function UsageFab() {
      const [open, setOpen] = React.useState(false)
      const [data, setData] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [left, setLeft] = React.useState(null)
      const panelRef = React.useRef(null)
      const fabRef = React.useRef(null)

      // “main 列左下角”：sidebar 是 grid 的第一条 track，量出它的宽度作左偏移
      React.useEffect(() => {
        const measure = () => {
          const layer = document.querySelector('[data-shell-overlay]')
          const frame = layer && layer.parentElement
          if (!frame) return
          const track = getComputedStyle(frame).gridTemplateColumns.split(' ').filter(Boolean)[0]
          setLeft(frame.getBoundingClientRect().left + (parseFloat(track) || 0) + 14)
        }
        measure()
        const layer = document.querySelector('[data-shell-overlay]')
        const frame = layer && layer.parentElement
        const ro = typeof ResizeObserver !== 'undefined' && frame ? new ResizeObserver(measure) : null
        if (ro) ro.observe(frame)
        const mo = typeof MutationObserver !== 'undefined' && frame ? new MutationObserver(measure) : null
        if (mo) mo.observe(frame, { attributes: true, attributeFilter: ['style', 'data-sidebar-collapsed'] })
        window.addEventListener('resize', measure)
        return () => {
          if (ro) ro.disconnect()
          if (mo) mo.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [])
      const posStyle = left === null ? undefined : { left: left + 'px' }

      const load = (force) => fetch(force ? API + '?force=1' : API, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((res) => {
          setData(res)
          setFailed(false)
          return res
        })
        .catch(() => {
          setFailed(true)
        })

      // 切换生效 key：本地先乐观标星，Host 返回后以它为准；百分比交给轮询/手动刷新
      const selectKey = (name) => {
        setData((d) => (d && d.entries
          ? { ...d, entries: d.entries.map((e) => ({ ...e, active: e.name === name })) }
          : d))
        fetch(API_SELECT + '?name=' + encodeURIComponent(name), { method: 'POST', cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((j) => { if (j && j.entries) setData((d) => ({ ...(d || {}), entries: j.entries })) })
          .catch(() => setFailed(true))
      }

      // 首次拉取 + 60s 自动轮询（卸载时清理）
      React.useEffect(() => {
        load(false)
        const id = setInterval(() => load(false), 60000)
        return () => clearInterval(id)
      }, [])

      // 点击面板与悬浮按钮以外的地方也收起
      React.useEffect(() => {
        if (!open) return undefined
        const onDown = (ev) => {
          if (panelRef.current && panelRef.current.contains(ev.target)) return
          if (fabRef.current && fabRef.current.contains(ev.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', onDown, true)
        return () => document.removeEventListener('pointerdown', onDown, true)
      }, [open])

      // 面板主体渲染
      function renderBody() {
        if (failed) {
          return React.createElement('div', { className: 'oguf-empty' }, t.failed)
        }
        if (!data) {
          return React.createElement('div', { className: 'oguf-empty' }, t.loading)
        }
        if (data.error) {
          const msg = data.error === 'no-keys'
            ? t.noKeys
            : t.hostError + ': ' + data.error
          return React.createElement('div', { className: 'oguf-empty' }, msg)
        }
        if (!data.entries || !data.entries.length) {
          return React.createElement('div', { className: 'oguf-empty' }, t.noEntries)
        }
        return data.entries.map((e) => {
          const head = React.createElement('div', { className: 'oguf-key-head' },
            React.createElement('span', { className: 'oguf-key-name' }, e.name),
            e.error
              ? React.createElement('span', { className: 'oguf-key-err', title: e.detail || '' }, errText(e.error))
              : null)
          let body
          if (e.windows) {
            body = ['rolling', 'weekly', 'monthly'].map((k) => {
              const w = e.windows[k]
              const p = (w && typeof w.percent === 'number' && Number.isFinite(w.percent)) ? Math.round(w.percent) : null
              const lv = level(w && w.percent, w && w.status)
              const limited = w && w.status === 'rate-limited'
              const width = (p === null ? 0 : Math.max(0, Math.min(100, p))) + '%'
              return React.createElement('div', { key: k, className: 'oguf-row' },
                React.createElement('span', { className: 'oguf-row-label' }, WIN_LABEL[k]),
                React.createElement('div', { className: 'oguf-bar' },
                  React.createElement('div', { className: 'oguf-bar-fill ' + (lv === 'na' ? 'ok' : lv), style: { width: width } })),
                React.createElement('span', { className: 'oguf-row-pct' }, p === null ? '—' : p + '%'),
                React.createElement('span', { className: 'oguf-row-reset' },
                  limited
                    ? React.createElement('span', { className: 'oguf-limit' }, t.limited)
                    : fmtRemain(w && w.resetsAt)))
            })
          } else {
            body = React.createElement('div', { className: 'oguf-empty' }, t.keyFail)
          }
          return React.createElement('div', {
            key: e.name,
            className: 'oguf-key' + (e.active ? ' oguf-key-active' : ' oguf-key-clickable'),
            title: e.active ? undefined : t.clickToSwitch,
            onClick: e.active ? undefined : () => selectKey(e.name),
          }, head, body)
        })
      }

      const worst = worstActiveOf(data)
      const lv = failed ? 'err' : (worst ? worst.lv : 'na')
      const badge = failed ? '!' : (worst ? (worst.p >= 0 ? String(Math.round(worst.p)) : '⚠') : '…')

      return React.createElement(React.Fragment, null,
        // 常驻悬浮图标（柱状图 = 三窗口用量语义）
        React.createElement('button', {
          ref: fabRef,
          className: 'oguf-fab oguf-lv-' + lv,
          style: posStyle,
          title: t.fabTitle,
          onClick: () => setOpen(!open),
        },
          React.createElement('span', { className: 'oguf-fab-bars' },
            React.createElement('i', { style: { height: '38%' } }),
            React.createElement('i', { style: { height: '62%' } }),
            React.createElement('i', { style: { height: '88%' } })),
          React.createElement('span', { className: 'oguf-fab-dot' }, badge)),
        // 展开面板
        open
          ? React.createElement('div', { ref: panelRef, className: 'oguf-panel', style: posStyle },
              React.createElement('div', { className: 'oguf-panel-head' },
                React.createElement('span', { className: 'oguf-panel-title' }, t.title),
                React.createElement('span', { className: 'oguf-panel-time' }, t.update + ' ' + fmtTime(data && data.updatedAt)),
                React.createElement('button', { className: 'oguf-icon-btn', title: t.refresh, onClick: () => load(true) },
                  React.createElement('svg', {
                    viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor',
                    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
                  },
                    React.createElement('path', { d: 'M13.5 6.2A5.5 5.5 0 1 1 12 3.7' }),
                    React.createElement('path', { d: 'M13.6 2.4v3.4H10.2' }))),
                React.createElement('button', { className: 'oguf-icon-btn', title: t.collapse, onClick: () => setOpen(false) },
                  React.createElement('svg', {
                    viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor',
                    strokeWidth: 1.6, strokeLinecap: 'round',
                  },
                    React.createElement('path', { d: 'M4 4l8 8' }),
                    React.createElement('path', { d: 'M12 4l-8 8' })))),
              renderBody())
          : null)
    }

    // ---- 插件装配 ----
    function apply(ctx, config) {
      // 可选定制：config.hideCordisPanel=true 时隐藏左侧栏「Cordis 插件」管理入口
      // （默认不隐藏；需要隐藏时在 profile 的 patch 里给本插件行加 config）
      if (config && config.hideCordisPanel && typeof document !== 'undefined') {
        const hid = document.createElement('style')
        hid.dataset.pluginCss = 'dsh-opencode-go-usage/hide-cordis'
        hid.textContent = 'button[aria-label="Cordis 插件"], button[aria-label="Cordis plugins"] { display: none !important; }'
        document.head.appendChild(hid)
      }
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'opencode-usage-fab', order: 200, label: 'OpenCode Go usage' },
        () => React.createElement(UsageFab, null)
      ))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
