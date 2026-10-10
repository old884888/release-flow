/* ============================================================
   发版文档工具 · 本地服务（零依赖，node 内置 http + fetch）
   界面: http://127.0.0.1:5175
   ============================================================ */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const APP_DIR = __dirname;
const TOOL_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, 'data');
const WEB_DIR = path.join(APP_DIR, 'web');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BANK_FILE = path.join(APP_DIR, 'lib', 'grill-bank.json');
const PORT = Number(process.env.TOOL_PORT || 5175);
const HOST = '127.0.0.1';

const DEFAULT_SETTINGS = {
  llm: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    retries: 2,
    stages: {
      'git-summary': { model: 'deepseek-chat', temperature: 0.1, maxTokens: 2000 },
      'route-locate': { model: 'deepseek-chat', temperature: 0.2, maxTokens: 2000 },
      'feature-write': { model: 'deepseek-chat', temperature: 0.3, maxTokens: 4000 },
      grill: { model: 'deepseek-reasoner', temperature: 0.2, maxTokens: 8000 },
      compose: { model: 'deepseek-chat', temperature: 0.2, maxTokens: 4000 }
    }
  },
  projects: {
    'qikeya-manor-v3': {
      root: 'E:\\Code666\\qikeya-manor-V3\\qikeya-manor-v3',
      baseUrl: 'http://localhost:5174',
      login: { path: '/login', phone: '', password: '' },
      role: ''
    }
  },
  defaults: { outputDir: 'docs/releases', screenshotViewport: '1440x900', grillMaxQuestions: 12 }
};

function capture(cmd, args, opts) {
  opts = opts || {};
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 30000 });
  if (!r.error || r.error.code !== 'EPERM') return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
  const tmp = path.join(TMP_DIR, 'cap-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.txt');
  const q = (a) => '"' + String(a).replace(/"/g, '\\"') + '"';
  const line = [cmd].concat(args.map(q)).join(' ') + ' > ' + q(tmp) + ' 2>&1';
  const r2 = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], { stdio: 'ignore', timeout: (opts.timeout || 30000) + 8000 });
  let out = '';
  try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) {}
  try { fs.unlinkSync(tmp); } catch (e) {}
  return { status: r2.status, stdout: out, stderr: '', error: r2.error };
}
function ensureDirs() {
  for (const d of [DATA_DIR, TMP_DIR, WEB_DIR]) fs.mkdirSync(d, { recursive: true });
}
function loadSettings() {
  ensureDirs();
  let s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    s = mergeDeep(s, raw);
  } catch (e) { /* first run */ }
  return s;
}
function mergeDeep(base, extra) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') out[k] = mergeDeep(base[k], extra[k]);
    else out[k] = extra[k];
  }
  return out;
}
function saveSettings(s) { ensureDirs(); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8'); }
function loadBank() {
  try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); } catch (e) { return { domains: [] }; }
}

/* ---------- LLM ---------- */
async function llm(stage, messages, extra) {
  const s = loadSettings();
  const st = (s.llm.stages && s.llm.stages[stage]) || { model: 'deepseek-chat', temperature: 0.3, maxTokens: 4000 };
  const apiKey = (extra && extra.apiKey) || s.llm.apiKey;
  if (!apiKey) throw new Error('未配置 API Key：请打开界面右上角「设置」填写 DeepSeek Key');
  const base = (s.llm.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
  const url = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  const retries = Number(s.llm.retries || 1);
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: st.model, temperature: st.temperature == null ? 0.3 : st.temperature, max_tokens: st.maxTokens || 4000, messages })
      });
      if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('LLM HTTP ' + resp.status + ' ' + String(t).slice(0, 300)); }
      const data = await resp.json();
      const c = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (c) return String(c);
      throw new Error('LLM 返回为空: ' + JSON.stringify(data).slice(0, 200));
    } catch (e) { lastErr = e; if (i < retries) await new Promise(r => setTimeout(r, 800)); }
  }
  throw lastErr || new Error('LLM failed');
}
function extractJson(text) {
  if (!text) return null;
  const t = String(text).trim();
  const f = t.indexOf('{'); const l = t.lastIndexOf('}');
  if (f >= 0 && l > f) {
    try { return JSON.parse(t.slice(f, l + 1)); } catch (e) {}
  }
  try { return JSON.parse(t); } catch (e) { return null; }
}

/* ---------- git ---------- */
function gitInfo(root, range) {
  const r = range || {};
  const n = Number(r.n || 15);
  const args = ['-C', root, 'log', '--oneline', '-n', String(n)];
  if (r.from && r.to) args.push(r.from + '..' + r.to);
  const res = capture('git', args, { timeout: 30000 });
  if (res.error) throw new Error('git 失败: ' + (res.error.message || res.stderr || res.status));
  const br = capture('git', ['-C', root, 'branch', '--show-current'], { timeout: 15000 });
  const branch = String(br.stdout || '').trim();
  const commits = String(res.stdout || '').split(/\r?\n/).filter(Boolean).map(l => ({ hash: l.slice(0, 8), subject: l.slice(8).trim() }));
  return { branch, count: commits.length, commits };
}

/* ---------- 定位（findstr 扫前端源码 + 读路由/菜单） ---------- */
function locate(root, title) {
  const kw = String(title || '').trim().slice(0, 20);
  const out = { hits: [], files: [] };
  const dirs = ['web-admin/src', 'mp-ops/src', 'mp-partner/src', 'src'];
  for (const d of dirs) {
    const p = path.join(root, d);
    if (!fs.existsSync(p)) continue;
    if (!kw) continue;
    const r = capture('findstr', ['/S', '/I', '/N', '/C:' + kw, p], { timeout: 45000 });
    const lines = String(r.stdout || '').split(/\r?\n/).filter(Boolean).slice(0, 40);
    for (const l of lines) out.hits.push(l);
  }
  for (const rel of ['web-admin/src/router/menu.ts', 'web-admin/src/router/routes.ts', 'web-admin/src/router/index.ts']) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) out.files.push({ rel, content: fs.readFileSync(p, 'utf8').slice(0, 8000) });
  }
  return out;
}

/* ---------- 截图 ---------- */
function runScreenshots(root, site, tasks, date) {
  const s = loadSettings();
  const outDir = path.join(root, 'docs', 'releases', date, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const cfgFile = path.join(TMP_DIR, 'shot-' + Date.now() + '.json');
  const reportFile = path.join(TMP_DIR, 'report-' + Date.now() + '.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ site, tasks, outDir, projectRoot: root, viewport: s.defaults.screenshotViewport || '1440x900' }, null, 2), 'utf8');
  const runner = path.join(APP_DIR, 'screenshot-runner.js');
  const r = spawnSync(process.execPath, [runner, '--config', cfgFile, '--report', reportFile], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 10 * 60 * 1000 });
  if (!fs.existsSync(reportFile)) throw new Error('截图引擎未产出报告（退出码 ' + r.status + '）。常见原因：找不到 playwright 或浏览器');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  for (const it of report.results || []) {
    if (it.ok) it.relPath = path.join('screenshots', path.basename(it.file)).replace(/\\/g, '/');
  }
  return report;
}

/* ---------- 合成 ---------- */
function composeDoc(projectName, date, rangeDesc, role, sections, report) {
  const shotMap = {};
  for (const it of (report && report.results) || []) shotMap[it.featureId] = it;
  const L = [];
  L.push('# ' + (projectName || '项目') + ' 发版说明 · ' + date);
  L.push('');
  L.push('> 版本范围：' + (rangeDesc || '未指定'));
  L.push('> 面向角色：' + (role || '全体用户'));
  L.push('');
  sections.forEach((sec, i) => {
    L.push('### ' + (i + 1) + '. ' + (sec.title || '未命名'));
    L.push('');
    L.push('**用处：** ' + (sec.purpose || ''));
    L.push('');
    L.push('**操作：**');
    (sec.steps || []).forEach(st => L.push('- ' + st));
    L.push('');
    const shot = shotMap[sec.id];
    if (shot && shot.ok && shot.relPath) L.push('!' + '[' + sec.id + '](' + shot.relPath + ')');
    else if (shot && shot.error) L.push('> 截图失败：' + shot.error);
    else if (shot) L.push('> 截图未成功，详见日志');
    else L.push('> 截图：未执行');
    L.push('');
    L.push('---');
    L.push('');
  });
  const fails = [];
  for (const it of (report && report.results) || []) if (!it.ok) fails.push(it.featureId + '：' + (it.error || '未知错误'));
  if (report && report.loginOk === false) fails.push('登录失败：' + (report.loginError || '未知'));
  if (fails.length) { L.push('## 附：失败项'); L.push(''); fails.forEach(f => L.push('- ' + f)); L.push(''); }
  return L.join('\n');
}

/* ---------- 需求转译：问题 ---------- */
function buildQuestions(text, bank) {
  const flat = [];
  for (const d of bank.domains || []) for (const q of d.questions || []) flat.push({ domain: d.domain, q: q.q, def: q.def });
  return flat.slice(0, 12);
}

/* ---------- HTTP ---------- */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('JSON 解析失败')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function handleApi(req, res, p) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST,GET,PUT' }); res.end(); return; }
  try {
    const body = await readBody(req);
    if (p === '/api/shots' && req.method === 'GET') {
      const u = new URL('http://x' + (req.url || ''));
      const root = u.searchParams.get('root') || '';
      const date = u.searchParams.get('date') || '';
      const name = u.searchParams.get('name') || '';
      const base = path.normalize(path.join(root, 'docs', 'releases', date, 'screenshots'));
      const file = path.normalize(path.join(base, name));
      if (!file.startsWith(base)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
      return;
    }
    if (p === '/api/health') return sendJson(res, 200, { ok: true, port: PORT, time: new Date().toISOString() });
    if (p === '/api/settings' && req.method === 'GET') { const s = loadSettings(); s.llm.apiKey = s.llm.apiKey ? 'sk-***' + String(s.llm.apiKey).slice(-4) : ''; return sendJson(res, 200, s); }
    if (p === '/api/settings' && req.method === 'PUT') {
      const s = loadSettings();
      if (body.llm) {
        if (body.llm.apiKey && !String(body.llm.apiKey).startsWith('sk-***')) s.llm.apiKey = body.llm.apiKey;
        if (body.llm.baseUrl) s.llm.baseUrl = body.llm.baseUrl;
        if (body.llm.retries != null) s.llm.retries = body.llm.retries;
        if (body.llm.stages) s.llm.stages = body.llm.stages;
      }
      if (body.projects) s.projects = body.projects;
      if (body.defaults) s.defaults = body.defaults;
      saveSettings(s);
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/git/candidates') return sendJson(res, 200, gitInfo(body.root, body.range || {}));
    if (p === '/api/git/summarize') {
      const info = gitInfo(body.root, body.range || {});
      const prompt = '以下是项目最近提交列表。请把它们归纳成「用户能感知的候选功能点」，用于发版说明。规则：合并同主题提交；标注低价值项（chore/lockfile/纯测试/merge/docs）建议排除。只输出 JSON：{"candidates":[{"title":"功能点标题","scope":"涵盖内容","commits":["hash..."]","lowValue":true/false}]}';
      const txt = await llm('git-summary', [{ role: 'system', content: '你是发版助理，只输出合法 JSON，不要解释。' }, { role: 'user', content: prompt + '\n\n提交列表：\n' + info.commits.map(c => c.hash + ' ' + c.subject).join('\n') }]);
      const j = extractJson(txt);
      return sendJson(res, 200, { info, candidates: j ? (j.candidates || []) : [], raw: txt });
    }
    if (p === '/api/features/analyze') {
      const s = loadSettings();
      const root = body.root; const features = body.features || [];
      const out = [];
      for (const f of features) {
        const loc = locate(root, f.title);
        const prompt = [
          '你是发版文档撰写助手。基于代码线索为功能点写「用处 + 操作」，只输出 JSON：',
          '{"id":"","title":"","purpose":"一句话用处（写给使用者）","steps":["操作路径1"...],"entry":"入口路由如 /contracts 或页面名","targets":[{"label":"截图名","type":"整页|表格|弹窗|悬浮球","note":"怎么点开"}],"missing":true,"missingNote":"为什么找不到入口"}',
          '规则：操作路径必须来自线索或菜单结构，找不到就 missing=true 并诚实说明，绝不编造；steps 用「菜单 → 页面 → 按钮」风格。',
          '功能点：' + f.title + (f.note ? '（' + f.note + '）' : ''),
          '代码命中：\n' + (loc.hits.join('\n') || '(无命中)').slice(0, 4000),
          '路由/菜单摘要：\n' + loc.files.map(x => '== ' + x.rel + ' ==\n' + x.content.slice(0, 3000)).join('\n').slice(0, 6000)
        ].join('\n');
        const txt = await llm('feature-write', [{ role: 'system', content: '你只输出合法 JSON，不要解释。' }, { role: 'user', content: prompt }]);
        const j = extractJson(txt) || { id: f.id, title: f.title, purpose: '', steps: [], entry: '', targets: [], missing: true, missingNote: 'AI 输出无法解析' };
        j.id = j.id || f.id || ('f' + (out.length + 1));
        out.push({ id: j.id, title: j.title || f.title, purpose: j.purpose || '', steps: j.steps || [], entry: j.entry || '', targets: j.targets || [], missing: !!j.missing, missingNote: j.missingNote || '', hits: loc.hits.slice(0, 8) });
      }
      return sendJson(res, 200, { sections: out });
    }
    if (p === '/api/screenshots') {
      const report = runScreenshots(body.root, body.site, body.tasks, body.date);
      return sendJson(res, 200, report);
    }
    if (p === '/api/compose') {
      const root = body.root;
      const date = body.date || new Date().toISOString().slice(0, 10);
      const outDir = path.join(root, 'docs', 'releases', date);
      fs.mkdirSync(outDir, { recursive: true });
      const md = composeDoc(body.projectName, date, body.rangeDesc, body.role, body.sections || [], body.report || { results: [] });
      fs.writeFileSync(path.join(outDir, 'README.md'), md, 'utf8');
      return sendJson(res, 200, { ok: true, dir: outDir, files: ['README.md'] });
    }
    if (p === '/api/req/questions') {
      const bank = loadBank();
      const qs = buildQuestions(body.text, bank);
      let j = null;
      try {
        const prompt = '基于以下需求文本，定制一份拷问清单。只输出 JSON：{"features":[{"title":"功能点","note":"一句话"}],"questions":[{"domain":"域","q":"问题（含功能点名）","def":"推荐默认值"}]}，最多 12 问，覆盖权限/状态机/数据/异常/边界。\n\n需求文本：\n' + String(body.text).slice(0, 8000);
        const txt = await llm('grill', [{ role: 'system', content: '你是需求审阅者，只输出合法 JSON。' }, { role: 'user', content: prompt }]);
        j = extractJson(txt);
      } catch (e) { j = null; }
      if (!j || !j.questions || !j.questions.length) j = { features: [], questions: qs };
      return sendJson(res, 200, j);
    }
    if (p === '/api/req/generate') {
      const prompt = [
        '基于需求文本 + 拷问结果，输出五件套文档。只输出 JSON：{"docs":{"01-业务理解.md":"...","02-功能清单.md":"...","03-拷问记录.md":"...","04-设计文档.md":"...","05-假设清单.md":"..."}}',
        '要求：01 含场景/角色/词汇表/功能点总览；02 含用户故事与验收标准；03 记录每问的答或「按默认」；04 含路由菜单/数据模型/接口/状态机/权限矩阵/边界异常；05 列出所有默认与待确认项。',
        '需求文本：\n' + String(body.text).slice(0, 8000),
        '拷问结果：\n' + JSON.stringify(body.answers || {}).slice(0, 6000)
      ].join('\n');
      const txt = await llm('grill', [{ role: 'system', content: '你只输出合法 JSON，不要解释。' }, { role: 'user', content: prompt }]);
      const j = extractJson(txt);
      if (!j || !j.docs) throw new Error('五件套生成失败：AI 输出无法解析');
      const date = new Date().toISOString().slice(0, 10);
      const base = body.root && fs.existsSync(body.root) ? path.join(body.root, 'docs', 'spec') : path.join(TOOL_ROOT, 'output', 'spec', date);
      fs.mkdirSync(base, { recursive: true });
      const written = [];
      for (const name of Object.keys(j.docs)) written.push(name), fs.writeFileSync(path.join(base, name), String(j.docs[name]), 'utf8');
      return sendJson(res, 200, { ok: true, dir: base, files: written });
    }
    return sendJson(res, 404, { error: 'unknown api: ' + p });
  } catch (e) {
    return sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
  }
}

function handleStatic(req, res, p) {
  let rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
  if (rel.startsWith('web/')) rel = rel.slice(4);
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.startsWith('/api/')) await handleApi(req, res, p);
  else handleStatic(req, res, p);
});

ensureDirs();
server.listen(PORT, HOST, () => {
  console.log('==========================================');
  console.log('  发版文档工具已启动');
  console.log('  界面: http://' + HOST + ':' + PORT);
  console.log('  关掉本窗口即停止服务');
  console.log('==========================================');
});
