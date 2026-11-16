import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const repo = process.cwd();
const server = http.createServer((req, res) => { const file = path.join(repo, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'image/jpeg' }); fs.createReadStream(file).pipe(res); }).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const name = p => p.url().replace(base, '');
async function run(kids) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + 'V3-LM2-ob-03.dc.html'); await page.waitForTimeout(900);
  // pick the number
  const info = await page.evaluate(() => [...document.querySelectorAll('button,[role=option],[role=radio],a')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)));
  const trail = ['J7 controls: ' + JSON.stringify(info.slice(0, 12))];
  const btn = page.locator(`button:has-text("${kids}"), [role=option]:has-text("${kids}"), [role=radio]:has-text("${kids}")`).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(300); } else trail.push('NO NUMBER BUTTON');
  for (let i = 0; i < 14; i++) {
    const before = name(page);
    const cta = page.locator('a.btn:not(.soft), a.btn').first();
    let target = null;
    if (/ob-07|BLA-J12/.test(before)) target = page.locator('a.btn.soft').first();
    else if (/ob-moment/.test(before)) target = page.locator('a[href*="konto"]').first();
    else if (/ob-wait/.test(before)) target = page.locator('a').first();
    else target = cta;
    if (!(await target.count())) { trail.push(before + ' : no CTA'); break; }
    await target.click({ force: true }); await page.waitForTimeout(700);
    const after = name(page); trail.push(before + ' -> ' + after);
    if (/G1|BLA-2a/.test(after) && !/ob-/.test(after)) break;
    if (after === before) { const h = await target.getAttribute('href'); if (!h || h.startsWith('{{')) break; await page.goto(base + h); await page.waitForTimeout(700); trail.push('   (button inactive until input; followed its link) -> ' + name(page)); if (name(page) === before) break; }
  }
  // from library go to Chronik
  if (/BLA-2a/.test(name(page))) { const lib = await page.evaluate(() => ({ theo: [...document.querySelectorAll('a[aria-label="Theos viertes Jahr"]')].map(e => getComputedStyle(e).display), kids: sessionStorage.getItem('v3kids') })); trail.push('library: ' + JSON.stringify(lib)); await page.locator('nav a:has-text("Chronik")').first().click({ force: true }); await page.waitForTimeout(700); trail.push('Chronik tab -> ' + name(page)); await page.locator('nav a:has-text("Bücher")').first().click({ force: true }); await page.waitForTimeout(700); trail.push('Bücher tab -> ' + name(page)); await page.locator('nav a:has-text("Chronik")').first().click({ force: true }); await page.waitForTimeout(900); trail.push('Chronik tab again -> ' + name(page)); }
  // on home open library via title
  if (/G1/.test(name(page))) { await page.locator('a[aria-haspopup="menu"]').first().click({ force: true }); await page.waitForTimeout(700); const lib = await page.evaluate(() => ({ theo: [...document.querySelectorAll('a[aria-label="Theos viertes Jahr"]')].map(e => getComputedStyle(e).display), kids: sessionStorage.getItem('v3kids') })); trail.push('Home title -> ' + name(page) + ' ' + JSON.stringify(lib)); }
  console.log('=== ' + kids + ' kid(s)\n' + trail.join('\n') + (errs.length ? '\nERRORS ' + errs.join(' | ') : ''));
}
await run(1); await run(2); await browser.close(); server.close();
