#!/usr/bin/env node
// plugin-toggle.mjs — enable/disable staged Claude plugins in .claude/
//
//   node scripts/plugin-toggle.mjs list
//   node scripts/plugin-toggle.mjs enable <plugin>
//   node scripts/plugin-toggle.mjs disable <plugin>
//
// A staged plugin's skills, commands and agents are kept as *.disabled files so nothing loads.
// enable/disable add/remove that suffix, using .claude/plugins-staging/<plugin>/manifest.json as
// the exact list of what belongs to the plugin. Staged MCP/hooks files (mcp.json.disabled,
// hooks.json.disabled) are reference only and are NEVER touched here — wire those up by hand.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLAUDE = path.join(REPO, ".claude");
const STAGING = path.join(CLAUDE, "plugins-staging");
const SUFFIX = ".disabled";

const exists = (p) => fs.existsSync(p);

function readManifest(plugin) {
  const file = path.join(STAGING, plugin, "manifest.json");
  if (!exists(file)) {
    const known = listPlugins();
    console.error(`Unknown plugin "${plugin}". Staged plugins: ${known.join(", ") || "(none)"}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listPlugins() {
  if (!exists(STAGING)) return [];
  return fs
    .readdirSync(STAGING, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(path.join(STAGING, e.name, "manifest.json")))
    .map((e) => e.name)
    .sort();
}

// ---- every file this plugin owns, as { from, to } for a given direction ----------------------
function skillFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "SKILL.md" || e.name === "SKILL.md" + SUFFIX) out.push(p);
    }
  })(dir);
  return out;
}

function plan(manifest, direction) {
  const moves = [];
  const add = (file) => {
    const isOff = file.endsWith(SUFFIX);
    if (direction === "enable" && isOff) moves.push({ from: file, to: file.slice(0, -SUFFIX.length) });
    if (direction === "disable" && !isOff) moves.push({ from: file, to: file + SUFFIX });
  };
  for (const s of manifest.skills) {
    const dir = path.join(CLAUDE, "skills", s);
    if (exists(dir)) skillFiles(dir).forEach(add);
  }
  for (const c of manifest.commands) {
    const base = path.join(CLAUDE, "commands", ...c.split("/"));
    add(exists(base + SUFFIX) ? base + SUFFIX : base);
  }
  for (const a of manifest.agents) {
    const base = path.join(CLAUDE, "agents", a);
    add(exists(base + SUFFIX) ? base + SUFFIX : base);
  }
  return moves.filter((m) => exists(m.from));
}

function stateOf(manifest) {
  let on = 0, off = 0;
  for (const direction of ["enable", "disable"]) {
    const n = plan(manifest, direction).length;
    if (direction === "enable") off = n; // files still carrying .disabled
    else on = n; // files currently active
  }
  if (on === 0 && off === 0) return "missing";
  if (off === 0) return "enabled";
  if (on === 0) return "disabled";
  return "partial";
}

// ---- collision warnings ----------------------------------------------------------------------
function frontmatterName(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const n = m && m[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
    return n ? n[1] : null;
  } catch {
    return null;
  }
}

// name -> where it's already active (project skills, user skills, other plugin staging that's enabled)
function activeSkills() {
  const found = new Map();
  for (const root of [path.join(CLAUDE, "skills"), path.join(os.homedir(), ".claude", "skills")]) {
    if (!exists(root)) continue;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skillMd = path.join(root, e.name, "SKILL.md");
      if (!exists(skillMd)) continue;
      const where = path.relative(REPO, skillMd).startsWith("..") ? `~/.claude/skills/${e.name}` : path.relative(REPO, skillMd).replaceAll("\\", "/");
      found.set(e.name, where);
      const fm = frontmatterName(skillMd);
      if (fm) found.set(fm, where);
    }
  }
  return found;
}

function warnCollisions(manifest) {
  const active = activeSkills();
  const warnings = [];
  for (const s of manifest.skills) {
    const dir = path.join(CLAUDE, "skills", s);
    const disabledMd = path.join(dir, "SKILL.md" + SUFFIX);
    const names = new Set([s]);
    const fm = exists(disabledMd) ? frontmatterName(disabledMd) : null;
    if (fm) names.add(fm);
    for (const n of names) {
      const hit = active.get(n);
      // a hit that's this very skill's own (already-enabled) folder is not a collision
      if (hit && !hit.includes(`/skills/${s}/`)) warnings.push(`skill "${n}" (from ${s}) collides with already-active ${hit}`);
    }
  }
  return [...new Set(warnings)];
}

// ---- commands --------------------------------------------------------------------------------
function applyMoves(moves) {
  let done = 0;
  for (const { from, to } of moves) {
    if (exists(to)) {
      console.warn(`  skip (target exists): ${path.relative(REPO, to)}`);
      continue;
    }
    fs.renameSync(from, to);
    done++;
  }
  return done;
}

function summarize(manifest) {
  const mcp = exists(path.join(STAGING, manifest.plugin, "mcp.json.disabled"));
  const hooks = exists(path.join(STAGING, manifest.plugin, "hooks.json.disabled"));
  return { mcp, hooks };
}

const [, , cmd, plugin] = process.argv;

if (cmd === "list" || !cmd) {
  const plugins = listPlugins();
  if (!plugins.length) console.log("No staged plugins found in .claude/plugins-staging/");
  console.log("plugin".padEnd(24) + "state".padEnd(10) + "skills".padEnd(8) + "cmds".padEnd(6) + "agents".padEnd(8) + "mcp/hooks (never auto-enabled)");
  for (const p of plugins) {
    const m = readManifest(p);
    const { mcp, hooks } = summarize(m);
    console.log(
      p.padEnd(24) + stateOf(m).padEnd(10) + String(m.skills.length).padEnd(8) + String(m.commands.length).padEnd(6) + String(m.agents.length).padEnd(8) +
        [mcp ? "mcp" : "", hooks ? "hooks" : ""].filter(Boolean).join(", ")
    );
  }
} else if (cmd === "enable" || cmd === "disable") {
  if (!plugin) {
    console.error(`Usage: node scripts/plugin-toggle.mjs ${cmd} <plugin>`);
    process.exit(1);
  }
  const manifest = readManifest(plugin);
  if (cmd === "enable") {
    for (const w of warnCollisions(manifest)) console.warn(`WARNING: ${w}`);
  }
  const moves = plan(manifest, cmd);
  const n = applyMoves(moves);
  console.log(`${cmd}d ${plugin}: ${n} file(s) renamed (${manifest.skills.length} skills, ${manifest.commands.length} commands, ${manifest.agents.length} agents).`);
  const { mcp, hooks } = summarize(manifest);
  if (cmd === "enable" && (mcp || hooks)) {
    console.log(
      `Note: ${plugin} also ships ${[mcp ? "MCP servers" : "", hooks ? "hooks" : ""].filter(Boolean).join(" and ")} — left staged in .claude/plugins-staging/${plugin}/ (reference only, not wired in).`
    );
  }
} else {
  console.error("Usage: node scripts/plugin-toggle.mjs list | enable <plugin> | disable <plugin>");
  process.exit(1);
}
