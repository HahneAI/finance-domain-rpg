#!/usr/bin/env node
// plugin-toggle.mjs — enable/disable staged Claude plugins in .claude/
//
//   node scripts/plugin-toggle.mjs list
//   node scripts/plugin-toggle.mjs menu [plugin]   (markdown overview for chat — used by the skill-menu skill)
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


// ---- menu: markdown overview for the skill-menu skill -----------------------------------------
// Static overrides from the 2026-10-02 staging audit (see .claude/plugins-staging/README.md,
// "Readiness verdicts"). Everything else is derived from what's actually on disk.
const DEFERRED = { "claude-security": "deferred — needs plugin-root files + namespaced agents" };
const NOTES = { figma: "fix `../figma-use/` links before enabling >1 skill" };

function readiness(plugin, mcp, hooks) {
  if (DEFERRED[plugin]) return DEFERRED[plugin];
  const bits = [];
  if (mcp) bits.push("skills testable; MCP needs hand-wiring + credentials");
  if (hooks) bits.push("hooks not wired (content only)");
  if (NOTES[plugin]) bits.push(NOTES[plugin]);
  return bits.length ? bits.join("; ") : "ready to test";
}

function skillOn(dir) {
  const files = exists(dir) ? skillFiles(dir) : [];
  return files.length > 0 && files.some((f) => !f.endsWith(SUFFIX));
}

function ownedByStaging() {
  const skills = new Set(), commands = new Set(), agents = new Set();
  for (const p of listPlugins()) {
    const m = readManifest(p);
    m.skills.forEach((x) => skills.add(x));
    m.commands.forEach((x) => commands.add(x));
    m.agents.forEach((x) => agents.add(x));
  }
  return { skills, commands, agents };
}

function otherProjectItems() {
  const owned = ownedByStaging();
  const out = { skills: [], commands: [], agents: [] };
  const sdir = path.join(CLAUDE, "skills");
  if (exists(sdir)) for (const e of fs.readdirSync(sdir, { withFileTypes: true })) {
    if (e.isDirectory() && !owned.skills.has(e.name) && exists(path.join(sdir, e.name, "SKILL.md"))) out.skills.push(e.name);
  }
  const walkMd = (root, rel = "") => {
    if (!exists(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walkMd(path.join(root, e.name), rel + e.name + "/") : e.name.endsWith(".md") ? [rel + e.name] : []);
  };
  out.commands = walkMd(path.join(CLAUDE, "commands")).filter((c) => !owned.commands.has(c));
  out.agents = walkMd(path.join(CLAUDE, "agents")).filter((a) => !owned.agents.has(a));
  return out;
}

function renderMenu(only) {
  const plugins = listPlugins();
  const rows = plugins.map((p) => {
    const m = readManifest(p);
    const { mcp, hooks } = summarize(m);
    const on = plan(m, "disable").length, off = plan(m, "enable").length;
    return { p, m, mcp, hooks, state: stateOf(m), on, off };
  });
  const L = [];
  if (only) {
    const r = rows.find((x) => x.p === only);
    if (!r) { console.error(`Unknown plugin "${only}". Staged: ${plugins.join(", ")}`); process.exit(1); }
    const icon = { enabled: "🟢", partial: "🟡", disabled: "⚪", missing: "⚠️" }[r.state];
    L.push(`## ${icon} ${r.p} — ${r.state.toUpperCase()}`, `${readiness(r.p, r.mcp, r.hooks)}`, "");
    const sk = r.m.skills.map((s) => `- ${skillOn(path.join(CLAUDE, "skills", s)) ? "🟢" : "⚪"} \`${s}\``);
    const cm = r.m.commands.map((c) => { const b = path.join(CLAUDE, "commands", ...c.split("/")); return `- ${exists(b) ? "🟢" : "⚪"} \`/${c.replace(/\.md$/, "")}\``; });
    const ag = r.m.agents.map((a) => { const b = path.join(CLAUDE, "agents", a); return `- ${exists(b) ? "🟢" : "⚪"} \`${a.replace(/\.md$/, "")}\``; });
    if (sk.length) L.push(`**Skills (${sk.length})**`, ...sk, "");
    if (cm.length) L.push(`**Commands (${cm.length})**`, ...cm, "");
    if (ag.length) L.push(`**Agents (${ag.length})**`, ...ag, "");
    console.log(L.join("\n"));
    return;
  }
  const count = (st) => rows.filter((r) => r.state === st).length;
  L.push("# 🧰 Skill Menu — staged plugins", "",
    `**${rows.length} plugins staged** · 🟢 ${count("enabled")} enabled · 🟡 ${count("partial")} partial · ⚪ ${count("disabled")} disabled`, "");
  const table = (list) => {
    L.push("| Plugin | Skills | Cmds | Agents | Extras (never auto-on) | Readiness |", "|---|--:|--:|--:|---|---|");
    for (const r of list) L.push(`| ${r.p} | ${r.m.skills.length} | ${r.m.commands.length} | ${r.m.agents.length} | ${[r.mcp ? "MCP" : "", r.hooks ? "hooks" : ""].filter(Boolean).join(", ") || "–"} | ${readiness(r.p, r.mcp, r.hooks)} |`);
    L.push("");
  };
  for (const [st, icon, title] of [["enabled", "🟢", "Enabled"], ["partial", "🟡", "Partially enabled"], ["disabled", "⚪", "Disabled (staged, off)"]]) {
    const list = rows.filter((r) => r.state === st);
    L.push(`## ${icon} ${title} (${list.length})`);
    if (!list.length) L.push("_none_", ""); else table(list);
  }
  const miss = rows.filter((r) => r.state === "missing");
  if (miss.length) L.push(`## ⚠️ Missing files (${miss.length})`, miss.map((r) => r.p).join(", "), "");
  const other = otherProjectItems();
  L.push("## 📌 Always-on project items (not part of the staged plugins)");
  L.push(`- Skills: ${other.skills.map((x) => "`" + x + "`").join(", ") || "_none_"}`);
  L.push(`- Commands: ${other.commands.map((x) => "`/" + x.replace(/\.md$/, "") + "`").join(", ") || "_none_"}`);
  L.push(`- Agents: ${other.agents.map((x) => "`" + x.replace(/\.md$/, "") + "`").join(", ") || "_none_"}`, "");
  L.push("**Turn one on:** `node scripts/plugin-toggle.mjs enable <plugin>` → commit → start a new cloud session (or `/reload-skills` locally).",
    "**Detail for one plugin:** `/skill-menu <plugin>`", "");
  console.log(L.join("\n"));
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
} else if (cmd === "menu") {
  renderMenu(plugin);
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
  console.error("Usage: node scripts/plugin-toggle.mjs list | menu [plugin] | enable <plugin> | disable <plugin>");
  process.exit(1);
}
