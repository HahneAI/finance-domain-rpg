// One-time-per-session login: signs in the test account against the local
// dev server and saves storageState so every later driver script can reuse
// the session via `launch()`'s default useAuth=true instead of re-logging-in.
// Run this first, once, before any other driver script.
const { launch, SCRATCH } = require('./_scratch_base.cjs');
const path = require('path');

(async () => {
  const { browser, context, page } = await launch(false); // no auth-state yet
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.fill('input[type=email]', process.env.TEST_ACCOUNT_EMAIL);
  await page.fill('input[type=password]', process.env.TEST_ACCOUNT_PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(SCRATCH, '02_after_login.png') });
  console.log((await page.textContent('body')).slice(0, 800));
  await context.storageState({ path: path.join(SCRATCH, 'auth-state.json') });
  await browser.close();
})();
