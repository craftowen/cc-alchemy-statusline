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

import { readFileSync, writeFileSync, existsSync, openSync, closeSync, statSync, readSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { execFileSync, spawn } from "child_process";
import http2 from "http2";
import https from "https";
import { fileURLToPath } from "url";

const IS_WIN = platform() === "win32";
const HOME = homedir();
const CACHE_FILE = join(HOME, ".claude", "statusline_cache.json");
const BACKOFF_FILE = join(HOME, ".claude", "statusline_backoff.json");
const CREDS_FILE = join(HOME, ".claude", ".credentials.json");
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const CURRENT_VERSION = "1.10.1";
const LOCAL_SCRIPT = join(HOME, ".claude", "cc-alchemy-statusline.mjs");
const VERSION_FILE = join(HOME, ".claude", "statusline_version.json");
const VERSION_CHECK_MS = 24 * 60 * 60 * 1000; // 24h

// --- Windows UTF-8 setup ---
if (IS_WIN) {
  try {
    execFileSync("chcp.com", ["65001"], { stdio: "ignore", windowsHide: true });
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
const MODEL = rgb(147, 153, 178);
const TIME = rgb(203, 166, 247); // mauve — prompt timestamp

const pcolor = (p) => (p < 50 ? GREEN : p < 90 ? YELLOW : RED);

function ftok(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

const osc8 = (url, text) =>
  USE_COLOR ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : text;

// Visual width: CJK / fullwidth chars = 2 columns, others = 1
function vwidth(str) {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    // CJK Unified, Hangul, Katakana/Hiragana, CJK Compat, Fullwidth
    if (
      (cp >= 0x1100 && cp <= 0x115f) || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3040 && cp <= 0x33bf) ||
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe6f) || (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x2fffd) || (cp >= 0x30000 && cp <= 0x3fffd)
    ) w += 2;
    else w += 1;
  }
  return w;
}

// Truncate plain text to fit within maxW visual columns, append "…" if truncated
function vtrunc(str, maxW) {
  const chars = [...str];
  // Check if it fits without truncation first
  if (vwidth(str) <= maxW) return str;
  // Doesn't fit — truncate and add …
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0);
    const cw =
      (cp >= 0x1100 && cp <= 0x115f) || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3040 && cp <= 0x33bf) ||
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe6f) || (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x2fffd) || (cp >= 0x30000 && cp <= 0x3fffd)
        ? 2 : 1;
    if (w + cw > maxW - 1) { // reserve 1 col for "…"
      return chars.slice(0, i).join("") + "…";
    }
    w += cw;
  }
  return str;
}

// Truncate ANSI-colored string to fit within maxW visual columns
function vtruncAnsi(str, maxW) {
  if (maxW <= 1) return "";
  // Quick check — strip ANSI and measure
  const plain = str.replace(/\x1b(?:\[[0-9;]*m|\]8;;[^\x07]*\x07)/g, "");
  if (vwidth(plain) <= maxW) return str;
  let w = 0, out = "", i = 0;
  while (i < str.length) {
    const c = str.charCodeAt(i);
    if (c === 0x1b) {
      const nx = str.charCodeAt(i + 1);
      if (nx === 0x5b) { // CSI: \x1b[...m
        let j = i + 2;
        while (j < str.length && str.charCodeAt(j) !== 0x6d) j++;
        out += str.slice(i, j + 1); i = j + 1; continue;
      }
      if (nx === 0x5d) { // OSC: \x1b]...\x07
        let j = i + 2;
        while (j < str.length && str.charCodeAt(j) !== 7) j++;
        out += str.slice(i, j + 1); i = j + 1; continue;
      }
      out += str[i]; i++; continue;
    }
    const cp = str.codePointAt(i);
    const step = cp > 0xffff ? 2 : 1;
    const cw =
      (cp >= 0x1100 && cp <= 0x115f) || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3040 && cp <= 0x33bf) ||
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe6f) || (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x2fffd) || (cp >= 0x30000 && cp <= 0x3fffd)
        ? 2 : 1;
    if (w + cw > maxW - 1) return out + "…\x1b[0m";
    out += str.slice(i, i + step);
    w += cw;
    i += step;
  }
  return out;
}

function getTermCols() {
  if (process.stdout.columns) return process.stdout.columns;
  if (process.stderr.columns) return process.stderr.columns;
  if (process.env.COLUMNS) return parseInt(process.env.COLUMNS) || 0;
  if (!IS_WIN) {
    let fd;
    try {
      fd = openSync("/dev/tty", "r");
      const size = execFileSync("stty", ["size"], {
        encoding: "utf8",
        timeout: 500,
        stdio: [fd, "pipe", "pipe"],
      }).trim();
      const cols = parseInt(size.split(" ")[1]);
      if (cols > 0) return cols;
    } catch {} finally {
      if (fd != null) try { closeSync(fd); } catch {}
    }
  }
  return 0;
}

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
      windowsHide: true,
    }).trim();
  } catch {
    return "";
  }
}

function gitInfo(cwd) {
  const out = exec("git", ["status", "--porcelain=v2", "--branch"], cwd);
  if (!out) return { branch: "", dirty: false, remote: "" };

  let branch = "", oid = "", dirty = false;
  for (const line of out.split("\n")) {
    if (line.startsWith("# branch.head ")) branch = line.slice(14);
    else if (line.startsWith("# branch.oid ")) oid = line.slice(13, 20);
    else if (line.length > 0 && !line.startsWith("#")) { dirty = true; break; }
  }

  if (branch === "(detached)" || !branch) branch = oid;
  if (!branch) return { branch: "", dirty: false, remote: "" };

  let url = exec("git", ["remote", "get-url", "origin"], cwd);
  if (url.startsWith("git@github.com:"))
    url = url.replace("git@github.com:", "https://github.com/");
  if (url.endsWith(".git")) url = url.slice(0, -4);

  return { branch, dirty, remote: url };
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
        { encoding: "utf8", timeout: 8000, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
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

function tokenFingerprint(token) {
  if (!token || token.length < 8) return null;
  return token.slice(-8);
}

// --- Usage fetch (HTTP/2 + user-agent required by Anthropic API) ---
function doFetchRequest(token) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { finish(); try { client.close(); } catch {} }, 15000);

    const client = http2.connect("https://api.anthropic.com");
    client.on("error", () => { try { client.close(); } catch {} finish(); });

    const req = client.request({
      ":method": "GET",
      ":path": "/api/oauth/usage",
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "anthropic-version": "2023-06-01",
      "user-agent": `cc-alchemy-statusline/${CURRENT_VERSION}`,
      accept: "*/*",
    });

    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.error) {
          // Write backoff marker — exponential backoff on rate limit
          const bf = loadJson(BACKOFF_FILE);
          const count = (bf.count || 0) + 1;
          const delaySec = Math.min(300 * Math.pow(2, count - 1), 3600); // 5min → 10min → 20min → max 1h
          writeFileSync(BACKOFF_FILE, JSON.stringify({ count, retry_after: new Date(Date.now() + delaySec * 1000).toISOString() }));
          try { client.close(); } catch {} finish(); return;
        }
        // Success — clear backoff and write cache
        try { if (existsSync(BACKOFF_FILE)) writeFileSync(BACKOFF_FILE, "{}"); } catch {}
        const cache = { cached_at: new Date().toISOString(), token_fp: tokenFingerprint(token) };
        for (const key of ["five_hour", "seven_day"]) {
          if (data[key]) cache[key] = data[key];
        }
        writeFileSync(CACHE_FILE, JSON.stringify(cache));
      } catch {}
      try { client.close(); } catch {}
      finish();
    });
    req.on("error", () => { try { client.close(); } catch {} finish(); });
    req.end();
  });
}

function fetchUsage() {
  const token = getToken();
  if (!token) return;

  // Prevent duplicate background fetches within 60s
  const cache = loadJson(CACHE_FILE);
  if (cache._fetching && (Date.now() - cache._fetching) < 60000) return;

  try {
    cache._fetching = Date.now();
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {}

  // Always background — never block the statusline output
  spawn(process.execPath, [SCRIPT_PATH, "--fetch-only"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, __CC_STATUS_TOKEN: token },
  }).unref();
}

async function fetchOnly() {
  const token = process.env.__CC_STATUS_TOKEN || getToken();
  if (!token) process.exit(1);
  await doFetchRequest(token);
}

// --- Auto-update ---
function isNewerVersion(latest, current) {
  const parse = (v) => v.split(".").map((n) => parseInt(n) || 0);
  const [l, c] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function httpsGet(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15000);
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          follow(loc?.startsWith("/") ? "https://unpkg.com" + loc : loc);
          res.resume();
          return;
        }
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => { clearTimeout(timer); resolve(body); });
      }).on("error", () => { clearTimeout(timer); resolve(null); });
    };
    follow(url);
  });
}

async function doUpdateCheck() {
  try {
    // Fetch latest version from npm
    const raw = await httpsGet("https://registry.npmjs.org/cc-alchemy-statusline/latest");
    if (!raw) return;
    const latest = JSON.parse(raw).version;
    if (!latest) return;

    const vi = loadJson(VERSION_FILE);
    vi.last_check = new Date().toISOString();
    delete vi._checking;

    if (!isNewerVersion(latest, CURRENT_VERSION)) {
      writeFileSync(VERSION_FILE, JSON.stringify(vi));
      return;
    }

    // Download new script from unpkg
    const script = await httpsGet(`https://unpkg.com/cc-alchemy-statusline@${latest}/index.mjs`);
    if (!script || !script.startsWith("#!/usr/bin/env node")) {
      writeFileSync(VERSION_FILE, JSON.stringify(vi));
      return;
    }

    // Atomic write: temp → rename
    const tmp = LOCAL_SCRIPT + ".tmp";
    writeFileSync(tmp, script);
    renameSync(tmp, LOCAL_SCRIPT);

    vi.version = latest;
    vi.updated_at = new Date().toISOString();
    writeFileSync(VERSION_FILE, JSON.stringify(vi));
  } catch {}
}

function checkForUpdates() {
  // Only auto-update if running from the local install path
  if (SCRIPT_PATH !== LOCAL_SCRIPT) return;

  const vi = loadJson(VERSION_FILE);
  const lastCheck = vi.last_check ? new Date(vi.last_check).getTime() : 0;
  if (Date.now() - lastCheck < VERSION_CHECK_MS) return;

  // Prevent duplicate checks
  if (vi._checking && (Date.now() - vi._checking) < 60000) return;
  try {
    vi._checking = Date.now();
    writeFileSync(VERSION_FILE, JSON.stringify(vi));
  } catch {}

  spawn(process.execPath, [SCRIPT_PATH, "--update-check"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

// --- Last user prompt from current session ---
const HISTORY_FILE = join(HOME, ".claude", "history.jsonl");

function getLastPrompt(sessionId) {
  try {
    if (!sessionId || !existsSync(HISTORY_FILE)) return "";

    const st = statSync(HISTORY_FILE);
    const CHUNK = 16384;
    const size = Math.min(CHUNK, st.size);
    const start = st.size - size;
    const buf = Buffer.alloc(size);
    const fd = openSync(HISTORY_FILE, "r");
    readSync(fd, buf, 0, size, start);
    closeSync(fd);

    const text = buf.toString("utf8");
    const firstNl = start > 0 ? text.indexOf("\n") : -1;
    const lines = text
      .slice(firstNl + 1)
      .split("\n")
      .filter((l) => l.trim());

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.sessionId === sessionId && entry.display?.trim()) {
          let d = entry.display.trim();
          // Replace [Pasted text #N +M lines] with first line of actual content
          const pasted = entry.pastedContents;
          if (pasted) {
            d = d.replace(/\[Pasted text #(\d+)[^\]]*\]/g, (_, n) => {
              const val = pasted[n];
              if (!val) return "";
              const content = typeof val === "string" ? val : val.content || "";
              const firstLine = content.split(/\r?\n/).find((l) => l.trim()) || "";
              return firstLine.trim();
            });
          }
          return { text: d.trim(), ts: entry.timestamp || 0 };
        }
      } catch {}
    }
    return null;
  } catch {
    return "";
  }
}

// --- Main ---
function main() {
  if (process.argv.includes("--fetch-only")) {
    fetchOnly();
    return;
  }

  if (process.argv.includes("--update-check")) {
    doUpdateCheck();
    return;
  }

  // If stdin is a TTY (direct terminal run), install locally and configure
  if (process.stdin.isTTY) {
    const claudeDir = join(HOME, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

    // Copy script to local path
    writeFileSync(LOCAL_SCRIPT, readFileSync(SCRIPT_PATH, "utf8"));
    writeFileSync(VERSION_FILE, JSON.stringify({
      version: CURRENT_VERSION,
      installed_at: new Date().toISOString(),
      last_check: new Date().toISOString(),
    }));

    // Find all possible Claude Code settings directories
    const settingsDirs = [claudeDir];
    if (IS_WIN) {
      const appdata = process.env.APPDATA || "";
      const localappdata = process.env.LOCALAPPDATA || "";
      for (const d of [
        appdata && join(appdata, "Claude"),
        appdata && join(appdata, "claude-code"),
        localappdata && join(localappdata, "Claude"),
      ]) { if (d && existsSync(d)) settingsDirs.push(d); }
    }

    // Configure Claude Code settings — write to all found config dirs
    const cmd = `node ${LOCAL_SCRIPT}`;
    let wasNew = false;
    for (const dir of settingsDirs) {
      const sp = join(dir, "settings.json");
      const s = loadJson(sp);
      if (s?.statusLine?.command === cmd) continue;
      s.statusLine = { type: "command", command: cmd };
      try {
        writeFileSync(sp, JSON.stringify(s, null, 2));
        wasNew = true;
      } catch {}
    }

    if (wasNew) {
      console.log("✓ Statusline v" + CURRENT_VERSION + " installed!");
      console.log("  Location: " + LOCAL_SCRIPT);
      if (settingsDirs.length > 1) console.log("  Settings written to " + settingsDirs.length + " locations.");
      console.log("  Auto-updates every 24h.");
      console.log("  Restart Claude Code to apply.");
    } else {
      console.log("✓ Already configured (v" + CURRENT_VERSION + ").");
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

  // Background: check for updates
  checkForUpdates();

  // Read cache FIRST, output immediately, then trigger background refresh if stale
  const cache = loadJson(CACHE_FILE);
  const CACHE_TTL_MS = 300_000; // 5 minutes
  const cacheAge = cache.cached_at
    ? Date.now() - new Date(cache.cached_at).getTime()
    : Infinity;
  // Detect account change — if token fingerprint differs, invalidate cache
  let accountChanged = false;
  if (cache.token_fp) {
    const currentFp = tokenFingerprint(getToken());
    if (currentFp && currentFp !== cache.token_fp) {
      accountChanged = true;
      delete cache.five_hour;
      delete cache.seven_day;
    }
  }

  if (accountChanged || cacheAge > CACHE_TTL_MS) {
    if (accountChanged) {
      try { if (existsSync(BACKOFF_FILE)) writeFileSync(BACKOFF_FILE, "{}"); } catch {}
    }
    const bf = accountChanged ? {} : loadJson(BACKOFF_FILE);
    const retryAfter = bf.retry_after ? new Date(bf.retry_after).getTime() : 0;
    if (Date.now() >= retryAfter) fetchUsage();
  }

  const SEP = ` ${DIM}|${RST} `;
  const parts = [];

  // Model
  const model = data.model || {};
  const name = (model.display_name || model.id || "?").replace("Claude ", "").replace(/\((\d+[KMB])\s+context\)/i, "($1)");
  parts.push(`${MODEL}${name}${RST}`);

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

  // Line 1: metrics (always), Line 2: last prompt (optional, max 60 chars)
  const fmt = (s) => "\x1b[0m" + s.replace(/ /g, "\u00A0");
  const cols = getTermCols();
  const metricsLine = parts.join(SEP);
  const PROMPT_MAX_W = 60; // hard cap — prevents wrap in split panes

  const outLines = [];
  outLines.push(fmt(cols > 0 ? vtruncAnsi(metricsLine, cols) : metricsLine));

  const lastPrompt = getLastPrompt(data.session_id);
  if (lastPrompt) {
    const timeTag = lastPrompt.ts
      ? new Date(lastPrompt.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
    const clean = lastPrompt.text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
    const prefixPlain = timeTag ? `▸ ${timeTag} ` : "▸ ";
    const prefixAnsi = timeTag ? `${DIM}▸ ${TIME}${timeTag} ` : `${DIM}▸ `;
    const prefixW = vwidth(prefixPlain);
    const t = vtrunc(clean, PROMPT_MAX_W - prefixW);
    outLines.push(fmt(`${prefixAnsi}${TEXT}${t}${RST}`));
  }

  process.stdout.write(outLines.join("\n") + "\n");
}

main();
