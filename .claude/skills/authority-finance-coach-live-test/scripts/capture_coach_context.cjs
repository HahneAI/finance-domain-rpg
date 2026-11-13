// Intercepts the real /api/coach request the running app sends, so a direct
// Anthropic call downstream can replay the EXACT systemPrompt/contextBlock
// the app itself built — this is what makes the workaround faithful rather
// than a guess at what the prompt looks like.
//
// Requires _scratch_base.cjs and dismiss_helpers.cjs from the sibling
// authority-finance-live-test skill's scripts/ dir (copy them alongside this
// file, or require them from wherever you already placed them this session).
const { launch, SCRATCH } = require('./_scratch_base.cjs');
const { dismissCheckin, dismissPwaDialog } = require('./dismiss_helpers.cjs');
const path = require('path');
const fs = require('fs');

// Edit this to the question you're testing this run — see the parent SKILL.md
// for the fixed small set of planned prompts; don't invent new ones ad hoc.
const QUESTION = process.argv[2] || 'What does my week look like?';

(async () => {
  const { browser, page } = await launch();
  // Coach's nav trigger only exists in the mobile bottom nav — no desktop
  // entry point exists anywhere in the codebase.
  await page.setViewportSize({ width: 390, height: 844 });

  let capturedBody = null;
  await page.route('**/api/coach', async (route) => {
    const req = route.request();
    try {
      capturedBody = JSON.parse(req.postData());
    } catch (e) {
      capturedBody = { parseError: e.message, raw: req.postData() };
    }
    // Fulfill with a harmless synthetic response instead of letting it hit
    // the network (which 404s locally anyway) — we only need the request body,
    // not a real reply from this call.
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mobile-bottom-nav', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await dismissCheckin(page);
  await dismissPwaDialog(page);

  await page.locator('.mobile-bottom-nav').getByText('Coach').first().click();
  await page.waitForTimeout(1500);
  await dismissCheckin(page);

  const input = page.getByPlaceholder(/Ask Coach/);
  await input.fill(QUESTION);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(2000);

  fs.writeFileSync(path.join(SCRATCH, 'coach_context_capture.json'), JSON.stringify(capturedBody, null, 2));
  console.log('captured:', capturedBody ? 'yes' : 'no');
  console.log('systemPrompt length:', capturedBody?.systemPrompt?.length);
  console.log('contextBlock length:', capturedBody?.contextBlock?.length);
  console.log('model:', capturedBody?.model);
  await browser.close();
})();
