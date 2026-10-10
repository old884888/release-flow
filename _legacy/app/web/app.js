'use strict';
const $ = (id) => document.getElementById(id);
const state = { settings: null, project: null, sections: [], shots: null, reqQuestions: null, date: today() };

function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function log(msg) { const t = new Date().toLocaleTimeString(); $('log').textContent += '[' + t + '] ' + msg + '\n'; $('log').scrollTop = $('log').scrollHeight; }
async function api(path, method, body) {
  const opts = { method: method || 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- 初始化 ---------- */
async function init() {
  try {
    state.settings = await api('/api/settings', 'GET');
    const sel = $('project-select');
    sel.innerHTML = '';
    const keys = Object.keys(state.settings.projects || {});
    keys.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); });
    if (keys.length) selectProject(keys[0]);
    log('已加载设置。项目档案：' + (keys.join(', ') || '空') + '。API Key：' + (state.settings.llm.apiKey ? '已配置' : '未配置（在右上角设置里填）'));
  } catch (e) { log('初始化失败: ' + e.message); }
}
function selectProject(key) {
  state.project = (state.settings.projects || {})[key] || null;
  if (!state.project) return;
  $('project-root').value = '';
  $('site-url').value = state.project.baseUrl || '';
  const lg = state.project.login || {};
  $('login-path').value = lg.path || '/login';
  $('login-phone').value = lg.phone || '';
  $('login-pass').value = lg.password || '';
  $('role').value = state.project.role || '';
}
function currentProject() {
  const root = $('project-root').value.trim() || (state.project ? state.project.root : '');
  const baseUrl = $('site-url').value.trim() || (state.project ? state.project.baseUrl : '');
  return {
    key: $('project-select').value, root, baseUrl,
    login: { path: $('login-path').value.trim() || '/login', phone: $('login-phone').value.trim(), password: $('login-pass').value },
    role: $('role').value.trim()
  };
}
function featureList() {
  const lines = $('features').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const checked = [];
  document.querySelectorAll('#candidates input[type="checkbox"]:checked').forEach(cb => checked.push({ title: cb.value, note: cb.dataset.scope || '' }));
  const merged = [];
  lines.forEach(t => { if (!merged.some(m => m.title === t)) merged.push({ title: t, note: '' }); });
  checked.forEach(c => { if (!merged.some(m => m.title === c.title)) merged.push(c); });
  return merged;
}

/* ---------- Tab 切换 ---------- */
document.querySelectorAll('.tab').forEach(tb => tb.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab-body').forEach(x => x.classList.remove('active'));
  tb.classList.add('active');
  $('tab-' + tb.dataset.tab).classList.add('active');
}));

/* ---------- 设置 ---------- */
$('btn-settings').addEventListener('click', async () => {
  const s = state.settings;
  $('set-apikey').value = s.llm.apiKey || '';
  $('set-baseurl').value = s.llm.baseUrl || 'https://api.deepseek.com';
  $('set-retries').value = s.llm.retries || 2;
  $('set-stages').value = JSON.stringify(s.llm.stages, null, 2);
  $('set-projects').value = JSON.stringify(s.projects, null, 2);
  $('settings-modal').classList.remove('hidden');
});
$('btn-settings-close').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
$('btn-settings-save').addEventListener('click', async () => {
  try {
    const payload = { llm: { apiKey: $('set-apikey').value.trim(), baseUrl: $('set-baseurl').value.trim(), retries: Number($('set-retries').value) || 2 }, projects: {}, defaults: {} };
    try { payload.llm.stages = JSON.parse($('set-stages').value); } catch (e) { throw new Error('阶段参数不是合法 JSON'); }
    try { payload.projects = JSON.parse($('set-projects').value); } catch (e) { throw new Error('项目档案不是合法 JSON'); }
    await api('/api/settings', 'PUT', payload);
    $('settings-modal').classList.add('hidden');
    log('设置已保存');
    await init();
  } catch (e) { log('保存设置失败: ' + e.message); }
});
$('project-select').addEventListener('change', e => selectProject(e.target.value));

/* ---------- git 候选 ---------- */
$('btn-git').addEventListener('click', async () => {
  const p = currentProject();
  if (!p.root) { log('请先选择项目'); return; }
  $('btn-git').disabled = true;
  try {
    const range = parseRange($('git-range').value.trim());
    log('读取 git 候选（' + (rangeLabel(range)) + '）...');
    let j;
    try { j = await api('/api/git/summarize', 'POST', { root: p.root, range }); }
    catch (e) { log('AI 归纳失败（' + e.message + '），回退为原始提交列表'); j = await api('/api/git/candidates', 'POST', { root: p.root, range }); }
    const cands = j.candidates && j.candidates.length ? j.candidates : j.info.commits.map(c => ({ title: c.subject, scope: c.hash, lowValue: false }));
    const box = $('candidates');
    box.innerHTML = '<div class="cand"><b>勾选要写的功能点（低价值项已标注）：</b></div>' + cands.map((c, i) =>
      '<label class="cand"><input type="checkbox" value="' + esc(c.title) + '" data-scope="' + esc(c.scope || '') + '"' + (c.lowValue ? '' : ' checked') + '>'
      + '<span class="t">' + esc(c.title) + '<div class="d">' + esc(c.scope || '') + '</div></span>'
      + (c.lowValue ? '<span class="badge">低价值·建议排除</span>' : '') + '</label>'
    ).join('');
    box.classList.remove('hidden');
    log('候选已列出（' + cands.length + ' 条），勾选后点「① 分析并生成正文」');
  } catch (e) { log('git 候选失败: ' + e.message); }
  $('btn-git').disabled = false;
});
function parseRange(v) {
  if (!v) return { n: 15 };
  if (/^d+$/.test(v)) return { n: Number(v) };
  if (v.includes('..')) { const parts = v.split('..'); return { from: parts[0] || 'master', to: parts[1] || 'HEAD' }; }
  return { n: 15 };
}
function rangeLabel(r) { return r.from ? (r.from + '..' + r.to) : ('最近 ' + (r.n || 15) + ' 次'); }

/* ---------- 分析 ---------- */
$('btn-analyze').addEventListener('click', async () => {
  const p = currentProject();
  const feats = featureList();
  if (!p.root) { log('请先选择项目目录'); return; }
  if (!feats.length) { log('请先填功能点或勾选 git 候选'); return; }
  $('btn-analyze').disabled = true;
  log('分析 ' + feats.length + ' 个功能点（读代码定位入口 + AI 写正文）...');
  try {
    const j = await api('/api/features/analyze', 'POST', { root: p.root, features: feats });
    state.sections = j.sections || [];
    renderSections();
    log('正文已生成，请核对/编辑，然后点「② 截图」');
  } catch (e) { log('分析失败: ' + e.message); }
  $('btn-analyze').disabled = false;
});
function prefillShotLines(sec, idx) {
  const id = sec.id || ('f' + (idx + 1));
  const tgs = sec.targets && sec.targets.length ? sec.targets : [{ label: '整页', note: '' }];
  return tgs.map((t, ti) => {
    const file = String(idx + 1).padStart(2, '0') + '-' + id + (ti > 0 ? '-' + (ti + 1) : '') + '.png';
    const steps = String(t.note || '').split('→').map(s => s.trim()).filter(Boolean).join(', ');
    return file + ' | ' + (sec.entry || '') + ' | ' + steps;
  }).join('\n');
}
function renderSections() {
  const box = $('sections');
  box.innerHTML = state.sections.map((sec, i) => {
    const miss = sec.missing ? '<div class="missing">⚠ ' + esc(sec.missingNote || '入口未找到，需人工补充') + '</div>' : '';
    return '<div class="sec-card" data-id="' + esc(sec.id) + '">'
      + '<div class="head"><span class="no">' + (i + 1) + '.</span><input id="s-title-' + i + '" value="' + esc(sec.title) + '"></div>'
      + '<label>用处 <textarea id="s-purpose-' + i + '" rows="2">' + esc(sec.purpose) + '</textarea></label>'
      + '<label>操作（一行一步） <textarea id="s-steps-' + i + '" rows="3">' + esc((sec.steps || []).join('\n')) + '</textarea></label>'
      + '<label>入口 <input id="s-entry-' + i + '" value="' + esc(sec.entry || '') + '"></label>'
      + miss
      + '<label>截图任务（每行：文件名 | 入口路径 | 点击步骤,逗号分隔） <textarea id="s-shots-' + i + '" rows="2">' + esc(prefillShotLines(sec, i)) + '</textarea></label>'
      + '</div>';
  }).join('');
}
function collectSections() {
  return state.sections.map((sec, i) => ({
    id: sec.id,
    title: $('s-title-' + i).value.trim(),
    purpose: $('s-purpose-' + i).value.trim(),
    steps: $('s-steps-' + i).value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    entry: $('s-entry-' + i).value.trim(),
    shots: $('s-shots-' + i).value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  }));
}
function parseShots(sections) {
  const tasks = [];
  sections.forEach(sec => {
    (sec.shots || []).forEach((line, i) => {
      const parts = line.split('|').map(s => s.trim());
      const file = parts[0] || (String(tasks.length + 1).padStart(2, '0') + '-' + sec.id + '.png');
      const entry = parts[1] || sec.entry || '';
      const steps = (parts[2] || '').split(',').map(s => s.trim()).filter(Boolean).map(text => ({ type: 'click', text }));
      tasks.push({ featureId: sec.id, file, path: entry, steps });
    });
  });
  return tasks;
}

/* ---------- 截图 ---------- */
$('btn-shoot').addEventListener('click', async () => {
  const p = currentProject();
  const sections = collectSections();
  if (!p.root || !p.baseUrl) { log('请先填项目目录与站点地址'); return; }
  const tasks = parseShots(sections);
  if (!tasks.length) { log('没有截图任务（每个功能点至少一行截图任务）'); return; }
  $('btn-shoot').disabled = true;
  log('开始截图：' + tasks.length + ' 个任务（登录 ' + p.baseUrl + '）...');
  try {
    state.shots = await api('/api/screenshots', 'POST', { root: p.root, site: { baseUrl: p.baseUrl, login: p.login }, tasks, date: state.date });
    renderShots();
    const ok = (state.shots.results || []).filter(r => r.ok).length;
    log('截图完成：成功 ' + ok + ' / ' + (state.shots.results || []).length + (state.shots.loginOk ? '' : '（登录失败：' + (state.shots.loginError || '') + '）'));
  } catch (e) { log('截图失败: ' + e.message); }
  $('btn-shoot').disabled = false;
});
function renderShots() {
  const body = $('results-body');
  const p = currentProject();
  body.innerHTML = '';
  const box = $('results');
  box.classList.remove('hidden');
  (state.shots.results || []).forEach(r => {
    const div = document.createElement('div');
    div.className = 'shot-row';
    const img = r.ok ? ('<img src="/api/shots?root=' + encodeURIComponent(p.root) + '&date=' + encodeURIComponent(state.date) + '&name=' + encodeURIComponent(r.file) + '">') : '';
    div.innerHTML = img + '<span>' + esc(r.file) + '　</span>' + (r.ok ? '<span class="shot-ok">✓</span>' : '<span class="shot-err">✗ ' + esc(r.error || '') + '</span>');
    body.appendChild(div);
  });
}

/* ---------- 合成 ---------- */
$('btn-compose').addEventListener('click', async () => {
  const p = currentProject();
  const sections = collectSections();
  if (!p.root || !sections.length) { log('请先完成「① 分析」'); return; }
  $('btn-compose').disabled = true;
  try {
    const rangeDesc = '功能点由人工提供' + ($('git-range').value ? '（git 范围：' + $('git-range').value + '）' : '');
    const j = await api('/api/compose', 'POST', {
      root: p.root, projectName: p.key, date: state.date, rangeDesc, role: p.role,
      sections: sections.map(s => ({ id: s.id, title: s.title, purpose: s.purpose, steps: s.steps })),
      report: state.shots || { results: [] }
    });
    log('已输出：' + j.dir + '\README.md');
    const body = $('results-body');
    const div = document.createElement('div');
    div.className = 'res-item';
    div.innerHTML = '<b>文档已生成：</b> ' + esc(j.dir) + '<br>' + j.files.map(f => '· ' + esc(f)).join('<br>');
    body.appendChild(div);
  } catch (e) { log('合成失败: ' + e.message); }
  $('btn-compose').disabled = false;
});

/* ---------- 需求转译 ---------- */
$('btn-req-questions').addEventListener('click', async () => {
  const text = $('req-text').value.trim();
  if (!text) { log('请先粘贴需求文本'); return; }
  $('btn-req-questions').disabled = true;
  log('解析需求、生成拷问清单...');
  try {
    state.reqQuestions = await api('/api/req/questions', 'POST', { text });
    const box = $('req-questions');
    const feats = (state.reqQuestions.features || []).map(f => '· ' + f.title + (f.note ? '（' + f.note + '）' : '')).join('<br>');
    box.innerHTML = (feats ? '<div class="q"><b>识别到的功能点：</b><br>' + feats + '</div>' : '')
      + (state.reqQuestions.questions || []).map((q, i) =>
        '<div class="q" data-q="' + i + '"><div class="qt"><b>' + (i + 1) + '. [' + esc(q.domain) + ']</b> ' + esc(q.q) + '</div>'
        + '<div class="def">推荐默认：' + esc(q.def || '') + '</div>'
        + '<div class="qopts"><label><input type="radio" name="q' + i + '" value="default" checked> 按默认</label>'
        + '<label><input type="radio" name="q' + i + '" value="custom"> 我来答</label>'
        + '<input type="text" id="qa-' + i + '" placeholder="自定义答案（选了「我来答」才生效）"></div></div>'
      ).join('');
    $('btn-req-generate').classList.remove('hidden');
    log('拷问清单已出（' + (state.reqQuestions.questions || []).length + ' 问），选择性回答或全部按默认，然后点「② 生成五件套」');
  } catch (e) { log('解析失败: ' + e.message); }
  $('btn-req-questions').disabled = false;
});
$('btn-req-generate').addEventListener('click', async () => {
  const text = $('req-text').value.trim();
  if (!state.reqQuestions) { log('请先点「① 解析」'); return; }
  const answers = {};
  (state.reqQuestions.questions || []).forEach((q, i) => {
    const mode = document.querySelector('input[name="q' + i + '"]:checked');
    const custom = $('qa-' + i).value.trim();
    answers[q.q] = (mode && mode.value === 'custom' && custom) ? custom : ('按默认: ' + (q.def || ''));
  });
  $('btn-req-generate').disabled = true;
  log('生成五件套（这是最慢的一步，约 1-3 分钟）...');
  try {
    const j = await api('/api/req/generate', 'POST', { text, root: $('req-root').value.trim(), answers });
    $('req-results').classList.remove('hidden');
    $('req-results-body').innerHTML = '<b>已输出到：</b> ' + esc(j.dir) + '<br>' + j.files.map(f => '· ' + esc(f)).join('<br>');
    log('五件套完成：' + j.files.join(', '));
  } catch (e) { log('生成失败: ' + e.message); }
  $('btn-req-generate').disabled = false;
});

init();
