const { chromium } = require('playwright-core');
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
function parseProxy(u) {
  if (!u) return undefined;
  const url = new URL(u);
  return { server: `${url.protocol}//${url.hostname}:${url.port}`, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
}

async function test() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    proxy: parseProxy(PROXY_URL),
    args: ['--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto('https://www.keh.com/', { timeout: 40000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Find search input without strict selector
  const allInputs = await page.locator('input').evaluateAll(els => els.map(el => ({
    type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, class: el.className?.slice(0,40)
  })));
  console.log('Inputs found:', JSON.stringify(allInputs.slice(0, 8)));

  await browser.close();
}
test().catch(console.error);
