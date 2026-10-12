'use strict';

// npm run build first. Requires Playwright (or PLAYWRIGHT_MODULE_PATH pointing
// at an existing installation). Uses a fresh profile, a local model fixture,
// and hidden Electron windows. No OS keyboard/mouse input or real model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.EXPERT_E2E_OUTPUT || path.join(root, 'artifacts', `expert-plaza-e2e-${Date.now()}`));
const profile = path.join(output, 'profile');
const marker = 'EXPERT-PLAZA-E2E-OK';
const requests = [];
const checks = [];
const errors = [];
let application;
let page;
let pageCdp;

const server = http.createServer((request, response) => {
  if (!request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end();
    return;
  }
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const payload = JSON.parse(body);
    requests.push(payload);
    const base = { id: 'chatcmpl-expert-e2e', created: 1, model: 'expert-e2e' };
    if (payload.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: marker }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (const chunk of [
      { delta: { role: 'assistant', content: '' }, finish_reason: null },
      { delta: { content: marker }, finish_reason: null },
      { delta: {}, finish_reason: 'stop' },
    ]) response.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, ...chunk }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
});

async function waitFor(read, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
}

function passed(label) {
  checks.push(label);
  console.log(`[Expert E2E] PASS ${label}`);
}

async function screenshot(name, { keepPointer = false } = {}) {
  if (!keepPointer) await page.mouse.move(1, 1);
  // Finish finite entrance animations explicitly: hidden Windows compositors
  // may stop advancing their frames even when timers are not throttled.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().iterations !== Infinity) {
        try { animation.finish(); } catch { /* A pending animation can be skipped. */ }
      }
    }
  });
  // Electron's capture API can paint a hidden window without waiting for a
  // foreground compositor frame or temporarily showing/focusing the window.
  const window = await application.browserWindow(page);
  await window.evaluate(async target => {
    await target.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await delay(150);
  const png = await window.evaluate(async target => (
    await target.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  ).toPNG().toString('base64'));
  await window.dispose();
  fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(png, 'base64'));
}

async function run() {
  assert(fs.existsSync(path.join(root, 'dist/index.html')), 'Run npm run build first');
  assert(!fs.existsSync(profile), 'Use a fresh output directory; existing profiles are never modified');
  fs.mkdirSync(profile, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const model = { id: 'expert-e2e', name: 'Local Expert Test', contextWindow: 128000, maxTokens: 4096 };
  const database = new DatabaseSync(path.join(profile, 'lobsterai.sqlite'));
  database.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const set = (key, value) => database.prepare('INSERT INTO kv VALUES(?,?,?)').run(key, JSON.stringify(value), Date.now());
  set('privacy_agreed', true);
  set('app_config', {
    language: 'zh', theme: 'light', usageAnalyticsEnabled: false, useSystemProxy: false,
    api: { key: 'local-fixture', baseUrl },
    model: { defaultModel: model.id, defaultModelProvider: 'custom_0', availableModels: [model] },
    providers: { custom_0: { enabled: true, apiKey: 'local-fixture', baseUrl, apiFormat: 'openai', displayName: 'Local Expert Test', models: [model] } },
  });
  database.close();

  const bootstrap = path.join(output, 'hidden-electron.cjs');
  fs.writeFileSync(bootstrap, [
    "const electron = require('electron');",
    'const { app, BrowserWindow } = electron;',
    `app.setAppPath(${JSON.stringify(root)});`,
    "for (const method of ['show', 'showInactive', 'focus', 'moveTop']) BrowserWindow.prototype[method] = function () {};",
    'app.focus = () => {};',
    "app.on('browser-window-created', (_event, window) => window.setSkipTaskbar(true));",
    `require(${JSON.stringify(path.join(root, 'dist-electron/main.js'))});`,
  ].join('\n'));

  application = await _electron.launch({
    executablePath: require('electron'),
    args: [bootstrap, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], cwd: root,
    env: { ...process.env, NODE_ENV: 'production', LOBSTERAI_DEV_USER_DATA_DIR: profile }, timeout: 120000,
  });
  const log = fs.createWriteStream(path.join(output, 'electron.log'));
  application.process().stdout?.pipe(log, { end: false });
  application.process().stderr?.pipe(log, { end: false });
  page = await application.firstWindow();
  pageCdp = await page.context().newCDPSession(page);
  await pageCdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.electron?.agents), { timeout: 60000 });
  // A fresh runtime may spend several minutes loading plugins on Windows.
  // Match the application's startup ceiling instead of aborting a progressing cold start.
  await waitFor(async () => (await page.evaluate(() => window.electron.openclaw.engine.getStatus())).status?.phase === 'running', 'OpenClaw startup', 900000);
  await page.addLocatorHandler(page.locator('.subscription-trial-close'), async close => close.click());
  const openPlaza = () => page.getByRole('button', { name: /^专家广场/ }).click();
  await openPlaza();
  const catalog = await page.evaluate(() => window.electron.agents.presetTemplates());
  assert(catalog.length >= 60, 'Expanded catalog must cover the requested scenarios');
  await waitFor(async () => await page.locator('article').count() === catalog.length, 'all expert cards');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible())), false, 'Test windows must remain hidden');
  await screenshot('01-plaza-light');
  const featured = page.getByRole('region', { name: '精选场景', exact: true });
  await page.getByRole('heading', { name: '校园里的每一步', exact: true }).waitFor();
  const rail = featured.locator('[tabindex="0"]');
  await page.getByRole('button', { name: '下一组精选场景' }).click();
  await waitFor(async () => (await rail.evaluate(element => element.scrollLeft)) > 0, 'featured carousel navigation');
  await page.getByRole('button', { name: '上一组精选场景' }).click();
  passed(`${catalog.length} experts, campus scenarios and carousel navigation in a hidden Electron window`);

  const search = page.getByRole('textbox', { name: '搜索专家、场景或标签' });
  await search.fill('小程序');
  await waitFor(async () => await page.locator('article').count() === 1, 'search results');
  await page.getByRole('button', { name: '清空搜索' }).click();
  await page.getByRole('button', { name: '技术开发', exact: true }).click();
  await waitFor(async () => await page.locator('article').count() === catalog.filter(expert => expert.category === 'engineering').length, 'category results');
  await page.getByRole('button', { name: '原型开发', exact: true }).click();
  await waitFor(async () => await page.locator('article').count() === 2, 'cross-category tag results');
  await screenshot('02-filtered');
  await search.fill('no-matching-expert');
  await page.getByText('没有找到符合条件的专家，换个关键词试试。').waitFor();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await waitFor(async () => await page.locator('article').count() === catalog.length, 'reset filters');
  passed('search, category, tag, empty state and reset');

  await page.getByRole('button', { name: '套件·技能·连接器', exact: true }).click();
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['套件', '技能', '连接器']);
  assert.equal(await page.getByRole('tab', { name: '套件', exact: true }).getAttribute('aria-selected'), 'true');
  await screenshot('03-kits-directory');
  await page.getByRole('tab', { name: '技能', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '技能', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: '连接器', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '连接器', exact: true }).getAttribute('aria-selected'), 'true');
  passed('directory defaults to Kits and all three tabs work');

  await page.getByRole('button', { name: '新建 Agent', exact: true }).click();
  await page.getByRole('button', { name: '从专家广场选择', exact: true }).click();
  await waitFor(async () => await page.locator('article').count() === catalog.length, 'template entry opens Expert Plaza');
  passed('the former Agent template entry opens Expert Plaza');
  await page.getByRole('button', { name: '小程序落地顾问', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const examples = dialog.getByRole('button').filter({ hasText: '我想做一个社区活动报名小程序' });
  const example = (await examples.innerText()).trim();
  await screenshot('04-expert-detail');
  const initialSessions = await page.evaluate(() => window.electron.cowork.listSessions());
  await examples.click();
  await waitFor(async () => (await page.locator('textarea').first().inputValue().catch(() => '')) === example, 'expert draft');
  let agents = await page.evaluate(() => window.electron.agents.list());
  let expert = agents.find(agent => agent.presetId === 'miniapp-advisor');
  assert(expert, 'A real preset Agent must be persisted');
  assert.equal((await page.evaluate(() => window.electron.cowork.listSessions())).sessions.length, initialSessions.sessions.length);
  assert.equal(requests.length, 0, 'Summoning must not call the model');
  await screenshot('05-summoned-draft');
  passed('summon creates an Agent and an editable draft without executing');

  await page.evaluate(async id => {
    const agent = await window.electron.agents.get(id);
    await window.electron.agents.update(id, { name: '我的小程序顾问', systemPrompt: `${agent.systemPrompt}\nUSER-CUSTOM-EXPERT-MARKER`, skillIds: ['web-search'], enabled: false });
  }, expert.id);
  await openPlaza();
  await page.getByRole('textbox', { name: '搜索专家、场景或标签' }).fill('小程序');
  await page.getByRole('button', { name: '召唤 小程序落地顾问', exact: true }).click();
  await waitFor(async () => (await page.locator('textarea').first().inputValue().catch(() => '')) === example, 'reused expert draft');
  agents = await page.evaluate(() => window.electron.agents.list());
  const matching = agents.filter(agent => agent.presetId === 'miniapp-advisor');
  assert.equal(matching.length, 1);
  expert = matching[0];
  assert.equal(expert.name, '我的小程序顾问');
  assert.equal(expert.enabled, true);
  assert.deepEqual(expert.skillIds, ['web-search']);
  assert(expert.systemPrompt.includes('USER-CUSTOM-EXPERT-MARKER'));
  assert.equal((await page.evaluate(() => window.electron.cowork.listSessions())).sessions.length, initialSessions.sessions.length);
  const runtimeConfig = JSON.parse(fs.readFileSync(path.join(profile, 'openclaw/state/openclaw.json'), 'utf8'));
  assert(Object.hasOwn(runtimeConfig.agents.entries, expert.id));
  assert(fs.readFileSync(path.join(profile, `openclaw/state/workspace-${expert.id}/SOUL.md`), 'utf8').includes('USER-CUSTOM-EXPERT-MARKER'));
  passed('repeat summon reuses and re-enables the Agent, preserves edits, syncs OpenClaw');

  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await waitFor(async () => (await page.evaluate(() => window.electron.cowork.listSessions())).sessions.find(session => session.agentId === expert.id && session.status === 'completed'), 'expert task completion', 120000);
  await page.getByText(marker, { exact: true }).first().waitFor();
  assert(requests.some(request => JSON.stringify(request.messages).includes('USER-CUSTOM-EXPERT-MARKER')));
  assert(requests.some(request => JSON.stringify(request.messages).includes(example)));
  await screenshot('06-local-model-response');
  passed('explicit Send routes the task through OpenClaw with the expert instructions');

  await page.evaluate(() => window.electron.agents.create({ name: 'E2E 自定义助手', systemPrompt: 'CUSTOM-AGENT-CHECK', model: 'custom_0/expert-e2e', skillIds: ['docx'] }));
  await page.reload();
  await page.locator('[data-onboarding-target="new-task"]').click();
  const carriedDraft = '请保留这段尚未发送的内容，帮我整理下周的活动安排。';
  await page.locator('textarea').first().fill(carriedDraft);
  const sessionCount = (await page.evaluate(() => window.electron.cowork.listSessions())).sessions.length;
  const requestCount = requests.length;
  const openPicker = async () => {
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.getByRole('menuitem', { name: '召唤专家', exact: true }).click();
  };
  await openPicker();
  await page.getByRole('menuitemradio', { name: '我的小程序顾问', exact: true }).waitFor();
  await page.getByRole('menuitemradio', { name: 'E2E 自定义助手', exact: true }).waitFor();
  await screenshot('09-installed-expert-picker', { keepPointer: true });
  await page.getByRole('textbox', { name: '搜索已有专家' }).fill('自定义');
  assert.equal(await page.getByRole('menuitemradio').count(), 1);
  await page.getByRole('menuitemradio', { name: 'E2E 自定义助手', exact: true }).click();
  assert.equal(await page.locator('textarea').first().inputValue(), carriedDraft);
  assert((await page.getByRole('button', { name: '选择 Agent', exact: true }).getAttribute('title')).includes('E2E 自定义助手'));
  await openPicker();
  await page.getByRole('menuitemradio', { name: '我的小程序顾问', exact: true }).click();
  assert.equal(await page.locator('textarea').first().inputValue(), carriedDraft);
  assert((await page.getByRole('button', { name: '选择 Agent', exact: true }).getAttribute('title')).includes('我的小程序顾问'));
  assert.equal((await page.evaluate(() => window.electron.cowork.listSessions())).sessions.length, sessionCount);
  assert.equal(requests.length, requestCount);
  await screenshot('10-switched-expert-draft');
  passed('home picker lists custom and preset agents, filters them and carries unsent text without execution');
  await openPicker();
  await page.getByRole('menuitem', { name: '召唤更多专家', exact: true }).click();
  await waitFor(async () => await page.locator('article').count() === catalog.length, 'explore more opens plaza');
  await page.locator('[data-onboarding-target="new-task"]').click();
  assert.equal(await page.locator('textarea').first().inputValue(), carriedDraft);
  passed('Explore more opens Expert Plaza and returning preserves the home draft');

  await openPlaza();
  await page.getByRole('textbox', { name: '搜索专家、场景或标签' }).fill('校园活动统筹师');
  await page.getByRole('button', { name: '召唤 校园活动统筹师', exact: true }).click();
  const campusPreset = catalog.find(preset => preset.id === 'campus-event-planner');
  await waitFor(async () => (await page.locator('textarea').first().inputValue().catch(() => '')) === campusPreset.starterPrompts[0].zh, 'new campus expert draft');
  const campusAgent = (await page.evaluate(() => window.electron.agents.list())).find(agent => agent.presetId === campusPreset.id);
  assert(campusAgent);
  assert.deepEqual(campusAgent.skillIds, campusPreset.skillIds);
  assert(campusAgent.systemPrompt.includes('天气、设备、拥挤'));
  assert.equal(requests.length, requestCount);
  await screenshot('11-campus-expert-draft');
  passed('a newly added campus expert installs with its own workflow, bundled skills and starter draft');

  await openPlaza();
  await page.setViewportSize({ width: 1000, height: 760 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await screenshot('07-plaza-narrow');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(async () => {
    const config = await window.electron.store.get('app_config');
    delete config.themeId;
    await window.electron.store.set('app_config', { ...config, language: 'en', theme: 'dark' });
  });
  await page.reload();
  await page.getByRole('button', { name: /^Expert Plaza/ }).click();
  await waitFor(async () => await page.locator('article').count() === catalog.length, 'English experts');
  assert(await page.locator('html').evaluate(element => element.classList.contains('dark')));
  await screenshot('08-plaza-dark-en');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible())), false);
  assert.deepEqual(errors, [], 'No uncaught renderer exceptions');
  passed('narrow layout, English, dark theme and no uncaught renderer errors');
}

run().then(() => {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: true, checks, localModelRequests: requests.length, output }, null, 2));
  console.log(`[Expert E2E] Evidence: ${output}`);
}).catch(async error => {
  console.error(error);
  if (page && !page.isClosed()) {
    await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => 'Page unavailable'));
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, checks, error: error.message, rendererErrors: errors }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (application) {
    await application.evaluate(() => { process.emit('SIGTERM'); }).catch(() => {});
    await application.close().catch(() => {});
  }
  server.closeAllConnections();
  server.close();
});
