# dsh-opencode-go-usage

**简体中文** · [English](README.md)

> 本地 fork（0.3.0-dsh.1），基于上游 0.3.0（MIT）。改动：悬浮组件移到左下角、点击面板外收起、每张 key 卡加"切换"按钮（Host 新增 `POST /plugins/dsh-opencode-go-usage/select?name=<池内名称>`，经 `ctx.credentials.set` 改写 `OPENCODE_API_KEY` 与 `OPENCODE_GO_KEY_ACTIVE`）。

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 WebUI 插件：在页面右侧提供**常驻悬浮组件**，实时展示 **OpenCode Go** 套餐中 **key 池内每个 key** 的用量——**滚动 / 每周 / 每月**三个窗口的已用百分比、进度条与重置倒计时。

## 特性

- **悬浮组件**：紧凑按钮固定在页面右侧边缘，角标实时显示**全部 key 中最差窗口**的百分比；颜色分级（绿 / 橙 / 红色脉冲）让你一眼看出是否有 key 接近额度上限。
- **展开面板**：点击按钮展开面板，每个 key 一张卡（当前生效 key 带 ★ 标记），展示滚动 / 每周 / 每月用量（进度条 + 百分比 + 距重置时间）；被限流的窗口标 ⚠。
- **实时刷新**：Host 每 60 秒轮询官方用量端点（可配置），面板自动刷新并提供手动刷新按钮。
- **自动发现 key 池**：自动读取 `$DSH_HOME/.credentials.yaml` 中的 `OPENCODE_GO_KEY_<名>` 条目——**key 的数量与命名均不写死**；无池时回退显示当前生效键（`OPENCODE_GO_API_KEY`）。
- **中英双语**：按浏览器语言自动切换。
- **主题适配**：使用 DSH 主题 token，明暗主题均适配。

## 界面预览

![悬浮组件](docs/screenshot.png)

## 工作原理

**Host 半**（Node ESM）：

1. 发现 key 池名称——优先使用 `config.keyNames`，否则自动扫描 `.credentials.yaml` 中的 `OPENCODE_GO_KEY_*` 条目。
2. 通过 `credentials` 服务解析每个 key 的值（环境变量 → 凭证文件 → `.env` 分层）。
3. 携带 `Authorization: Bearer <key>` 调用官方用量端点：

```http
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <API_KEY>
```

响应示例：

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 9,  "resetsAt": "2026-08-14T07:20:04.810Z" },
    "weekly":  { "status": "ok", "percent": 12, "resetsAt": "2026-08-17T00:00:00.810Z" },
    "monthly": { "status": "ok", "percent": 6,  "resetsAt": "2026-09-09T00:41:03.810Z" }
  }
}
```

> 该用量端点尚未写入 OpenCode 官方公开文档，由 [farion1231/cc-switch#6433](https://github.com/farion1231/cc-switch/issues/6433) 发现并验证。解析采用防御式处理。

**Client 半**（浏览器 bundle）注册在 `shell.overlay` 槽位，轮询 Host 的 webServer 路由 `/plugins/dsh-opencode-go-usage/snapshot`。**密钥始终不出 Host。**

## 环境要求

- Node.js + DeepSeek Harness **web profile**（默认 `dsh web` profile 已挂载本插件所需的 `webServer`、`credentials`、`timer` 服务）。

## 安装

### 方式 A：本地包 + `file:` 依赖（推荐）

1. 将插件包目录拷贝到任意位置，例如 `D:\tools\dsh-opencode-go-usage`。
2. 在 profile 的 `package.json`（如 `$DSH_HOME/profiles/web/package.json`）的 `dependencies` 中加入：

```json
"@xiaweiliang060035/dsh-opencode-go-usage": "file:D:/tools/dsh-opencode-go-usage"
```

3. 将包加入 profile 的 bundle 列表（`dsh.profile.bundles`）：

```json
"dsh": {
  "profile": {
    "bundles": [ "...原有...", "dsh-opencode-go-usage" ]
  }
}
```

4. 安装并重启：

```sh
cd $DSH_HOME/profiles/web
pnpm install
# 重启 dsh web
```

包自带 `cordis.patch.yml`（通过 `dsh.bundle.patch` 声明），插件行会自动组合——**无需手动编辑 patch**。

### 方式 B：npm 安装

插件已发布到 npm：`@xiaweiliang060035/dsh-opencode-go-usage`

```sh
cd $DSH_HOME/profiles/web
pnpm add @xiaweiliang060035/dsh-opencode-go-usage
```

然后将 `"@xiaweiliang060035/dsh-opencode-go-usage"` 加入 profile 的 `dsh.profile.bundles` 列表并重启 `dsh web`。

> 插件包含 Host 半（fetch + webServer 路由）与 Client 半（浏览器 bundle）两部分。**仅拷贝到 `plugins/` 目录并用相对路径 patch 注册，只会加载 Host 半**——悬浮图标必须通过上述 bundle 机制加载。

## 配置项

可调参数在插件行 `config` 中覆盖（在 profile 的 `cordis.patch.yml` 里写）：

```yaml
- id: opencode-go-usage
  config:
    keyNames: [go1, go2]      # 可选：显式指定 key 池名称
    baseUrl: https://opencode.ai/zen/go/v1/usage   # 可选
    refreshMs: 60000          # 可选：轮询间隔（毫秒）
    timeoutMs: 15000          # 可选：请求超时（毫秒）
    dshHome: ~                # 可选：覆盖 DSH home 目录
    hideCordisPanel: true     # 可选：隐藏左侧栏内置的「Cordis 插件」管理入口
```

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `keyNames` | 自动发现 | 显式指定 key 池名称（对应 `.credentials.yaml` 中 `OPENCODE_GO_KEY_<名>`） |
| `baseUrl` | `https://opencode.ai/zen/go/v1/usage` | 用量端点地址 |
| `refreshMs` | `60000` | Host 轮询间隔（毫秒） |
| `timeoutMs` | `15000` | 请求超时（毫秒） |
| `dshHome` | `resolveDshHome()` | 含 `.credentials.yaml` 的 DSH home 目录 |
| `hideCordisPanel` | `false` | 隐藏左侧栏内置的「Cordis 插件」管理入口（动态插件管理面板） |

## Key 池格式

插件从 `$DSH_HOME/.credentials.yaml`（DSH 标准凭证文件）读取 key。池示例：

```yaml
OPENCODE_GO_API_KEY: sk-opencode-…      # 当前生效 key
OPENCODE_GO_KEY_ACTIVE: go2             # 池中哪个条目生效
OPENCODE_GO_KEY_go1: sk-opencode-…
OPENCODE_GO_KEY_go2: sk-opencode-…
OPENCODE_GO_KEY_go3: sk-opencode-…
```

任意 `OPENCODE_GO_KEY_<名>` 条目都会被自动发现——**key 的数量与命名均不受限制**。如果只有一个 key（无池），只需设置 `OPENCODE_GO_API_KEY`，插件会显示这个单一 key。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 悬浮组件显示 `!` | 快照拉取失败——检查 `dsh web` 是否运行、路由 `/plugins/dsh-opencode-go-usage/snapshot` 是否有响应 |
| 卡片显示 `密钥无效(401)` | 该 key 无效或已过期 |
| 卡片显示 `网络失败` | Host 无法访问 `opencode.ai`（代理 / 断网 / 超时） |
| 面板提示"未配置 key" | `.credentials.yaml` 中既无 `OPENCODE_GO_KEY_*` 也无 `OPENCODE_GO_API_KEY` |
| `⚠ 已限流` | 该窗口额度已用尽（服务端限制） |

## 许可证

MIT
