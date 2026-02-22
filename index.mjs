#!/usr/bin/env node
/**
 * Claude Code Statusline — subscription usage tracker
 * Model | Git branch | 20k/200k | 5h 18% (2h34m) | 7d 32% (3d20h)
 *
 * Cross-platform: macOS, Linux, Windows.
 * Reads OAuth token from:
 *   1. CLAUDE_CODE_OAUTH_TOKEN env var
 *   2. macOS Keychain (macOS only)
 *   3. Windows Credential Manager via native CredRead API (Windows only)
 *   4. ~/.claude/.credentials.json (all platforms)
 * No external dependencies — Node.js stdlib only.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { execFileSync, spawn } from "child_process";
import { request } from "https";
import { fileURLToPath } from "url";

const IS_WIN = platform() === "win32";
const HOME = homedir();
const CACHE_FILE = join(HOME, ".claude", "statusline_cache.json");
const CREDS_FILE = join(HOME, ".claude", ".credentials.json");
const SCRIPT_PATH = fileURLToPath(import.meta.url);

// --- Windows UTF-8 setup ---
if (IS_WIN) {
  try {
    execFileSync("chcp.com", ["65001"], { stdio: "ignore" });
  } catch {}
}

// --- Colors ---
function supportsColor() {
  if (!IS_WIN) return true;
  if (process.env.WT_SESSION || process.env.TERM_PROGRAM) return true;
  if (process.env.ConEmuANSI === "ON") return true;
  if (process.env.COLORTERM) return true;
  return false;
}

const USE_COLOR = supportsColor();
const rgb = (r, g, b) => USE_COLOR ? `\x1b[38;2;${r};${g};${b}m` : "";
const RST = USE_COLOR ? "\x1b[0m" : "";
const DIM = rgb(108, 112, 134);
const TEXT = rgb(205, 214, 244);
const BRANCH = rgb(137, 180, 250);
const DIRTY = rgb(250, 179, 135);
const GREEN = rgb(166, 227, 161);
const YELLOW = rgb(249, 226, 175);
const RED = rgb(243, 139, 168);

const pcolor = (p) => (p < 50 ? GREEN : p < 90 ? YELLOW : RED);

function ftok(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

const osc8 = (url, text) =>
  USE_COLOR ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : text;

function loadJson(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  } catch {
    return {};
  }
}

function exec(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function gitInfo(cwd) {
  let br = exec("git", ["branch", "--show-current"], cwd);
  if (!br) br = exec("git", ["rev-parse", "--short", "HEAD"], cwd).slice(0, 7);
  if (!br) return { branch: "", dirty: false, remote: "" };

  const dirty = exec("git", ["status", "--porcelain"], cwd).length > 0;
  let url = exec("git", ["remote", "get-url", "origin"], cwd);
  if (url.startsWith("git@github.com:"))
    url = url.replace("git@github.com:", "https://github.com/");
  if (url.endsWith(".git")) url = url.slice(0, -4);

  return { branch: br, dirty, remote: url };
}

// --- Token retrieval ---
function getToken() {
  // 1. Env var
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN)
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;

  // 2. macOS Keychain
  if (platform() === "darwin") {
    try {
      const raw = execFileSync(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  // 3. Windows Credential Manager (native CredRead API — no modules needed)
  if (IS_WIN) {
    try {
      const ps = `
Add-Type -Namespace Win32 -Name Cred -MemberDefinition @'
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
'@
foreach($key in @("Claude Code-credentials","Claude Code","claude-code")){
  $ptr=[IntPtr]::Zero
  if([Win32.Cred]::CredRead($key,1,0,[ref]$ptr)){
    $c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr,[type][Win32.Cred+CREDENTIAL])
    if($c.CredentialBlobSize -gt 0){
      [System.Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob,$c.CredentialBlobSize/2)
      [Win32.Cred]::CredFree($ptr)
      break
    }
    [Win32.Cred]::CredFree($ptr)
  }
}`.trim();
      const raw = execFileSync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        { encoding: "utf8", timeout: 8000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      if (raw) {
        const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {}
  }

  // 4. Credentials file — check multiple locations
  const credPaths = [CREDS_FILE];
  if (IS_WIN) {
    const appdata = process.env.APPDATA || "";
    const localappdata = process.env.LOCALAPPDATA || "";
    if (appdata) {
      credPaths.push(join(appdata, "Claude", ".credentials.json"));
      credPaths.push(join(appdata, "claude-code", ".credentials.json"));
    }
    if (localappdata) {
      credPaths.push(join(localappdata, "Claude", ".credentials.json"));
    }
  }
  for (const p of credPaths) {
    try {
      if (existsSync(p)) {
        const token = JSON.parse(readFileSync(p, "utf8"))
          ?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {}
  }

  return null;
}

// --- Usage fetch ---
function doFetchRequest(token) {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          "anthropic-version": "2023-06-01",
        },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const cache = { cached_at: new Date().toISOString() };
            for (const key of ["five_hour", "seven_day"]) {
              if (data[key]) cache[key] = data[key];
            }
            writeFileSync(CACHE_FILE, JSON.stringify(cache));
          } catch {}
          resolve();
        });
      }
    );
    req.on("error", () => resolve());
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}

function fetchUsage() {
  const token = getToken();
  if (!token) return;

  // Always background — never block the statusline output
  if (IS_WIN) {
    spawn(process.execPath, [SCRIPT_PATH, "--fetch-only"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } else {
    spawn(process.execPath, [SCRIPT_PATH, "--fetch-only"], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
}

async function fetchOnly() {
  const token = getToken();
  if (!token) process.exit(1);
  await doFetchRequest(token);
}

// --- Main ---
function main() {
  if (process.argv.includes("--fetch-only")) {
    fetchOnly();
    return;
  }

  // If stdin is a TTY (direct terminal run), auto-configure Claude Code statusline
  if (process.stdin.isTTY) {
    const settingsPath = join(HOME, ".claude", "settings.json");
    let settings = {};
    try {
      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      }
    } catch {}

    const cmd = "npx cc-alchemy-statusline";
    if (settings?.statusLine?.command === cmd) {
      console.log("✓ Already configured as Claude Code statusline.");
    } else {
      settings.statusLine = { type: "command", command: cmd };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("✓ Claude Code statusline configured!");
      console.log("  Restart Claude Code to apply.");
    }
    return;
  }

  // Read stdin synchronously (fd 0) — reliable cross-platform
  let data;
  try {
    const input = readFileSync(0, "utf-8").trim();
    if (!input) {
      console.log("No data");
      return;
    }
    data = JSON.parse(input);
  } catch {
    console.log("No data");
    return;
  }

  // Read cache FIRST, output immediately, then trigger background refresh
  const cache = loadJson(CACHE_FILE);
  fetchUsage();

  const SEP = ` ${DIM}|${RST} `;
  const parts = [];

  // Model
  const model = data.model || {};
  const name = (model.display_name || model.id || "?").replace("Claude ", "");
  parts.push(`${TEXT}${name}${RST}`);

  // Git branch
  const cwd = data.workspace?.current_dir || process.cwd();
  const { branch, dirty, remote } = gitInfo(cwd);
  if (branch) {
    const bd = dirty ? `${branch}*` : branch;
    const bc = dirty ? DIRTY : BRANCH;
    parts.push(
      remote ? `${bc}${osc8(remote, bd)}${RST}` : `${bc}${bd}${RST}`
    );
  }

  // Context: 20k/200k
  const ctx = data.context_window || {};
  const cs = ctx.context_window_size || 200000;
  const cp = ctx.used_percentage || 0;
  const ut = Math.floor((cs * cp) / 100);
  parts.push(`${pcolor(cp)}${ftok(ut)}${DIM}/${ftok(cs)}${RST}`);

  // 5h / 7d usage with reset timer
  const now = Date.now();
  for (const [label, key] of [
    ["5h", "five_hour"],
    ["7d", "seven_day"],
  ]) {
    const period = cache[key] || {};
    const util = period.utilization;
    const resetsAt = period.resets_at;
    if (util != null) {
      let txt = `${DIM}${label} ${pcolor(util)}${Math.round(util)}%`;
      if (resetsAt) {
        const secs = Math.max(
          0,
          Math.floor((new Date(resetsAt).getTime() - now) / 1000)
        );
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        if (h > 24) txt += ` ${DIM}(${Math.floor(h / 24)}d${h % 24}h)`;
        else if (h > 0) txt += ` ${DIM}(${h}h${m}m)`;
        else txt += ` ${DIM}(${m}m)`;
      }
      parts.push(`${txt}${RST}`);
    } else {
      parts.push(`${DIM}${label} ${TEXT}--${RST}`);
    }
  }

  // Reset prefix overrides Claude Code's dim styling + non-breaking spaces prevent trimming
  let output = parts.join(SEP);
  output = "\x1b[0m" + output.replace(/ /g, "\u00A0");
  console.log(output);
}

main();
