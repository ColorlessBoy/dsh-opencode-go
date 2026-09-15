# dsh-opencode-go

**简体中文** · [English](README.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web profile 插件，把 **OpenCode Go** 订阅完整接进来：模型列表实时同步 + 多 key 用量面板与一键切换。

> 由两部分合并而来：`dsh-opencode-go-live`（模型路由）与上游 [`@xiaweiliang060035/dsh-opencode-go-usage`](https://github.com/xiaweiliang060035/dsh-opencode-go-usage) 的本地 fork（用量面板，MIT）。见 [LICENSE](LICENSE)。

## 功能

### 1. 模型路由实时同步

`@deepseek-ai/dsh-llm-pi-ai` 的目录是静态的，厂商新上的模型要等 dsh 升级才可见。本插件拉取 `GET https://opencode.ai/zen/go/v1/models`，据此改写 `llm-pi-ai` 的 provider route：

- 按**官方端点表**（[opencode.ai/docs/go](https://opencode.ai/docs/go)）把模型拆到三条 route：`opencode-go`（openai-completions）、`opencode-go-anthropic`（anthropic-messages）、`opencode-go-responses`（openai-responses）。官方表与 pi-ai 内置目录冲突时**以官方表为准**。
- Go 端点要求每个请求带 `x-opencode-session` 头（缺失返回 `400 MissingSessionID`），三条 route 都会写入。
- 内置目录已描述的模型写成裸 `{ id }` 继承容量/compat/思考档位；其余用 `runtime/catalog.json` 的完整条目；未知新 id 默认 Chat Completions。
- 启动时同步一次，之后按 `modelRefreshMs`（默认 30 分钟）轮询；工具 `oc_go_sync` 可立即同步。

### 2. Key 池用量 + 点击切换

- 读取 `$DSH_HOME/.credentials.yaml` 中的 `OPENCODE_GO_KEY_<名>` 作为 key 池（也可用 `keyNames` 显式指定）。
- 每 `usageRefreshMs`（默认 60 秒）采样 `GET /zen/go/v1/usage`，悬浮组件展示滚动/每周/每月。
- 当前生效 key 卡片高亮（品牌色描边 + 左侧强调条）；鼠标移到其他卡片变中性描边并可点击，**点整张卡片即切换**：Host 通过 `ctx.credentials.set` 改写 `OPENCODE_API_KEY`（模型请求实际解析的引用）与 `OPENCODE_GO_KEY_ACTIVE`（高亮标记）。切换只做本地写入并乐观返回，用量百分比后台再刷。
- 悬浮组件在 **main 列左下角**（运行时量 sidebar 的 grid track，并在其折叠/展开动画期间逐帧跟随）；刷新/关闭为图标按钮；点击面板外收起。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖插件行 `config`：

```yaml
- id: opencode-go
  config:
    keyNames: [qq, gmail]   # 显式 key 池名（不写则扫描 OPENCODE_GO_KEY_* 顶级条目）
    modelRefreshMs: 1800000 # 模型列表轮询
    usageRefreshMs: 60000   # 用量轮询
    usageTimeoutMs: 15000
    baseUrl: https://opencode.ai/zen/go/v1/usage
    dshHome: ~/.dsh
```

> 注意：池名写在 `refs:` 下会缩进，插件自动扫描只看顶级条目，所以 `version: 1` 凭证文件请显式设置 `keyNames`。

## 凭据

```yaml
version: 1
refs:
  OPENCODE_API_KEY: sk-…              # 模型请求实际使用
  OPENCODE_GO_KEY_qq: sk-…            # 池成员
  OPENCODE_GO_KEY_gmail: sk-…
  OPENCODE_GO_KEY_ACTIVE: gmail       # 面板高亮（切换时自动更新）
records: { … }
```

## 安装

作为 profile 的 bundle 依赖，按 commit 固定：

```sh
dsh plugin --profile web add github:ColorlessBoy/dsh-opencode-go#<commit>
```

包自带 `cordis.patch.yml`，插件行自动组合，无需手改 patch。密钥始终只在 Host 侧使用；webServer 路由只返回名称/百分比/状态/重置时间。

## 工具

- `oc_go_status` — 只读：模型同步时间/数量、key 池与用量、上次错误。
- `oc_go_sync` — 立即拉取模型列表并写入 routes。

## 已知局限

- `runtime/catalog.json` 是快照；模型上新想立刻拿到容量/compat 元数据，用 `scripts/generate-catalog.mjs` 重新生成。
- 官方表未列且家族前缀未命中的新 id 按 Chat Completions + 保守容量处理。
- 用量端点未写入官方公开文档，响应按防御式解析。
- 累计目录里 `reasoning: true` 但无 thinking map 的模型（如 `minimax-m3`）在拆分出的 route 上会退化为非推理。

## 许可

MIT。用量组件派生自上游 `@xiaweiliang060035/dsh-opencode-go-usage`（MIT），保留其 [LICENSE](LICENSE) 与相关 README 署名。
