# cc-alchemy-statusline

[![npm version](https://img.shields.io/npm/v/cc-alchemy-statusline.svg)](https://www.npmjs.com/package/cc-alchemy-statusline)
[![npm downloads](https://img.shields.io/npm/dm/cc-alchemy-statusline.svg)](https://www.npmjs.com/package/cc-alchemy-statusline)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> A feature-rich statusline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — model, branch, context, usage, tasks, and your last prompt at a glance.

[한국어](./README.ko.md)

![preview](./preview.svg)

```
┌──────────────────────────────────────────────────────────────────┐
│ Opus 4.6 (1M) │ main │ 42k/1M │ 5h 2% (3h51m) │ Tasks 3/5    │
│ ▸ 14:32 add npm download chart to README and todo progress to…  │
└──────────────────────────────────────────────────────────────────┘
```

- **Line 1** — Model, branch, context, usage, task progress
- **Line 2** — `▸ HH:MM` timestamp + your last prompt (truncated to fit)

## Install

```bash
npx -y cc-alchemy-statusline
```

Restart Claude Code and you're done.

## Features

- **Model name** — Currently active Claude model (e.g. `Opus 4.6 (1M)`)
- **Git branch** — Current branch (`*` if dirty, clickable link to GitHub)
- **Context window** — Used / total tokens (e.g. `42k/1M`)
- **5h / 7d usage** — Subscription utilization with time until reset
- **Task progress** — TodoWrite completion count (e.g. `Tasks 3/5`)
- **Last prompt** — `▸ HH:MM` your most recent message, displayed on line 2
- **Color-coded** — Green / Yellow / Red based on usage percentage
- **Zero dependencies** — Pure Node.js stdlib, no npm packages required
- **Cross-platform** — macOS, Linux, Windows

## How It Works

The statusline reads data from:

1. **Claude Code stdin** — Model info, workspace, context window
2. **Anthropic API** — 5-hour and 7-day subscription usage (cached, background refresh)
3. **Git CLI** — Branch name, dirty state, remote URL
4. **Session history** — Last user prompt from `~/.claude/history.jsonl`

## Requirements

- Node.js 18+
- Claude Code CLI (logged in)

## License

MIT
