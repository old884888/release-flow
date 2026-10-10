/* ============================================================
   截图引擎（自包含单文件）
   用法: node screenshot-runner.js --config <cfg.json> --report <report.json>
   playwright 解析顺序：
     PLAYWRIGHT_NODE_MODULES 环境变量
   → 目标项目 node_modules/playwright
   → 本脚本向上两级 node_modules/playwright
   → require.resolve('playwright')
   浏览器：系统 msedge / chrome，免下载驱动
   ============================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function findPlaywright(projectRoot) {
  const cands = [];
  if (process.env.PLAYWRIGHT_NODE_MODULES) cands.push(process.env.PLAYWRIGHT_NODE_MODULES);
  if (projectRoot) cands.push(path.join(projectRoot, 'node_modules', 'playwright'));
  cands.push(path.join(__dirname, '..', '..', 'node_modules', 'playwright'));
  let lastErr = null;
  for (const c of cands) {
    try { const pw = require(c); if (pw && pw.chromium) return pw; } catch (e) { lastErr = e; }
  }
  try { const pw = require(require.resolve('playwright')); if (pw && pw.chromium) return pw; } catch (e) { lastErr = e; }
  throw new Error('找不到 playwright：请在目标项目或本 skill 目录安装（npm i playwright），或用 PLAYWRIGHT_NODE_MODULES 指定。' + String(lastErr && lastErr.message || ''));
}

function args() {
  const a = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) { a[process.argv[i].slice(2)] = process.argv[i + 1]; i++; }
  }
  return a;
}
function parseViewport(v) {
  const m = /^(\d+)x(\d+)$/.exec(String(v || '1440x900'));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1440, height: 900 };
}
function pickChannel() {
  if (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')) return 'msedge';
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) return 'chrome';
  return undefined;
}

async function main() {
  const a = args();
  const cfg = JSON.parse(fs.readFileSync(a.config, 'utf8'));
  const reportFile = a.report;
  const report = { loginOk: false, loginError: '', results: [] };
  try {
    const pw = findPlaywright(cfg.projectRoot);
    const browser = await pw.chromium.launch({ channel: pickChannel(), headless: true });
    const ctx = await browser.newContext({ viewport: parseViewport(cfg.viewport), locale: 'zh-CN' });
    const page = await ctx.newPage();
    const site = cfg.site || {};
    const login = site.login || {};
    try {
      if (login.phone) {
        await page.goto(site.baseUrl + (login.path || '/login'), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1200);
        await page.fill('input[placeholder*="手机号"], input[autocomplete="username"]', String(login.phone));
        await page.fill('input[type="password"]', String(login.password || ''));
        await page.click('button:has-text("登录"), .login-card__submit');
        await page.waitForTimeout(3000);
        report.loginOk = !page.url().includes('/login');
        if (!report.loginOk) report.loginError = '登录后仍在 /login 页面（账号密码可能有误）';
      } else {
        report.loginOk = true;
      }
    } catch (e) {
      report.loginError = String(e && e.message || e);
    }
    for (const t of cfg.tasks || []) {
      const r = { featureId: t.featureId, file: t.file, ok: false, error: '' };
      try {
        await page.goto(site.baseUrl + (t.path || ''), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
        for (const st of t.steps || []) {
          if (st.type === 'wait') { await page.waitForTimeout(Number(st.ms || 800)); continue; }
          const loc = page.getByText(String(st.text), { exact: false }).first();
          await loc.click({ timeout: 6000 });
          await page.waitForTimeout(900);
        }
        const p = path.join(cfg.outDir, t.file);
        if (t.selector) await page.locator(t.selector).first().screenshot({ path: p });
        else await page.screenshot({ path: p, fullPage: true });
        r.ok = true;
      } catch (e) {
        r.error = String(e && e.message || e).slice(0, 300);
      }
      report.results.push(r);
    }
    await browser.close();
  } catch (e) {
    report.fatal = String(e && e.message || e);
  }
  try { fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8'); } catch (e) {}
  console.log('screenshot report -> ' + reportFile);
  process.exit(0);
}
main();
