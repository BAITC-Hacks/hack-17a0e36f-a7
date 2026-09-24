const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function apiWith(fetch) {
  const context = vm.createContext({ window: {}, fetch, AbortController, setTimeout, clearTimeout });
  vm.runInContext(source('ui/api-client.js'), context);
  return context.window.SanaMatchApi;
}

test('API exposes structured server errors without losing the message or code', async () => {
  const api = apiWith(async () => ({ ok: false, status: 409, json: async () => ({ error: { code: 'DUPLICATE_RESPONSE', message: 'Команда уже откликнулась.' } }) }));
  await assert.rejects(api.createResponse({}), error => error.status === 409 && error.code === 'DUPLICATE_RESPONSE' && error.message === 'Команда уже откликнулась.');
});
test('API rejects successful HTTP responses that contain no JSON', async () => {
  const api = apiWith(async () => ({ ok: true, json: async () => { throw new Error('HTML'); } }));
  await assert.rejects(api.health(), /некорректный ответ/);
});
test('health validates API identity instead of trusting any HTTP 200', async () => {
  const api = apiWith(async () => ({ ok: true, json: async () => ({ message: 'not an API' }) }));
  await assert.rejects(api.health(), /API SanaMatch недоступен/);
});
test('API returns an actionable timeout error', async () => {
  const api = apiWith(async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; });
  await assert.rejects(api.getTasks(), /не ответил вовремя/);
});

function appHarness() {
  const nodes = new Map();
  function element() {
    const classes = new Set();
    return {
      value: '', textContent: '', innerHTML: '', disabled: false, style: {}, dataset: {}, children: [],
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), toggle: (value, force) => force ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) },
      append(...values) { this.children.push(...values); }, replaceChildren(...values) { this.children = values; },
      addEventListener() {}, setAttribute() {}, scrollIntoView() {}, focus() {}, showModal() {}, close() {}
    };
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { getElementById: node, createElement: element },
    window: { SanaMatchApi: {}, SanaMatchDemo: {} }, URL,
    setTimeout: () => 1, clearTimeout() {}
  });
  // Test the real functions without starting asynchronous page initialization.
  vm.runInContext(source('app.js').replace(/\ninit\(\);\s*$/, '\n'), context);
  return { context, node, run: expression => vm.runInContext(expression, context) };
}

test('chat history fits server limits while retaining the latest answer', () => {
  const app = appHarness();
  const result = app.run("recentChatMessages(Array.from({length: 50}, (_, i) => ({role: i % 2 ? 'user' : 'assistant', content: String(i) + 'a'.repeat(4990)})))");
  assert.ok(result.length <= 20);
  assert.ok(result.reduce((sum, item) => sum + item.content.length, 0) <= 24000);
  assert.ok(result.every(item => item.content.length <= 4000));
  assert.ok(result.at(-1).content.startsWith('49'));
});
test('a healthy backend is not advertised as a verified live LLM', () => {
  const app = appHarness();
  app.run('setConnectionMode(true)');
  assert.equal(app.node('connectionBadge').textContent, 'API подключён');
  assert.notEqual(app.node('aiModeBadge').textContent, 'AI подключён');
  assert.equal(app.node('aiModeBadge').classList.contains('mode-live'), false);
});
test('manual edits invalidate undo for that field instead of being overwritten', () => {
  const app = appHarness();
  app.run("undoSnapshot = {field: 'result', value: 'old'}; changeCardField('result', 'Моя ручная правка'); undoLastApply()");
  assert.equal(app.run('card.result'), 'Моя ручная правка');
  assert.equal(app.run('undoSnapshot'), null);
});
test('one in-flight publication cannot be submitted twice or overwrite newer edits', async () => {
  const app = appHarness();
  let resolve;
  let calls = 0;
  app.context.window.SanaMatchApi.createTask = () => { calls += 1; return new Promise(done => { resolve = done; }); };
  app.run('isApiMode = true');
  app.node('title').value = 'First task';
  app.node('context').value = 'Context';
  app.node('result').value = 'Prototype';
  const first = app.context.confirmPublishTask();
  await app.context.confirmPublishTask();
  assert.equal(calls, 1);
  app.run("changeCardField('result', 'New manual result')");
  resolve({ id: 'saved-id' });
  await first;
  assert.equal(app.run('card.result'), 'New manual result');
  assert.equal(app.run('activeTaskId'), 'saved-id');
  assert.equal(app.node('publishButton').disabled, false);
});
test('new task clears only the draft, not server-backed tasks or responses', () => {
  const app = appHarness();
  app.run("isApiMode = true; tasks = [{id: 'kept', published: true}]; responses = [{id: 'kept-response'}]; activeTaskId = 'kept'; resetDemo()");
  assert.equal(app.run('tasks.length'), 1);
  assert.equal(app.run('responses.length'), 1);
  assert.equal(app.run('activeTaskId'), null);
  assert.equal(app.run('card.title'), '');
});
test('prototype URL validation blocks executable schemes and embedded credentials', () => {
  const app = appHarness();
  for (const value of ['javascript:alert(1)', 'https://', 'https://user:pass@example.com', 'https://bad host/', 'https://example.com:99999/']) {
    assert.equal(app.context.validPrototypeUrl(value), false, value);
  }
  assert.equal(app.context.validPrototypeUrl('https://example.com/prototype'), true);
});

function demoHarness(value = null) {
  const context = vm.createContext({ window: {}, structuredClone, setTimeout: callback => callback(), localStorage: { getItem: () => value, setItem() {} } });
  vm.runInContext(source('ui/demo-adapter.js'), context);
  return context.window.SanaMatchDemo;
}
test('static demo recovers from corrupted storage and seeds five records of each kind', () => {
  for (const value of ['broken JSON', '[null]', '[{"id":4}]']) {
    const demo = demoHarness(value);
    assert.equal(demo.load().tasks.length, 5);
    assert.equal(demo.load().responses.length, 5);
    assert.equal(demo.teams.length, 5);
  }
});
test('static demo maps the first actual answer to users, not the next field', async () => {
  const demo = demoHarness();
  const payload = { draft: 'Нужен помощник операторам', card: {}, messages: [], requestId: 'demo-test', cardVersion: 0 };
  const first = await demo.chat(payload);
  const next = await demo.chat({ ...payload, messages: [
    { role: 'user', content: payload.draft }, { role: 'assistant', content: first.reply }, { role: 'user', content: 'Операторы поддержки' }
  ] });
  assert.equal(next.updates[0].field, 'users');
  assert.equal(next.updates[0].value, 'Операторы поддержки');
});
