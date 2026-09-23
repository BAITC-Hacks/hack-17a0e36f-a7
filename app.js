const weights = { context: 20, data: 20, result: 15, success: 15, constraints: 10, users: 10, contactFormat: 10 };
const labels = { context: 'Контекст и потребность', data: 'Данные и материалы', result: 'Ожидаемый результат', success: 'Критерии успеха', constraints: 'Ограничения', users: 'Пользователи', contactFormat: 'Связь с бизнесом' };
const AI_FIELD_RULES = [
  { field: 'data', label: 'Данные и материалы', detect: /данн\w*|\bcsv\b|таблиц\w*|пример\w*|материал\w*|выгрузк\w*|источник\w*/i, denied: /(?:нет|не\s+доступн\w*)\s+(?:(?:пока|у\s+нас)\s+)?(?:никаких?\s+)?(?:данн\w*|пример\w*|материал\w*)|(?:данн\w*|пример\w*)\s+(?:пока\s+)?нет/i, question: 'Какие данные, примеры или материалы доступны команде?', confirmation: 'Вы упомянули данные или материалы. Что именно будет доступно команде?', context: [{ pattern: /обращен\w*/i, question: 'Есть ли примеры таких обращений или другие материалы, доступные команде?' }] },
  { field: 'result', label: 'Ожидаемый результат', detect: /результат\w*|прототип\w*|сервис\w*|систем\w*|продукт\w*/i, denied: /(?:результат|продукт)\w*.{0,30}(?:не\s+определ|не\s+понят)|(?:не\s+знаем|не\s+определили).{0,30}(?:результат|что\s+нужно)/i, question: 'Какой конкретный результат вы хотите получить?', confirmation: 'Вы упомянули ожидаемый результат. Что именно должна получить команда в итоге?', context: [{ pattern: /сократ\w*.{0,24}врем\w*|врем\w*.{0,24}обработк\w*|ускор\w*/i, question: 'На сколько нужно сократить время обработки и за какой период?' }] },
  { field: 'success', label: 'Критерии успеха', detect: /%|метрик\w*|критери\w*|измерим\w*|успех\w*/i, denied: /(?:метрик\w*|критери\w*|успех\w*).{0,25}(?:нет|не\s+определ)|(?:не\s+знаем|не\s+определили).{0,25}(?:успех|метрик|критери)/i, question: 'По каким измеримым признакам вы поймёте, что задача решена?', confirmation: 'Вы упомянули критерий или целевое изменение. Какое значение будет считаться успехом?', context: [{ pattern: /сократ\w*|увелич\w*|сниз\w*|ускор\w*/i, question: 'По какой метрике и какому целевому значению вы оцените это изменение?' }] },
  { field: 'constraints', label: 'Ограничения', detect: /срок\w*|недел\w*|огранич\w*|технолог\w*|доступ\w*|бюджет\w*|только\s+/i, denied: /(?:срок\w*|огранич\w*|технолог\w*).{0,25}(?:не\s+определ|пока\s+нет)|(?:нет|не\s+знаем).{0,25}(?:ограничен|срок)/i, question: 'Какие сроки, технологии, доступы или другие ограничения нужно учесть?', confirmation: 'Вы упомянули ограничения или сроки. Какие именно условия должна учитывать команда?', context: [{ pattern: /персональн\w*|пациент\w*|клиентск\w*|данн\w*/i, question: 'Какие ограничения по использованию данных или технологий нужно учесть?' }] },
  { field: 'users', label: 'Пользователи', detect: /клиент\w*|студент\w*|оператор\w*|пользоват\w*|пациент\w*|сотрудник\w*|администратор\w*|покупател\w*/i, denied: /(?:пользоват|клиент|студент|пациент)\w*.{0,25}(?:не\s+определ|пока\s+не\s+знаем)|(?:не\s+знаем|не\s+определили).{0,25}(?:пользоват|клиент|аудитор)/i, question: 'Кто будет пользоваться результатом и какую проблему это решит?', confirmation: 'Вы упомянули пользователей. Кто именно будет работать с результатом?', context: [{ pattern: /обращен\w*/i, question: 'Кто обрабатывает эти обращения и будет пользоваться результатом?' }, { pattern: /студент\w*/i, question: 'Для каких студентов предназначен результат?' }] },
  { field: 'contact', label: 'Контакт со стороны бизнеса', detect: /контакт\w*|@|телефон\w*|связаться|кому\s+писать|пишите/i, denied: /(?:нет|не\s+указан\w*)\s+(?:контакт\w*|телефон\w*|почт\w*)/i, question: 'Кто будет контактным лицом со стороны бизнеса?', confirmation: 'Вы упомянули контакт со стороны бизнеса. Как к этому человеку обращаться?', context: [] },
  { field: 'format', label: 'Формат взаимодействия', detect: /консультац\w*|обратн.{0,12}связ|еженедел\w*|созвон\w*|встреч\w*|формат.{0,20}(?:общен|связ)/i, denied: /(?:формат|обратн\w*\s+связ).{0,25}(?:не\s+определ|пока\s+нет)|(?:нет|не\s+знаем).{0,25}(?:формат|частот)/i, question: 'Какой формат консультаций и обратной связи возможен?', confirmation: 'Вы упомянули взаимодействие. Как часто и в каком формате команда сможет задавать вопросы?', context: [] }
];
const AI_SAFE_QUESTIONS = [
  { field: 'data', text: 'Какие данные, примеры или материалы доступны команде?' },
  { field: 'result', text: 'Какой конкретный результат вы хотите получить?' },
  { field: 'success', text: 'По каким признакам вы поймёте, что задача решена?' }
];
const teams = [
  { id: 1, name: 'Code Nomads', skills: 'React, UX, AI-агенты' }, { id: 2, name: 'DataMinds', skills: 'Python, аналитика, ML' },
  { id: 3, name: 'Pixel Pioneers', skills: 'Product design, frontend' }, { id: 4, name: 'Qadam Tech', skills: 'Backend, интеграции' }, { id: 5, name: 'Future Five', skills: 'EdTech, GenAI' }
];
const seedTasks = [
  { id: 's1', title: 'AI-помощник для обработки обращений', topic: 'Retail', context: 'Операторы интернет-магазина вручную сортируют повторяющиеся обращения клиентов.', data: 'Анонимизированные примеры 200 обращений и категории.', result: 'Прототип классификатора обращений с черновиком ответа.', success: 'Сократить ручную сортировку минимум на 30%.', constraints: 'Срок 4 недели, только обезличенные данные.', users: 'Операторы поддержки и руководитель контакт-центра.', contact: 'Айгерим, product@demo.kz', format: 'Две консультации в неделю.', published: true },
  { id: 's2', title: 'Навигатор практики для студентов', topic: 'EdTech', context: 'Студенты не понимают, какие практические задачи соответствуют их навыкам.', data: 'Каталог задач и профили навыков.', result: 'Каталог с подборкой задач.', success: 'Пользователь находит подходящую задачу за 3 минуты.', constraints: 'MVP только для веба.', users: 'Студенты 2–4 курсов.', contact: 'Айдана, ed@demo.kz', format: 'Еженедельная обратная связь.', published: true },
  { id: 's3', title: 'Панель энергопотребления офиса', topic: 'GovTech', context: 'Администратор не видит пики энергопотребления по этажам.', data: 'CSV со счётчиками по часам.', result: 'Дашборд аномалий и рекомендаций.', success: 'Найти 3 зоны перерасхода.', constraints: 'Без подключения к реальным приборам.', users: 'Facility-менеджер.', contact: '', format: '', published: true },
  { id: 's4', title: 'Подбор консультации для пациентов', topic: 'HealthTech', context: 'Клиника хочет быстрее направлять запросы к подходящему специалисту.', data: 'Обезличенный перечень услуг.', result: 'Форма первичной навигации.', success: 'Снизить число ошибочных записей.', constraints: 'Не ставить диагнозы.', users: 'Новые пациенты клиники.', contact: 'Нурлан, clinic@demo.kz', format: 'Созвон раз в неделю.', published: true },
  { id: 's5', title: 'Прогноз кассовых разрывов', topic: 'FinTech', context: 'Малому бизнесу сложно планировать обязательные платежи.', data: 'Синтетические транзакции за 12 месяцев.', result: 'Календарь рисков и подсказки.', success: 'Предупреждать за 14 дней.', constraints: 'Только синтетические данные.', users: 'Финансовый менеджер малого бизнеса.', contact: 'Дана, finance@demo.kz', format: 'Демо по пятницам.', published: true }
];
const seedResponses = [
  { id: 'r1', taskId: 's1', teamId: 2, idea: 'Классифицируем обращения и показываем оператору черновик маршрутизации.', plan: 'Неделя 1: данные; неделя 2: прототип; неделя 3: тест.', link: 'https://github.com/dataminds/support-ai', status: 'pending' },
  { id: 'r2', taskId: 's2', teamId: 5, idea: 'Сопоставление навыков команды с задачами каталога.', plan: 'MVP за 10 дней, затем usability-тест.', link: 'https://github.com/futurefive/navigator', status: 'pending' },
  { id: 'r3', taskId: 's3', teamId: 4, idea: 'Дашборд временных рядов с аномалиями.', plan: 'Прототип за 2 недели.', link: 'https://github.com/qadam/energy', status: 'pending' },
  { id: 'r4', taskId: 's4', teamId: 1, idea: 'Безопасная форма-навигатор по типу запроса.', plan: 'MVP за 7 дней.', link: 'https://github.com/codenomads/clinic', status: 'pending' },
  { id: 'r5', taskId: 's5', teamId: 2, idea: 'Календарь платежей с ранними предупреждениями.', plan: 'Аналитический прототип за 2 недели.', link: 'https://github.com/dataminds/cashflow', status: 'pending' }
];
function isSafeId(value){ return typeof value==='string'&&/^[a-z0-9_-]{1,64}$/i.test(value); }
function isStoredTask(value){ return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&isSafeId(value.id)&&typeof value.title==='string'&&typeof value.topic==='string'&&typeof value.published==='boolean'&&['context','data','result','success','constraints','users','contact','format'].every(key=>typeof value[key]==='string')); }
function isStoredResponse(value){ return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&isSafeId(value.id)&&isSafeId(value.taskId)&&teams.some(team=>team.id===value.teamId)&&typeof value.idea==='string'&&typeof value.plan==='string'&&typeof value.link==='string'&&['pending','selected','rejected'].includes(value.status)); }
function loadStored(key,fallback,validate){ try { const value=JSON.parse(localStorage.getItem(key)||'null'); return Array.isArray(value)&&value.every(validate)?value:fallback; } catch { return fallback; } }
let tasks = loadStored('sanamatch_tasks', seedTasks, isStoredTask).map(task=>({...task}));
let responses = loadStored('sanamatch_responses', seedResponses, isStoredResponse).map(response=>({...response}));
let currentTask = null;
let selectedTaskId = null;
let chatQuestions = [];
let chatIndex = 0;
const $ = id => document.getElementById(id);
const fields = ['title','context','users','data','constraints','result','success','contact','format'];

function restoreStoredValue(key,value){ try { if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value); } catch {} }
function save(){
  let previousTasks,previousResponses;
  try {
    previousTasks=localStorage.getItem('sanamatch_tasks'); previousResponses=localStorage.getItem('sanamatch_responses');
    localStorage.setItem('sanamatch_tasks',JSON.stringify(tasks)); localStorage.setItem('sanamatch_responses',JSON.stringify(responses));
    return true;
  } catch {
    if(previousTasks!==undefined&&previousResponses!==undefined){restoreStoredValue('sanamatch_tasks',previousTasks);restoreStoredValue('sanamatch_responses',previousResponses);}
    showToast('Браузер не сохранил изменения. Проверьте доступ к хранилищу и попробуйте снова.');
    return false;
  }
}
function clearStoredState(){
  let previousTasks,previousResponses;
  try {
    previousTasks=localStorage.getItem('sanamatch_tasks'); previousResponses=localStorage.getItem('sanamatch_responses');
    localStorage.removeItem('sanamatch_tasks'); localStorage.removeItem('sanamatch_responses');
    return true;
  } catch {
    if(previousTasks!==undefined&&previousResponses!==undefined){restoreStoredValue('sanamatch_tasks',previousTasks);restoreStoredValue('sanamatch_responses',previousResponses);}
    showToast('Не удалось очистить сохранённые демо-данные. Попробуйте ещё раз.');
    return false;
  }
}
function readyLevel(score){ return score < 40 ? ['Черновик','draft'] : score < 70 ? ['Рабочая','working'] : score < 90 ? ['Готовая','ready'] : ['Приоритетная','priority']; }
function has(text){ return Boolean(String(text || '').trim()); }
function getScore(card){ const items = { context: has(card.context), data: has(card.data), result: has(card.result), success: has(card.success), constraints: has(card.constraints), users: has(card.users), contactFormat: has(card.contact) && has(card.format) }; return Object.entries(items).reduce((sum,[key,full]) => sum + (full ? weights[key] : 0), 0); }
function showToast(text){ $('toast').textContent=text; $('toast').classList.remove('hidden'); setTimeout(()=>$('toast').classList.add('hidden'),3200); }
function addChatMessage(role,text){ const message=document.createElement('div'); message.className='chat-message '+role; message.textContent=String(text); $('chatMessages').appendChild(message); $('chatMessages').scrollTop=$('chatMessages').scrollHeight; }
function unicodeTest(pattern,text){ const flags=pattern.flags.includes('u')?pattern.flags:pattern.flags+'u'; return new RegExp(pattern.source.replace(/\\w/g,'[\\p{L}\\p{N}_]'),flags).test(text); }
function fieldIsMentioned(lower,rule){ return unicodeTest(rule.detect,lower) && !(rule.denied && unicodeTest(rule.denied,lower)); }
function questionForField(rule,draft,mentioned){
  if(mentioned) return rule.confirmation;
  const lower=draft.toLowerCase();
  const contextual=(rule.context||[]).find(item=>unicodeTest(item.pattern,lower));
  return contextual ? contextual.question : rule.question;
}
function safeFallbackResult(){
  return { status:'fallback', mode:'safe_fallback', error_code:'local_analysis_error', missing_fields:[], mentioned_fields:[], questions:AI_SAFE_QUESTIONS.map(item=>({...item})) };
}
function analyzeAgent(input){
  if(!input || typeof input!=='object' || Array.isArray(input) || typeof input.draft!=='string') return {status:'invalid_input',mode:'local_rules',error_code:'draft_must_be_text',missing_fields:[],mentioned_fields:[],questions:[]};
  const draft=input.draft.trim();
  if(!draft) return {status:'invalid_input',mode:'local_rules',error_code:'draft_required',missing_fields:[],mentioned_fields:[],questions:[]};
  try {
    const lower=draft.toLowerCase();
    const mentioned=AI_FIELD_RULES.filter(rule=>fieldIsMentioned(lower,rule));
    const missing=AI_FIELD_RULES.filter(rule=>!mentioned.includes(rule));
    const selected=[...missing,...mentioned].slice(0,3);
    if(selected.length!==3) return safeFallbackResult();
    return {status:'ok',mode:'local_rules',missing_fields:missing.map(rule=>rule.field),mentioned_fields:mentioned.map(rule=>rule.field),questions:selected.map(rule=>({field:rule.field,text:questionForField(rule,draft,mentioned.includes(rule))}))};
  } catch {
    return safeFallbackResult();
  }
}
function applyAgentAnswer(task,field,rawAnswer){
  if(!task || !AI_FIELD_RULES.some(rule=>rule.field===field) || typeof rawAnswer!=='string' || !rawAnswer.trim()) return {status:'invalid_input',error_code:'answer_and_known_field_required'};
  const value=rawAnswer.trim(); task[field]=value;
  return {status:'ok',card_update:{field,value}};
}
window.SanaMatchAI=Object.freeze({analyze:analyzeAgent,applyAnswer:applyAgentAnswer});
function askNextQuestion(){
  if(chatIndex>=chatQuestions.length){ addChatMessage('bot','Спасибо! Ответы сохранены в соответствующие поля черновика. Проверьте карточку и отредактируйте любые детали перед публикацией.'); $('chatInput').disabled=true; $('sendChatButton').disabled=true; $('buildCardButton').classList.remove('hidden'); return; }
  addChatMessage('bot',chatQuestions[chatIndex].text);
}
function sendChatMessage(){
  const answer=$('chatInput').value.trim();
  if(!answer){showToast('Введите ответ для чат-бота.');return;}
  const question=chatQuestions[chatIndex];
  const result=window.SanaMatchAI.applyAnswer(currentTask,question&&question.field,answer);
  if(result.status!=='ok'){showToast('Не удалось сохранить ответ. Перезапустите диалог и попробуйте снова.');return;}
  addChatMessage('user',result.card_update.value); $('chatInput').value=''; chatIndex+=1; askNextQuestion();
}
function analyzeDraft(){
  const draft=$('draftText').value.trim();
  if(!draft){showToast('Сначала добавьте короткое описание задачи.');return;}
  const analysis=window.SanaMatchAI.analyze({draft});
  if(analysis.status==='invalid_input'){showToast('Не удалось прочитать черновик. Проверьте текст и попробуйте снова.');return;}
  chatQuestions=analysis.questions; chatIndex=0; $('chatMessages').innerHTML=''; $('chatInput').value=''; $('chatInput').disabled=false; $('sendChatButton').disabled=false; $('buildCardButton').classList.add('hidden');
  $('aiEmpty').classList.add('hidden'); $('questionsBox').classList.remove('hidden');
  currentTask={id:'t'+Date.now(),title:'',topic:$('draftTopic').value,context:draft,users:'',data:'',constraints:'',result:'',success:'',contact:'',format:'',company:$('company').value,analysis:{mode:analysis.mode,status:analysis.status,missing_fields:analysis.missing_fields,mentioned_fields:analysis.mentioned_fields,questions:analysis.questions},published:false};
  if(analysis.status==='fallback') addChatMessage('bot','Локальный анализ не сработал. Я использую безопасные общие вопросы и не буду заполнять поля догадками.');
  else addChatMessage('bot','Я проверил черновик по локальным правилам заполненности. Сначала уточню поля, о которых пока нет явного упоминания.');
  askNextQuestion();
}
function loadDemo(){
  $('draftText').value='Интернет-магазин получает много однотипных обращений, и операторы вручную распределяют их между отделами. Хотим сократить время обработки.';
  $('draftTopic').value='Retail';
  $('company').value='Qadam Store';
  $('builder').scrollIntoView({behavior:'smooth'});
  analyzeDraft();
  showToast('Загружен короткий черновик для обязательного демо-сценария.');
}
function resetDemo(){
  if(!clearStoredState())return;
  tasks=seedTasks.map(task=>({...task}));
  responses=seedResponses.map(response=>({...response}));
  currentTask=null; selectedTaskId=null;
  $('draftText').value=''; $('draftTopic').value='Retail'; $('company').value=''; $('questionsBox').classList.add('hidden'); $('aiEmpty').classList.remove('hidden'); $('chatMessages').innerHTML=''; chatQuestions=[]; chatIndex=0;
  $('chatInput').value=''; $('chatInput').disabled=false; $('sendChatButton').disabled=false; $('buildCardButton').classList.add('hidden');
  $('proposalIdea').value=''; $('proposalPlan').value=''; $('prototypeLink').value='https://github.com/team/solution'; $('teamSelect').selectedIndex=0;
  $('cardSection').classList.add('hidden'); $('proposalSection').classList.add('hidden'); $('topicFilter').value='all'; $('readinessFilter').value='all';
  renderCatalog(); showToast('Демо-данные восстановлены.');
}
function populateCard(){ if(!currentTask) return; $('cardSection').classList.remove('hidden'); fields.forEach(key=>$(key).value=currentTask[key]||''); if(!$('title').value) $('title').value = `${$('company').value || 'Новая'}: бизнес-задача`; updateCard(); $('cardSection').scrollIntoView({behavior:'smooth'}); }
function collectCard(){ if(!currentTask) return null; fields.forEach(key=>currentTask[key]=$(key).value.trim()); return currentTask; }
function updateCard(){ const card=collectCard(); if(!card)return; const score=getScore(card); const [level,cls]=readyLevel(score); $('score').textContent=score; $('compactScore').textContent=score+'/100'; $('progressBar').style.width=score+'%'; $('readiness').textContent=level; $('draftBadge').textContent=level; $('draftBadge').className='badge '+cls;
  const items={context:has(card.context),data:has(card.data),result:has(card.result),success:has(card.success),constraints:has(card.constraints),users:has(card.users),contactFormat:has(card.contact)&&has(card.format)};
  $('scoreBreakdown').innerHTML=Object.keys(weights).map(key=>`<div class="breakdown-row"><span>${labels[key]}</span><strong>${items[key]?weights[key]:0}/${weights[key]}</strong></div>`).join('');
  const missing=Object.keys(items).filter(key=>!items[key]); $('missingList').innerHTML=missing.length?missing.map(key=>`<li>Добавьте: ${labels[key].toLowerCase()}</li>`).join(''):'<li>Карточка полностью готова к работе.</li>';
}
function publish(){ const card=collectCard(); if(!card)return; const required=['title','context','result']; if(required.some(k=>!has(card[k]))){showToast('Для публикации заполните название, контекст и ожидаемый результат.');return;} const publishedCard={...card,published:true,score:getScore(card)},previousTasks=tasks; tasks=tasks.slice(); const index=tasks.findIndex(t=>t.id===card.id); if(index>=0)tasks[index]=publishedCard;else tasks.push(publishedCard); if(!save()){tasks=previousTasks;return;} renderCatalog(); showToast(`Задача опубликована. Рейтинг: ${publishedCard.score}/100.`); $('catalog').scrollIntoView({behavior:'smooth'}); }
function renderCatalog(){ const topic=$('topicFilter').value, filter=$('readinessFilter').value; const filtered=tasks.map(t=>({...t,score:getScore(t)})).filter(t=>t.published).filter(t=>topic==='all'||t.topic===topic).filter(t=>filter==='all'||(filter==='working'?t.score>=40:t.score>=70)).sort((a,b)=>b.score-a.score); $('catalogGrid').innerHTML=filtered.map(t=>{const [level,cls]=readyLevel(t.score);return `<article class="task-tile"><div class="tile-meta"><span class="topic">${escapeHtml(t.topic)}</span><span class="score-pill">${t.score}/100</span></div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.context)}</p><p class="selected-state">${level}</p><button class="button secondary" onclick="openProposal('${t.id}')">Откликнуться →</button></article>`}).join('') || '<p>Нет задач с такими фильтрами.</p>'; renderResponses(); }
function openProposal(id){ selectedTaskId=id; const task=tasks.find(t=>t.id===id); $('proposalSection').classList.remove('hidden'); $('proposalFor').textContent=`Отклик на задачу: ${task.title}`; $('proposalSection').scrollIntoView({behavior:'smooth'}); }
function sendProposal(){ const idea=$('proposalIdea').value.trim(),plan=$('proposalPlan').value.trim(),link=$('prototypeLink').value.trim(),teamId=Number($('teamSelect').value);if(!selectedTaskId){showToast('Сначала выберите задачу в каталоге.');return}if(!idea||!plan){showToast('Опишите идею решения и план.');return}if(!/^https?:\/\/\S+$/i.test(link)){showToast('Добавьте корректную ссылку на прототип, начинающуюся с https://.');return}if(responses.some(r=>r.taskId===selectedTaskId&&r.teamId===teamId)){showToast('Эта команда уже отправила предложение по выбранной задаче.');return} const previousResponses=responses; responses=[{id:'r'+Date.now(),taskId:selectedTaskId,teamId,idea,plan,link,status:'pending'},...responses]; if(!save()){responses=previousResponses;return;} $('proposalIdea').value='';$('proposalPlan').value='';showToast('Предложение отправлено бизнесу.');renderResponses();$('responses').scrollIntoView({behavior:'smooth'}); }
function renderResponses(){ $('responsesList').innerHTML=responses.map(r=>{const task=tasks.find(t=>t.id===r.taskId)||{};const team=teams.find(t=>t.id===r.teamId)||{};let action=r.status==='pending'?`<button class="small-btn pick" onclick="setResponse('${r.id}','selected')">Выбрать</button><button class="small-btn reject" onclick="setResponse('${r.id}','rejected')">Отклонить</button>`:`<span class="selected-state">${r.status==='selected'?'✓ Команда выбрана · +100 progress points':'Отклонено'}</span>`;return `<article class="response"><div><span class="topic">${escapeHtml(task.title||'Удалённая задача')}</span><h3>${escapeHtml(team.name||'Команда')}</h3><p><b>Идея:</b> ${escapeHtml(r.idea)}</p><p><b>План:</b> ${escapeHtml(r.plan)}</p><p><b>Прототип:</b> ${escapeHtml(r.link)}</p></div><div class="response-actions">${action}</div></article>`}).join(''); renderLeaderboard(); }
function renderLeaderboard(){ const points=teams.map(team=>({ ...team, points:responses.filter(r=>r.teamId===team.id&&r.status==='selected').length*100 })).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name)); $('leaderboardList').innerHTML=points.map((team,index)=>`<div class="leaderboard-row"><span>${index+1}</span><strong>${escapeHtml(team.name)}</strong><b>${team.points} pts</b></div>`).join(''); }
function setResponse(id,status){const r=responses.find(x=>x.id===id);if(!r||r.status!=='pending'||!['selected','rejected'].includes(status))return;if(status==='selected'&&responses.some(x=>x.taskId===r.taskId&&x.status==='selected'&&x.id!==id)){showToast('Для этой задачи уже выбрана команда.');return}const previousResponses=responses;responses=responses.map(x=>x.id===id?{...x,status}:x);if(!save()){responses=previousResponses;return;}renderResponses();showToast(status==='selected'?'Команда выбрана вручную. Ей начислены 100 баллов прогресса.':'Отклик отклонён.');}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value||'';return d.innerHTML;}

window.openProposal=openProposal; window.setResponse=setResponse;
$('analyzeButton').addEventListener('click',analyzeDraft); $('sendChatButton').addEventListener('click',sendChatMessage); $('chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sendChatMessage();}}); $('buildCardButton').addEventListener('click',populateCard); $('publishButton').addEventListener('click',publish); $('sendProposal').addEventListener('click',sendProposal); $('loadDemoButton').addEventListener('click',loadDemo); $('resetDemoButton').addEventListener('click',resetDemo); fields.forEach(key=>$(key).addEventListener('input',updateCard)); $('topicFilter').addEventListener('change',renderCatalog); $('readinessFilter').addEventListener('change',renderCatalog);
$('teamSelect').innerHTML=teams.map(t=>`<option value="${t.id}">${t.name} — ${t.skills}</option>`).join(''); renderCatalog();
