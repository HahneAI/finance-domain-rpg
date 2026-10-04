#!/usr/bin/env node
// Authority Finance safeguard: strip every user-prompt text excerpt from the analyzer's JSON so the
// HTML report carries token/usage numbers only. Usage: node redact-report.mjs <in.json> <out.json>
import fs from 'fs'
const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) { console.error('usage: redact-report.mjs <in.json> <out.json>'); process.exit(2) }
const j = JSON.parse(fs.readFileSync(inPath, 'utf8'))
let n = 0
const wipe = (items, label) => (items || []).forEach((it, i) => {
  if (it && typeof it.text === 'string') { it.text = `[prompt text redacted — ${label} #${i + 1}${it.ts ? ' @ ' + it.ts.slice(0, 16) : ''}]`; n++ }
})
for (const p of j.top_prompts || []) { wipe([p], 'prompt'); wipe(p.context, 'context turn') }
for (const c of j.cache_breaks || []) wipe(c.context, 'context turn')
fs.writeFileSync(outPath, JSON.stringify(j))
console.error(`redacted ${n} text fields -> ${outPath}`)
