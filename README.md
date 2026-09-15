# dsh-opencode-go

[简体中文](README.zh.md) · **English**

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for the **OpenCode Go** subscription: live model routes plus a multi-key usage widget with click-to-switch.

> Merged from `dsh-opencode-go-live` (model routes) and a local fork of upstream [`@xiaweiliang060035/dsh-opencode-go-usage`](https://github.com/xiaweiliang060035/dsh-opencode-go-usage) (usage widget, MIT). See [LICENSE](LICENSE).

## What it does

**Live model routes.** `@deepseek-ai/dsh-llm-pi-ai` ships a static catalog, so a model OpenCode adds to `GET https://opencode.ai/zen/go/v1/models` is invisible until a harness upgrade. This plugin fetches that listing and rewrites the `llm-pi-ai` provider routes:

- Protocols follow OpenCode's own endpoint table ([opencode.ai/docs/go](https://opencode.ai/docs/go)), which wins where it disagrees with the installed pi-ai catalog: `opencode-go` (openai-completions), `opencode-go-anthropic` (anthropic-messages), `opencode-go-responses` (openai-responses).
- Every route carries `x-opencode-session`, which the Go endpoint requires (400 `MissingSessionID` without it).
- A model the catalog already describes on `opencode-go` is written as a bare `{ id }` to inherit capacities, compat, and thinking levels; everything else comes from `runtime/catalog.json`; an unknown id defaults to Chat Completions.
- Syncs at startup, then every `modelRefreshMs` (default 30 min); the `oc_go_sync` tool forces one now.

**Key pool usage and switching.** Keys named `OPENCODE_GO_KEY_<name>` in `$DSH_HOME/.credentials.yaml` (or explicit `keyNames`) are sampled every `usageRefreshMs` against `GET /zen/go/v1/usage`. The active key's card is highlighted; the other cards are clickable and switch with one click — the Host writes `OPENCODE_API_KEY` (the reference the model routes resolve) and `OPENCODE_GO_KEY_ACTIVE` through `ctx.credentials.set`, returns optimistically, and re-samples behind it. Secrets stay in the Host; routes expose names, percentages, and status only.

## Configuration

Override the plugin row's `config` in the profile's `cordis.patch.yml`:

```yaml
- id: opencode-go
  config:
    keyNames: [qq, gmail]
    modelRefreshMs: 1800000
    usageRefreshMs: 60000
    usageTimeoutMs: 15000
    baseUrl: https://opencode.ai/zen/go/v1/usage
    dshHome: ~/.dsh
```

With the versioned credential file, set `keyNames` explicitly: pool entries live indented under `refs:`, and the plugin's automatic scan only reads top-level entries.

## Install

As a commit-pinned bundle dependency:

```sh
dsh plugin --profile web add github:ColorlessBoy/dsh-opencode-go#<commit>
```

The package ships its own `cordis.patch.yml`, so the row composes automatically.

## License

MIT. The usage widget derives from upstream `@xiaweiliang060035/dsh-opencode-go-usage` (MIT); its [LICENSE](LICENSE) and attribution are retained.
