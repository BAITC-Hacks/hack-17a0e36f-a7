const CARD_FIELDS = ['title', 'context', 'users', 'data', 'constraints', 'result', 'success', 'contact', 'format'];
const SCORE_WEIGHTS = { context: 20, data: 20, result: 15, success: 15, constraints: 10, users: 10, contactFormat: 10 };
const SCORE_LABELS = { context: 'Контекст и потребность', data: 'Данные и материалы', result: 'Ожидаемый результат', success: 'Критерии успеха', constraints: 'Ограничения', users: 'Пользователи', contactFormat: 'Контакт и формат связи' };
const DETAIL_FIELDS = [
  ['context', 'Контекст и потребность'], ['users', 'Пользователи'], ['data', 'Данные и материалы'],
  ['result', 'Ожидаемый результат'], ['success', 'Критерии успеха'], ['constraints', 'Ограничения'],
  ['contact', 'Контакт'], ['format', 'Формат взаимодействия']
];
const $ = id => document.getElementById(id);
let tasks = [];
let responses = [];
let teams = [];
let isApiMode = false;
let loadError = false;
let card = emptyCard();
let cardVersion = 0;
let chatHistory = [];
let pendingChanges = [];
let manualFields = new Set();
let selectedTaskId = null;
let activeTaskId = null;
let requestSequence = 0;
let latestRequestId = null;
let chatBusy = false;
let publishBusy = false;
let proposalBusy = false;
let failedChatRequest = null;
let undoSnapshot = null;
let activeDetailTask = null;

function emptyCard() {
  return { id: '', title: '', context: '', users: '', data: '', constraints: '', result: '', success: '', contact: '', format: '', topic: 'Retail', company: '', published: false };
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function text(value) { return String(value ?? '').trim(); }
function isFilled(value) { return Boolean(text(value)); }
function readiness(score) { return score < 40 ? ['Черновик', 'draft'] : score < 70 ? ['Рабочая', 'working'] : score < 90 ? ['Готовая', 'ready'] : ['Приоритетная', 'priority']; }
function scoreCard(value) {
  const complete = {
    context: isFilled(value.context), data: isFilled(value.data), result: isFilled(value.result),
    success: isFilled(value.success), constraints: isFilled(value.constraints), users: isFilled(value.users),
    contactFormat: isFilled(value.contact) && isFilled(value.format)
  };
  return Object.entries(complete).reduce((sum, [key, filled]) => sum + (filled ? SCORE_WEIGHTS[key] : 0), 0);
}
function missingCriteria(value) {
  return ['context', 'data', 'result', 'success', 'constraints', 'users', 'contactFormat'].filter(key => key === 'contactFormat' ? !(isFilled(value.contact) && isFilled(value.format)) : !isFilled(value[key]));
}
function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.add('hidden'), 4200);
}
function setConnectionMode(api, description) {
  isApiMode = api;
  const badge = $('connectionBadge');
  badge.textContent = api ? 'API подключён' : 'Локальный демо-режим';
  badge.classList.toggle('is-api', api);
  badge.classList.toggle('is-demo', !api);
  $('aiModeBadge').textContent = api ? 'Ожидаем ответ' : 'Локальный помощник';
  $('aiModeBadge').classList.remove('mode-live');
  $('aiModeBadge').classList.add('mode-demo');
  $('resetDemoButton').textContent = api ? 'Новая задача' : 'Сбросить демо-данные';
  $('aiModeDescription').textContent = description || (api ? 'Ответы приходят от сервера SanaMatch.' : 'Фиксированные тестовые ответы. Внешняя модель не подключена.');
}
function showLoading(show) {
  chatBusy = show;
  $('chatLoading').classList.toggle('hidden', !show);
  $('sendChatButton').disabled = show;
  $('analyzeButton').disabled = show;
  $('chatInput').disabled = show;
  $('retryChatButton').disabled = show;
  $('loadDemoButton').disabled = show;
  $('resetDemoButton').disabled = show || publishBusy;
  $('sendChatButton').textContent = show ? 'Ждём…' : 'Отправить';
}
function addMessage(role, content) {
  const node = document.createElement('div');
  node.className = `chat-message ${role}`;
  node.textContent = content;
  $('chatMessages').append(node);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}
function renderChat() {
  const box = $('chatMessages');
  box.replaceChildren();
  chatHistory.forEach(message => addMessage(message.role === 'assistant' ? 'bot' : 'user', message.content));
  $('aiEmpty').classList.toggle('hidden', chatHistory.length > 0);
}
function updateCardUI() {
  const score = scoreCard(card);
  const [level, className] = readiness(score);
  const missing = missingCriteria(card);
  $('score').textContent = String(score);
  $('compactScore').textContent = `${score}/100`;
  $('tabScore').textContent = `${score}/100`;
  $('progressBar').style.width = `${score}%`;
  $('progress').setAttribute('aria-valuenow', String(score));
  $('readiness').textContent = level;
  $('draftBadge').textContent = level;
  $('draftBadge').className = `badge ${className}`;
  $('missingCount').textContent = `${missing.length} ${missing.length === 1 ? 'критерий не заполнен' : 'критериев незаполнено'}`;
  $('scoreBreakdown').replaceChildren();
  Object.keys(SCORE_WEIGHTS).forEach(key => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    const complete = key === 'contactFormat' ? isFilled(card.contact) && isFilled(card.format) : isFilled(card[key]);
    row.innerHTML = `<span>${SCORE_LABELS[key]}</span><strong>${complete ? SCORE_WEIGHTS[key] : 0}/${SCORE_WEIGHTS[key]}</strong>`;
    $('scoreBreakdown').append(row);
  });
  $('missingList').replaceChildren();
  if (!missing.length) {
    const item = document.createElement('li'); item.textContent = 'Все критерии готовности заполнены.'; $('missingList').append(item);
  } else {
    missing.forEach(key => { const item = document.createElement('li'); item.textContent = `Добавьте: ${SCORE_LABELS[key].toLowerCase()}`; $('missingList').append(item); });
  }
}
function syncCardFromInputs() {
  CARD_FIELDS.forEach(field => { card[field] = $(field).value.trim(); });
  card.topic = $('draftTopic').value;
  card.company = $('company').value.trim();
}
function fillInputsFromCard() {
  CARD_FIELDS.forEach(field => { $(field).value = card[field] || ''; });
  $('draftTopic').value = card.topic || 'Retail';
  $('company').value = card.company || '';
  updateCardUI();
}
function setWorkspaceTab(tab) {
  const showCard = tab === 'card';
  $('builder').classList.toggle('show-card', showCard);
  $('conversationTab').classList.toggle('active', !showCard);
  $('cardTab').classList.toggle('active', showCard);
  $('conversationTab').setAttribute('aria-selected', String(!showCard));
  $('cardTab').setAttribute('aria-selected', String(showCard));
}
function changeCardField(field, value, manual = true) {
  if (!CARD_FIELDS.includes(field)) return;
  card[field] = text(value);
  $(field).value = card[field];
  if (manual) {
    manualFields.add(field);
    if (undoSnapshot?.field === field) undoSnapshot = null;
  }
  cardVersion += 1;
  updateCardUI();
  renderChanges();
}
function changeFromServerValue(value) {
  const normalized = { ...emptyCard(), ...value };
  CARD_FIELDS.forEach(field => { if (typeof normalized[field] !== 'string') normalized[field] = ''; });
  return normalized;
}

function renderChanges() {
  $('aiUpdates').replaceChildren();
  $('aiSuggestions').replaceChildren();
  const open = pendingChanges.filter(change => change.status === 'pending');
  $('changesCount').textContent = String(open.length);
  $('changesEmpty').classList.toggle('hidden', open.length > 0);
  $('undoApplyButton').classList.toggle('hidden', !undoSnapshot);
  const updateItems = pendingChanges.filter(change => change.kind === 'update' && change.status === 'pending');
  const suggestionItems = pendingChanges.filter(change => change.kind === 'suggestion' && change.status === 'pending');
  [['aiUpdates', updateItems], ['aiSuggestions', suggestionItems]].forEach(([containerId, items]) => {
    const container = $(containerId);
    if (items.length) {
      const title = document.createElement('p'); title.className = 'change-kind-title';
      title.textContent = containerId === 'aiUpdates' ? 'Извлечённые факты' : 'Предложения помощника'; container.append(title);
    }
    items.forEach(change => {
      const actualIndex = pendingChanges.indexOf(change);
      const oldValue = text(card[change.field]);
      const manuallyEdited = manualFields.has(change.field);
      const article = document.createElement('article'); article.className = 'change-card';
      const header = document.createElement('div'); header.className = 'change-card-heading';
      const fieldLabel = document.createElement('strong'); fieldLabel.textContent = fieldLabelFor(change.field);
      const type = document.createElement('span'); type.className = `change-type ${change.kind}`; type.textContent = change.kind === 'update' ? 'Факт из текста' : 'Предложение';
      header.append(fieldLabel, type);
      const compare = document.createElement('div'); compare.className = 'change-compare';
      const old = document.createElement('p'); old.innerHTML = `<span>${oldValue ? 'Сейчас' : 'Сейчас пусто'}</span><b>${escapeHtml(oldValue || 'Не указано')}</b>`;
      const next = document.createElement('p'); next.innerHTML = `<span>Предлагается</span><b>${escapeHtml(change.value || 'Не указано')}</b>`;
      compare.append(old, next);
      const reason = document.createElement('p'); reason.className = 'change-reason'; reason.textContent = change.evidence || change.reason || '';
      const actions = document.createElement('div'); actions.className = 'change-actions';
      const apply = document.createElement('button'); apply.className = 'small-btn pick'; apply.type = 'button'; apply.dataset.changeAction = 'apply'; apply.dataset.changeIndex = String(actualIndex); apply.textContent = 'Применить';
      const reject = document.createElement('button'); reject.className = 'small-btn reject'; reject.type = 'button'; reject.dataset.changeAction = 'reject'; reject.dataset.changeIndex = String(actualIndex); reject.textContent = 'Отклонить';
      actions.append(apply, reject);
      if (manuallyEdited) { const note = document.createElement('p'); note.className = 'manual-note'; note.textContent = 'Вы редактировали это поле вручную. Применение заменит ваше значение.'; article.append(note); }
      article.append(header, compare, reason, actions);
      container.append(article);
    });
  });
}
function fieldLabelFor(field) { return ({ title: 'Название задачи', context: 'Контекст и потребность', users: 'Пользователи', data: 'Данные и материалы', constraints: 'Ограничения', result: 'Ожидаемый результат', success: 'Критерии успеха', contact: 'Контакт', format: 'Формат взаимодействия' })[field] || field; }
function handleChangeAction(event) {
  const button = event.target.closest('[data-change-action]');
  if (!button) return;
  const change = pendingChanges[Number(button.dataset.changeIndex)];
  if (!change || change.status !== 'pending') return;
  if (button.dataset.changeAction === 'reject') {
    change.status = 'rejected'; renderChanges(); return;
  }
  undoSnapshot = { field: change.field, value: card[change.field], wasManual: manualFields.has(change.field), change };
  change.status = 'applied';
  manualFields.delete(change.field);
  changeCardField(change.field, change.value, false);
  renderChanges();
}
function undoLastApply() {
  if (!undoSnapshot) return;
  const snapshot = undoSnapshot;
  undoSnapshot = null;
  snapshot.change.status = 'pending';
  manualFields.delete(snapshot.field);
  if (snapshot.wasManual) manualFields.add(snapshot.field);
  card[snapshot.field] = snapshot.value;
  $(snapshot.field).value = snapshot.value;
  cardVersion += 1;
  updateCardUI();
  renderChanges();
}

function recentChatMessages(messages) {
  const recent = [];
  let size = 0;
  for (const message of messages.slice(-20).reverse()) {
    const content = message.content.slice(0, 4000);
    if (size + content.length > 24000) break;
    recent.unshift({ role: message.role, content });
    size += content.length;
  }
  return recent;
}
async function sendChatRequest({ text: messageText, initial = false } = {}) {
  if (chatBusy) return;
  const trimmed = text(messageText);
  if (!trimmed) { notify(initial ? 'Сначала добавьте описание задачи.' : 'Напишите сообщение перед отправкой.'); return; }
  if (trimmed.length > (initial ? 5000 : 4000)) { notify('Сократите сообщение: до 5000 символов в черновике или 4000 в чате.'); return; }
  if (!initial && !text($('draftText').value)) {
    $('draftText').value = trimmed;
    initial = true;
  }
  const requestId = `ui-${Date.now()}-${++requestSequence}`;
  const requestVersion = cardVersion;
  const candidateHistory = initial ? [] : [...chatHistory, { role: 'user', content: trimmed }];
  const payload = {
    requestId, cardVersion: requestVersion, draft: initial ? trimmed : text($('draftText').value),
    card: Object.fromEntries(CARD_FIELDS.map(field => [field, card[field]])),
    messages: initial ? [] : recentChatMessages(candidateHistory), language: 'ru'
  };
  latestRequestId = requestId;
  failedChatRequest = { text: trimmed, initial, payload };
  $('chatError').classList.add('hidden');
  showLoading(true);
  try {
    const result = isApiMode ? await window.SanaMatchApi.chat(payload) : await window.SanaMatchDemo.chat(payload);
    if (result?.requestId !== requestId || result?.cardVersion !== requestVersion || latestRequestId !== requestId || cardVersion !== requestVersion) {
      throw new Error('Ответ относится к устаревшей версии карточки. Повторите сообщение, чтобы помощник увидел актуальные поля.');
    }
    if (typeof result.reply !== 'string') throw new Error('Сервер вернул ответ без текста помощника.');
    if (initial) candidateHistory.push({ role: 'user', content: trimmed });
    candidateHistory.push({ role: 'assistant', content: result.reply });
    chatHistory = candidateHistory;
    renderChat();
    $('aiModeBadge').textContent = isApiMode ? (result.mode === 'llm' ? 'AI подключён' : 'Локальный помощник') : 'Локальный помощник';
    $('aiModeBadge').classList.toggle('mode-demo', result.mode !== 'llm');
    $('aiModeBadge').classList.toggle('mode-live', result.mode === 'llm');
    $('aiModeDescription').textContent = isApiMode ? (result.mode === 'llm' ? 'Ответ сгенерирован подключённой AI-моделью.' : 'Сервер вернул локальный безопасный ответ.') : 'Фиксированные тестовые ответы. Внешняя модель не подключена.';
    {
      const updates = Array.isArray(result.updates) ? result.updates : [];
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      const accepted = [...updates.map(item => ({ ...item, kind: 'update' })), ...suggestions.map(item => ({ ...item, kind: 'suggestion' }))]
        .filter(item => CARD_FIELDS.includes(item.field) && typeof item.value === 'string' && text(item.value));
      accepted.filter(item => text(card[item.field]) !== text(item.value) && !pendingChanges.some(change => change.status === 'pending' && change.field === item.field && change.value === text(item.value)))
        .forEach(item => pendingChanges.push({ ...item, value: text(item.value), status: 'pending', requestId, sourceVersion: requestVersion }));
      if (Array.isArray(result.issues) && result.issues.length) {
        notify(`Помощник сообщил о проблемах в данных: ${result.issues.map(item => item.message).filter(Boolean).join(' · ')}`);
      }
      renderChanges();
    }
    $('chatInput').value = '';
    failedChatRequest = null;
  } catch (error) {
    const message = error instanceof TypeError ? 'Не удалось связаться с помощником. Проверьте сеть или сервер и повторите запрос.' : error.message || 'Не удалось получить ответ помощника.';
    $('chatErrorText').textContent = message;
    $('chatError').classList.remove('hidden');
  } finally {
    showLoading(false);
  }
}
function analyzeDraft() {
  if (chatBusy) return;
  const draft = text($('draftText').value);
  if (!draft) { notify('Сначала добавьте короткое описание задачи.'); $('draftText').focus(); return; }
  card.topic = $('draftTopic').value;
  card.company = text($('company').value);
  $('aiEmpty').classList.add('hidden');
  $('chatMessages').replaceChildren();
  chatHistory = [];
  pendingChanges = [];
  undoSnapshot = null;
  renderChanges();
  sendChatRequest({ text: draft, initial: true });
}
function retryChat() {
  if (!failedChatRequest || chatBusy) return;
  sendChatRequest({ text: failedChatRequest.text, initial: failedChatRequest.initial, retry: true });
}

async function persistDemo() {
  if (isApiMode) return;
  try { window.SanaMatchDemo.save(tasks, responses); }
  catch (error) { throw error; }
}
function scoreTask(task) { return { ...task, score: scoreCard(task) }; }
function renderCatalog() {
  const topic = $('topicFilter').value;
  const level = $('readinessFilter').value;
  const filtered = tasks.map(scoreTask).filter(task => task.published)
    .filter(task => topic === 'all' || task.topic === topic)
    .filter(task => level === 'all' || (level === 'working' ? task.score >= 40 : task.score >= 70))
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), 'ru'));
  const grid = $('catalogGrid'); grid.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = loadError ? 'Не удалось загрузить каталог. Проверьте доступность API и обновите страницу.' : 'По выбранным фильтрам задач пока нет.'; grid.append(empty);
  }
  filtered.forEach(task => {
    const [levelText] = readiness(task.score);
    const article = document.createElement('article'); article.className = 'task-tile';
    article.innerHTML = `<div class="tile-meta"><span class="topic">${escapeHtml(task.topic || 'Тема не указана')}</span><span class="score-pill">${task.score}/100</span></div><h3>${escapeHtml(task.title || 'Без названия')}</h3><p>${escapeHtml(task.context || 'Контекст не указан')}</p><p class="selected-state">${escapeHtml(levelText)}</p><div class="tile-actions"><button class="button ghost details-button" type="button" data-detail-id="${escapeHtml(task.id)}">Подробнее</button><button class="button secondary respond-button" type="button" data-respond-id="${escapeHtml(task.id)}">Откликнуться →</button></div>`;
    grid.append(article);
  });
  renderResponses();
}
async function showTaskDetails(task) {
  let fullTask = task;
  if (isApiMode) {
    try { fullTask = await window.SanaMatchApi.getTask(task.id); }
    catch (error) { notify(error.message || 'Не удалось загрузить полную карточку задачи.'); return; }
  }
  activeDetailTask = { ...task, ...fullTask };
  task = activeDetailTask;
  $('detailTopic').textContent = task.topic || 'Тема не указана';
  $('detailTitle').textContent = task.title || 'Без названия';
  $('detailScore').textContent = `${scoreCard(task)}/100 · ${readiness(scoreCard(task))[0]}`;
  const fields = $('detailFields'); fields.replaceChildren();
  DETAIL_FIELDS.forEach(([key, label]) => {
    const section = document.createElement('section'); section.className = 'detail-field';
    const heading = document.createElement('h3'); heading.textContent = label;
    const value = document.createElement('p'); value.textContent = text(task[key]) || 'Не указано';
    section.append(heading, value); fields.append(section);
  });
  $('taskDetailsDialog').showModal();
}
function openProposal(taskId) {
  const task = tasks.find(item => String(item.id) === String(taskId));
  if (!task) { notify('Задача больше не доступна. Обновите каталог.'); return; }
  selectedTaskId = task.id;
  $('proposalSection').classList.remove('hidden');
  $('proposalFor').textContent = `${task.title || 'Без названия'} · ${task.topic || 'Тема не указана'}`;
  $('taskDetailsDialog').close();
  $('proposalSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('proposalIdea').focus({ preventScroll: true });
}
function renderResponses() {
  const list = $('responsesList'); list.replaceChildren();
  responses.forEach(response => {
    const task = tasks.find(item => String(item.id) === String(response.taskId)) || {};
    const team = teams.find(item => String(item.id) === String(response.teamId)) || {};
    const article = document.createElement('article'); article.className = 'response';
    const body = document.createElement('div');
    const prototype = validPrototypeUrl(response.link) ? `<a href="${escapeHtml(response.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(response.link)}</a>` : 'Ссылка не указана или некорректна';
    body.innerHTML = `<span class="topic">${escapeHtml(task.title || 'Удалённая задача')}</span><h3>${escapeHtml(team.name || 'Команда')}</h3><p><b>Идея:</b> ${escapeHtml(response.idea)}</p><p><b>План:</b> ${escapeHtml(response.plan)}</p><p><b>Прототип:</b> ${prototype}</p>`;
    const actions = document.createElement('div'); actions.className = 'response-actions';
    if (response.status === 'pending') {
      const select = document.createElement('button'); select.className = 'small-btn pick'; select.type = 'button'; select.dataset.responseId = response.id; select.dataset.responseStatus = 'selected'; select.textContent = 'Выбрать';
      const reject = document.createElement('button'); reject.className = 'small-btn reject'; reject.type = 'button'; reject.dataset.responseId = response.id; reject.dataset.responseStatus = 'rejected'; reject.textContent = 'Отклонить';
      actions.append(select, reject);
    } else {
      const status = document.createElement('span'); status.className = 'selected-state'; status.textContent = response.status === 'selected' ? '✓ Команда выбрана вручную' : 'Отклонено'; actions.append(status);
    }
    article.append(body, actions); list.append(article);
  });
  renderLeaderboard();
}
function renderLeaderboard() {
  const board = $('leaderboardList'); board.replaceChildren();
  teams.map(team => ({ ...team, points: responses.filter(response => String(response.teamId) === String(team.id) && response.status === 'selected').length * 100 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ru'))
    .forEach((team, index) => {
      const row = document.createElement('div'); row.className = 'leaderboard-row';
      row.innerHTML = `<span>${index + 1}</span><strong>${escapeHtml(team.name)}</strong><b>${team.points} pts</b>`; board.append(row);
    });
}
async function publishTask() {
  if (publishBusy) return;
  syncCardFromInputs();
  if (!isFilled(card.title) || !isFilled(card.context) || !isFilled(card.result)) {
    notify('Для публикации заполните название, контекст и ожидаемый результат.');
    const missing = ['title', 'context', 'result'].find(field => !isFilled(card[field])); if (missing) $(missing).focus(); return;
  }
  $('publishConfirmText').textContent = `«${card.title}» · рейтинг ${scoreCard(card)}/100. После подтверждения карточка появится в каталоге.`;
  $('publishConfirmDialog').showModal();
}
async function confirmPublishTask() {
  if (publishBusy) return;
  publishBusy = true;
  $('publishButton').disabled = true;
  $('confirmPublishButton').disabled = true;
  $('resetDemoButton').disabled = true;
  syncCardFromInputs();
  const taskToPublish = { ...card, published: true, score: scoreCard(card) };
  const publishedVersion = cardVersion;
  try {
    if (isApiMode) {
      const apiTask = { ...taskToPublish };
      delete apiTask.id;
      const saved = activeTaskId ? await window.SanaMatchApi.updateTask(activeTaskId, apiTask) : await window.SanaMatchApi.createTask(apiTask);
      const stored = { ...taskToPublish, ...saved };
      activeTaskId = stored.id;
      tasks = [...tasks.filter(task => String(task.id) !== String(stored.id)), stored];
    } else {
      const stored = { ...taskToPublish, id: activeTaskId || `demo-${Date.now()}` };
      activeTaskId = stored.id;
      const previous = tasks; tasks = [...tasks.filter(task => String(task.id) !== String(stored.id)), stored];
      try { await persistDemo(); } catch (error) { tasks = previous; throw error; }
    }
    card = { ...(cardVersion === publishedVersion ? taskToPublish : card), id: activeTaskId };
    renderCatalog();
    notify(cardVersion === publishedVersion ? `Задача опубликована. Рейтинг: ${taskToPublish.score}/100.` : 'Задача опубликована. Новые правки в карточке сохраните повторной публикацией.');
    $('catalog').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { notify(error.message || 'Не удалось сохранить задачу. Повторите попытку.'); }
  finally {
    publishBusy = false;
    $('publishButton').disabled = false;
    $('confirmPublishButton').disabled = false;
    $('resetDemoButton').disabled = chatBusy;
  }
}
function validPrototypeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
async function sendProposal() {
  if (proposalBusy) return;
  const idea = text($('proposalIdea').value), plan = text($('proposalPlan').value), link = text($('prototypeLink').value), teamId = teams.find(team => String(team.id) === $('teamSelect').value)?.id ?? $('teamSelect').value;
  if (selectedTaskId === null || selectedTaskId === '') { notify('Сначала выберите задачу в каталоге.'); return; }
  if (!idea || !plan) { notify('Опишите идею решения и план.'); return; }
  if (!validPrototypeUrl(link)) { notify('Добавьте корректную ссылку, начинающуюся с https://.'); $('prototypeLink').focus(); return; }
  if (responses.some(response => String(response.taskId) === String(selectedTaskId) && String(response.teamId) === String(teamId))) { notify('Эта команда уже отправила предложение по выбранной задаче.'); return; }
  const payload = { taskId: selectedTaskId, teamId, idea, plan, link };
  proposalBusy = true;
  $('sendProposal').disabled = true;
  try {
    if (isApiMode) {
      const created = await window.SanaMatchApi.createResponse(payload);
      responses = [created, ...responses];
    } else {
      const created = { ...payload, id: `demo-r-${Date.now()}`, status: 'pending' };
      const previous = responses; responses = [created, ...responses];
      try { await persistDemo(); } catch (error) { responses = previous; throw error; }
    }
    $('proposalIdea').value = ''; $('proposalPlan').value = ''; $('prototypeLink').value = '';
    notify('Предложение отправлено бизнесу.'); renderResponses(); $('responses').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { notify(error.message || 'Не удалось отправить предложение. Данные формы сохранены — попробуйте ещё раз.'); }
  finally { proposalBusy = false; $('sendProposal').disabled = false; }
}
async function setResponseStatus(id, status) {
  const response = responses.find(item => String(item.id) === String(id));
  if (!response || response.status !== 'pending' || !['selected', 'rejected'].includes(status)) return;
  if (status === 'selected' && responses.some(item => String(item.taskId) === String(response.taskId) && item.status === 'selected' && String(item.id) !== String(id))) { notify('Для этой задачи уже выбрана команда.'); return; }
  try {
    if (isApiMode) {
      const updated = await window.SanaMatchApi.updateResponse(id, status);
      responses = responses.map(item => String(item.id) === String(id) ? { ...item, ...updated } : item);
    } else {
      const previous = responses; responses = responses.map(item => String(item.id) === String(id) ? { ...item, status } : item);
      try { await persistDemo(); } catch (error) { responses = previous; throw error; }
    }
    renderResponses(); notify(status === 'selected' ? 'Команда выбрана вручную.' : 'Отклик отклонён.');
  } catch (error) { notify(error.message || 'Не удалось сохранить решение. Попробуйте ещё раз.'); }
}
async function loadApiData() {
  const results = await Promise.allSettled([window.SanaMatchApi.getTasks(), window.SanaMatchApi.getTeams(), window.SanaMatchApi.getResponses()]);
  loadError = results.some(result => result.status === 'rejected');
  if (results[0].status === 'fulfilled') tasks = Array.isArray(results[0].value) ? results[0].value.map(task => ({ ...emptyCard(), ...task })) : [];
  if (results[1].status === 'fulfilled') teams = Array.isArray(results[1].value) ? results[1].value : [];
  if (results[2].status === 'fulfilled') responses = Array.isArray(results[2].value) ? results[2].value : [];
  if (loadError) notify('Часть данных API не загрузилась. Проверьте соединение и обновите страницу.');
}
async function init() {
  fillInputsFromCard(); renderChanges();
  $('teamSelect').replaceChildren();
  try {
    await window.SanaMatchApi.health();
    setConnectionMode(true, 'Сервер доступен. Состояние данных загружается из API.');
    await loadApiData();
  } catch {
    setConnectionMode(false);
    const demo = window.SanaMatchDemo.load();
    tasks = demo.tasks; responses = demo.responses; teams = window.SanaMatchDemo.teams;
  }
  $('teamSelect').innerHTML = teams.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)} — ${escapeHtml(team.skills || '')}</option>`).join('');
  renderCatalog(); updateCardUI();
}
function resetDemo() {
  if (chatBusy || publishBusy) return;
  try {
    if (!isApiMode) {
      window.SanaMatchDemo.reset();
      const demo = window.SanaMatchDemo.load(); tasks = demo.tasks; responses = demo.responses;
    }
    latestRequestId = null; failedChatRequest = null;
    card = emptyCard(); activeTaskId = null; selectedTaskId = null; cardVersion += 1; chatHistory = []; pendingChanges = []; manualFields.clear(); undoSnapshot = null;
    $('draftText').value = ''; $('draftTopic').value = 'Retail'; $('company').value = ''; $('proposalIdea').value = ''; $('proposalPlan').value = ''; $('prototypeLink').value = '';
    $('chatInput').value = ''; $('chatError').classList.add('hidden'); $('chatMessages').replaceChildren(); $('aiEmpty').classList.remove('hidden');
    $('proposalSection').classList.add('hidden'); $('topicFilter').value = 'all'; $('readinessFilter').value = 'all'; fillInputsFromCard(); renderChanges(); renderCatalog();
    notify(isApiMode ? 'Новая карточка готова. Опубликованные задачи и отклики сохранены на сервере.' : 'Демо-сценарий сброшен. Данные на сервере не затронуты.');
  } catch (error) { notify(error.message); }
}

$('conversationTab').addEventListener('click', () => setWorkspaceTab('conversation'));
$('cardTab').addEventListener('click', () => setWorkspaceTab('card'));
$('analyzeButton').addEventListener('click', analyzeDraft);
$('sendChatButton').addEventListener('click', () => sendChatRequest({ text: $('chatInput').value }));
$('retryChatButton').addEventListener('click', retryChat);
$('chatInput').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendChatRequest({ text: $('chatInput').value }); }
});
$('aiUpdates').addEventListener('click', handleChangeAction);
$('aiSuggestions').addEventListener('click', handleChangeAction);
$('undoApplyButton').addEventListener('click', undoLastApply);
$('publishButton').addEventListener('click', publishTask);
$('cancelPublishButton').addEventListener('click', () => $('publishConfirmDialog').close());
$('cancelPublishIcon').addEventListener('click', () => $('publishConfirmDialog').close());
$('publishConfirmDialog').addEventListener('click', event => { if (event.target === $('publishConfirmDialog')) $('publishConfirmDialog').close(); });
$('confirmPublishButton').addEventListener('click', () => { $('publishConfirmDialog').close(); confirmPublishTask(); });
$('sendProposal').addEventListener('click', sendProposal);
$('loadDemoButton').addEventListener('click', () => {
  $('draftText').value = 'Интернет-магазин получает много однотипных обращений, операторы вручную распределяют их между отделами. Хотим сократить время обработки.';
  $('draftTopic').value = 'Retail'; $('company').value = 'Qadam Store'; $('builder').scrollIntoView({ behavior: 'smooth' }); analyzeDraft();
});
$('resetDemoButton').addEventListener('click', resetDemo);
$('topicFilter').addEventListener('change', renderCatalog);
$('readinessFilter').addEventListener('change', renderCatalog);
$('catalogGrid').addEventListener('click', event => {
  const details = event.target.closest('[data-detail-id]');
  const respond = event.target.closest('[data-respond-id]');
  if (details) { const task = tasks.find(item => String(item.id) === details.dataset.detailId); if (task) showTaskDetails(task); }
  if (respond) openProposal(respond.dataset.respondId);
});
$('responsesList').addEventListener('click', event => {
  const button = event.target.closest('[data-response-id]'); if (button) setResponseStatus(button.dataset.responseId, button.dataset.responseStatus);
});
$('closeDetailsButton').addEventListener('click', () => $('taskDetailsDialog').close());
$('taskDetailsDialog').addEventListener('click', event => { if (event.target === $('taskDetailsDialog')) $('taskDetailsDialog').close(); });
$('detailRespondButton').addEventListener('click', () => { if (activeDetailTask) openProposal(activeDetailTask.id); });
$('draftTopic').addEventListener('change', () => { card.topic = $('draftTopic').value; });
$('company').addEventListener('input', () => { card.company = $('company').value.trim(); });
CARD_FIELDS.forEach(field => $(field).addEventListener('input', () => changeCardField(field, $(field).value, true)));

init();
