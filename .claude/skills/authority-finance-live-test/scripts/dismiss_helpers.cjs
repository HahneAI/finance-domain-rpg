// Modals that pop up unprompted on most page loads and will eat your next
// click if you don't clear them first. Call both near the top of almost
// every driver script, right after the page settles.
async function dismissCheckin(page) {
  // The daily tips/commission check-in card (TipsCommissionCheckIn.jsx) can
  // stack more than once in a session — loop, don't just check once.
  for (let i = 0; i < 3; i++) {
    const skipBtn = page.locator('text=Skip for now');
    if (await skipBtn.count() > 0) {
      await skipBtn.first().click().catch(() => {});
      await page.waitForTimeout(800);
    } else break;
  }
}

async function dismissPwaDialog(page) {
  // The "Install on home screen" instructional dialog (iOS Safari path).
  const gotIt = page.locator('text=Got it');
  if (await gotIt.count() > 0) {
    await gotIt.first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

module.exports = { dismissCheckin, dismissPwaDialog };
