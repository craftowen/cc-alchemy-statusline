---
name: cc-alchemy-statusline
description: Install and configure a feature-rich Claude Code statusline that shows subscription usage (5h/7d), git branch, context window, and last prompt. Use when the user asks to "set up statusline", "show usage in status bar", "configure statusline", or wants to see subscription usage info.
---

# cc-alchemy-statusline

A Claude Code statusline extension that displays subscription usage, git branch, context window, and your last prompt.

## Installation

Run this command to auto-configure:

```bash
npx -y cc-alchemy-statusline
```

Then restart Claude Code.

## What It Shows

- Model name (e.g. `Sonnet 4.5`)
- Git branch with dirty indicator and clickable GitHub link
- Context window usage (e.g. `24k/200k`)
- 5-hour and 7-day subscription usage with reset timer
- Last user prompt from current session
