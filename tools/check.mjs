// Renders every screen at a typical in-app phone browser size (402x680) and
// writes tools/out/sheet.png for a visual check. Also reports script errors,
// missing files and horizontal scrolling.
// Usage: node tools/check.mjs   (needs `npm install` in tools/ once)
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const tools = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(tools);
const out = path.join(tools, 'out');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = http.createServer((req, res) => {
  const file = path.join(repo, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const screens = fs.readdirSync(repo).filter(f => f.endsWith('.dc.html')).sort();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(fs.existsSync(chrome) ? { executablePath: chrome } : {});
const page = await (await browser.newContext({ viewport: { width: 402, height: 680 }, isMobile: true, hasTouch: true })).newPage();
let problems = 0;
for (const f of screens) {
  const errs = [];
  page.removeAllListeners('pageerror'); page.removeAllListeners('requestfailed'); page.removeAllListeners('response');
  page.on('pageerror', e => errs.push('script error: ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && !/%7B%7B|\{\{/.test(r.url())) errs.push('missing: ' + r.url()); }); // unfilled {{template}} placeholders are not missing files
  await page.goto(base + f);
  await page.waitForTimeout(900);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 402) errs.push('scrolls sideways (' + sw + 'px)');
  await page.screenshot({ path: path.join(out, f.replace('.dc.html', '.png')) });
  if (errs.length) { problems++; console.log('PROBLEM', f, errs.join(' | ')); }
}
const html = '<body style="margin:0;background:#777;display:grid;grid-template-columns:repeat(6,201px);gap:6px">' +
  screens.map(f => `<div style="font:11px sans-serif;color:#fff">${f}<img src="${f.replace('.dc.html', '.png')}" width="201"></div>`).join('') + '</body>';
fs.writeFileSync(path.join(out, 'sheet.html'), html);
const sheet = await browser.newPage({ viewport: { width: 1250, height: 800 } });
await sheet.goto('file://' + path.join(out, 'sheet.html'));
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
await browser.close();
server.close();
console.log(`CHECKED ${screens.length} screens, ${problems} with problems. Contact sheet: ${path.join(out, 'sheet.png')}`);
