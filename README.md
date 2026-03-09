# cc-alchemy-statusline

A feature-rich Claude Code statusline that displays subscription usage, git branch, context window, and your last prompt — all in one glance.

[한국어](./README.ko.md)

![preview](./preview.svg)

```
Sonnet 4.5 | main | 24k/200k | 5h 2% (3h51m) | 7d 9% (3d9h)
▸ Your last prompt is displayed here
```

## Features

- **Model name** — Currently active Claude model
- **Git branch** — Current branch (`*` if dirty, clickable link to GitHub)
- **Context window** — Used / total tokens (e.g. `24k/200k`)
- **5h / 7d usage** — Subscription utilization with time until reset
- **Last prompt** — Your most recent message in the current session (up to 2 lines)
- **Color-coded** — Green / Yellow / Red based on usage percentage
- **Zero dependencies** — Pure Node.js stdlib, no npm packages required
- **Cross-platform** — macOS, Linux, Windows

## Install

One command to auto-configure:

```bash
npx -y cc-alchemy-statusline
```

Restart Claude Code and you're done.

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
