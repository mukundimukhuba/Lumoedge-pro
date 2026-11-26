/**
 * Proof: bottom dock tabs remain hit-targets above EaBlurWallpaper / ScrollView.
 * Seeds a local active EA session, then elementFromPoint + click each tab.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NAV_TOUCH_URL || 'http://localhost:8081';
const OUT = process.env.NAV_TOUCH_OUT ||
  '/cursor/stores/bc-01a1f0df-0eac-7900-bbb1-13426f82c0c9/media/nav-touch';

fs.mkdirSync(OUT, { recursive: true });

const access = {
  email: 'navtouch@proof.local',
  name: 'Nav Touch',
  unlockedAt: new Date().toISOString(),
  product: 'Lumo Edge Pro',
  priceUsd: 35,
};

const activeEa = {
  licenseKey: 'PROOF-NAV-TOUCH-0001',
  eaId: 'ea_nav_touch',
  name: 'UNLIMITED BULL V1',
  pictureUri: null,
  symbols: ['XAUUSD'],
  activatedAt: new Date().toISOString(),
};

async function seed(page) {
  await page.addInitScript(
    ({ access, activeEa }) => {
      try {
        localStorage.setItem('edges-ea-access-v1', JSON.stringify(access));
        localStorage.setItem('edges-active-ea-v1', JSON.stringify(activeEa));
      } catch {}
    },
    { access, activeEa },
  );
}

async function waitForDock(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-dock="home"]');
      return !!el;
    },
    { timeout: 60000 },
  );
}

async function hitTestTab(page, dockId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-dock="${id}"]`);
    if (!el) return { ok: false, reason: 'missing-tab' };
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y);
    const chain = [];
    let n = top;
    while (n && chain.length < 12) {
      const tag = n.tagName?.toLowerCase?.() || '?';
      const pe = n.style?.pointerEvents || getComputedStyle(n).pointerEvents;
      const ds = n.dataset ? JSON.stringify(n.dataset) : '';
      const tid = n.getAttribute?.('data-testid') || '';
      chain.push(`${tag} pe=${pe} testid=${tid} data=${ds}`);
      n = n.parentElement;
    }
    const hitTab =
      !!top?.closest?.(`[data-dock="${id}"]`) ||
      !!top?.closest?.(`[data-testid="dock-${id}"]`);
    const wallpaperAbove =
      !!top?.closest?.('[data-wallpaper="1"]') ||
      getComputedStyle(top || document.body).pointerEvents === 'none' &&
        !!document.querySelector('[data-wallpaper="1"]') &&
        (() => {
          const w = document.querySelector('[data-wallpaper="1"]');
          const wr = w?.getBoundingClientRect();
          return wr && x >= wr.left && x <= wr.right && y >= wr.top && y <= wr.bottom;
        })();
    return {
      ok: hitTab,
      x,
      y,
      hitTab,
      wallpaperBlocking: !hitTab && !!document.querySelector('[data-wallpaper="1"]'),
      topTag: top?.tagName,
      topPe: top ? getComputedStyle(top).pointerEvents : null,
      dockRootZ: (() => {
        const d = document.querySelector('[data-dock-root="1"]');
        return d ? getComputedStyle(d).zIndex : null;
      })(),
      wallpaperPe: (() => {
        const w = document.querySelector('[data-wallpaper="1"]');
        return w ? getComputedStyle(w).pointerEvents : null;
      })(),
      chain,
    };
  }, dockId);
}

async function clickTab(page, dockId) {
  const tab = page.locator(`[data-dock="${dockId}"]`).first();
  await tab.click({ force: false, timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  await seed(page);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  // Expo may need a second paint after hydration
  await page.waitForTimeout(2500);
  await waitForDock(page);

  const results = {};
  for (const id of ['home', 'scanner', 'broker']) {
    results[id] = await hitTestTab(page, id);
  }

  // Navigate Home → Scanner → Broker → Home and capture screenshots
  await page.screenshot({
    path: path.join(OUT, 'after-home.jpg'),
    type: 'jpeg',
    quality: 86,
  });

  await clickTab(page, 'scanner');
  await page.waitForTimeout(1200);
  await waitForDock(page);
  const afterScannerHit = await hitTestTab(page, 'scanner');
  results.afterScannerActive = afterScannerHit;
  await page.screenshot({
    path: path.join(OUT, 'after-scanner.jpg'),
    type: 'jpeg',
    quality: 86,
  });

  await clickTab(page, 'broker');
  await page.waitForTimeout(1200);
  await waitForDock(page);
  const afterBrokerHit = await hitTestTab(page, 'broker');
  results.afterBrokerActive = afterBrokerHit;
  await page.screenshot({
    path: path.join(OUT, 'after-broker.jpg'),
    type: 'jpeg',
    quality: 86,
  });

  await clickTab(page, 'home');
  await page.waitForTimeout(1200);
  await waitForDock(page);
  results.backHome = await hitTestTab(page, 'home');
  await page.screenshot({
    path: path.join(OUT, 'after-back-home.jpg'),
    type: 'jpeg',
    quality: 86,
  });

  // Pathname / active markers
  results.activeMarkers = await page.evaluate(() => {
    return ['home', 'scanner', 'broker'].map((id) => {
      const el = document.querySelector(`[data-dock="${id}"]`);
      return { id, active: el?.dataset?.active || null };
    });
  });
  results.url = page.url();

  const reportPath = path.join(OUT, 'hit-test.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  const allOk =
    results.home?.ok &&
    results.scanner?.ok &&
    results.broker?.ok &&
    results.afterScannerActive?.ok &&
    results.afterBrokerActive?.ok &&
    results.backHome?.ok;

  console.log(JSON.stringify({ allOk, reportPath, results }, null, 2));
  await browser.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
