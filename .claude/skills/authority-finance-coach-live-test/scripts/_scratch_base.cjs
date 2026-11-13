// Shared Playwright launch helper for Authority Finance live-testing scripts.
// Copy this alongside any one-off driver script in your scratchpad dir and
// `require('./_scratch_base.cjs')` from it — don't inline the launch args
// in every script, they're easy to get subtly wrong (missing proxy args is
// the #1 cause of a script hanging with no error).
const { chromium } = require('playwright');
const path = require('path');

// SCRATCH should be the *session* scratchpad directory named in your own
// system prompt, not a fixed path — hardcode it per-session when you copy
// this file in, or thread it through an env var. Left as a placeholder here.
const SCRATCH = process.env.AF_SCRATCH_DIR || __dirname;

async function launch(useAuth = true) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      `--proxy-server=${process.env.HTTPS_PROXY}`,
      '--proxy-bypass-list=127.0.0.1;localhost',
      '--ssl-version-max=tls1.2',
    ],
  });
  const opts = { ignoreHTTPSErrors: true };
  if (useAuth) opts.storageState = path.join(SCRATCH, 'auth-state.json');
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  return { browser, context, page, SCRATCH };
}

module.exports = { launch, SCRATCH };
