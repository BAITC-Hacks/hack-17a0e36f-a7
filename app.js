const weights = { context: 20, data: 20, result: 15, success: 15, constraints: 10, users: 10, contactFormat: 10 };
const labels = { context: 'Контекст и потребность', data: 'Данные и материалы', result: 'Ожидаемый результат', success: 'Критерии успеха', constraints: 'Ограничения', users: 'Пользователи', contactFormat: 'Связь с бизнесом' };
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
let tasks = JSON.parse(localStorage.getItem('sanamatch_tasks') || 'null') || seedTasks;
let responses = JSON.parse(localStorage.getItem('sanamatch_responses') || 'null') || seedResponses;
let currentTask = null;
let selectedTaskId = null;
const $ = id => document.getElementById(id);
const fields = ['title','context','users','data','constraints','result','success','contact','format'];

function save(){ localStorage.setItem('sanamatch_tasks', JSON.stringify(tasks)); localStorage.setItem('sanamatch_responses', JSON.stringify(responses)); }
function readyLevel(score){ return score < 40 ? ['Черновик','draft'] : score < 70 ? ['Рабочая','working'] : score < 90 ? ['Готовая','ready'] : ['Приоритетная','priority']; }
function has(text){ return Boolean(String(text || '').trim()); }
function getScore(card){ const items = { context: has(card.context), data: has(card.data), result: has(card.result), success: has(card.success), constraints: has(card.constraints), users: has(card.users), contactFormat: has(card.contact) && has(card.format) }; return Object.entries(items).reduce((sum,[key,full]) => sum + (full ? weights[key] : 0), 0); }
function showToast(text){ $('toast').textContent=text; $('toast').classList.remove('hidden'); setTimeout(()=>$('toast').classList.add('hidden'),3200); }

function analyzeDraft(){
  const draft = $('draftText').value.trim();
  if(!draft){ showToast('Сначала добавьте короткое описание задачи.'); return; }
  const lower=draft.toLowerCase();
  const map = [
    ['data','Какие данные, примеры или материалы доступны команде?'], ['result','Какой конкретный результат вы хотите получить от команды?'], ['success','По каким измеримым признакам вы поймёте, что задача решена?'], ['constraints','Какие сроки, технологии, доступы или ограничения нужно учесть?'], ['users','Кто будет пользоваться результатом и какую проблему это решит?'], ['contact','Кто будет контактным лицом со стороны бизнеса?'], ['format','Какой формат консультаций и обратной связи возможен?']
  ];
  const detected = { data: /данн|csv|таблиц|пример/.test(lower), result: /результат|прототип|сервис|систем/.test(lower), success: /%|метрик|сократ|увелич/.test(lower), constraints: /срок|недел|огранич|только/.test(lower), users: /клиент|студент|оператор|пользоват/.test(lower) };
  const questions = map.filter(([key])=>!detected[key]).slice(0,4); while(questions.length<3) questions.push(map[questions.length]);
  $('questions').innerHTML=questions.map((q,i)=>`<div class="question"><b>${i+1}</b>${q[1]}</div>`).join('');
  $('aiEmpty').classList.add('hidden'); $('questionsBox').classList.remove('hidden');
  currentTask = { id: 't'+Date.now(), title:'', topic:$('draftTopic').value, context:draft, users:'', data:'', constraints:'', result:'', success:'', contact:'', format:'', company:$('company').value, published:false };
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
  localStorage.removeItem('sanamatch_tasks');
  localStorage.removeItem('sanamatch_responses');
  tasks=seedTasks.map(task=>({...task}));
  responses=seedResponses.map(response=>({...response}));
  currentTask=null; selectedTaskId=null;
  $('draftText').value=''; $('company').value=''; $('questionsBox').classList.add('hidden'); $('aiEmpty').classList.remove('hidden');
  $('cardSection').classList.add('hidden'); $('proposalSection').classList.add('hidden');
  renderCatalog(); showToast('Демо-данные восстановлены.');
}
function populateCard(){ if(!currentTask) return; $('cardSection').classList.remove('hidden'); fields.forEach(key=>$(key).value=currentTask[key]||''); if(!$('title').value) $('title').value = `${$('company').value || 'Новая'}: бизнес-задача`; updateCard(); $('cardSection').scrollIntoView({behavior:'smooth'}); }
function collectCard(){ if(!currentTask) return null; fields.forEach(key=>currentTask[key]=$(key).value.trim()); return currentTask; }
function updateCard(){ const card=collectCard(); if(!card)return; const score=getScore(card); const [level,cls]=readyLevel(score); $('score').textContent=score; $('progressBar').style.width=score+'%'; $('readiness').textContent=level; $('draftBadge').textContent=level; $('draftBadge').className='badge '+cls;
  const items={context:has(card.context),data:has(card.data),result:has(card.result),success:has(card.success),constraints:has(card.constraints),users:has(card.users),contactFormat:has(card.contact)&&has(card.format)};
  $('scoreBreakdown').innerHTML=Object.keys(weights).map(key=>`<div class="breakdown-row"><span>${labels[key]}</span><strong>${items[key]?weights[key]:0}/${weights[key]}</strong></div>`).join('');
  const missing=Object.keys(items).filter(key=>!items[key]); $('missingList').innerHTML=missing.length?missing.map(key=>`<li>Добавьте: ${labels[key].toLowerCase()}</li>`).join(''):'<li>Карточка полностью готова к работе.</li>';
}
function publish(){ const card=collectCard(); if(!card)return; const required=['title','context','result']; if(required.some(k=>!has(card[k]))){showToast('Для публикации заполните название, контекст и ожидаемый результат.');return;} card.published=true; card.score=getScore(card); const index=tasks.findIndex(t=>t.id===card.id); if(index>=0)tasks[index]=card;else tasks.push(card); save(); renderCatalog(); showToast(`Задача опубликована. Рейтинг: ${card.score}/100.`); $('catalog').scrollIntoView({behavior:'smooth'}); }
function renderCatalog(){ const topic=$('topicFilter').value, filter=$('readinessFilter').value; const filtered=tasks.map(t=>({...t,score:getScore(t)})).filter(t=>t.published).filter(t=>topic==='all'||t.topic===topic).filter(t=>filter==='all'||(filter==='working'?t.score>=40:t.score>=70)).sort((a,b)=>b.score-a.score); $('catalogGrid').innerHTML=filtered.map(t=>{const [level,cls]=readyLevel(t.score);return `<article class="task-tile"><div class="tile-meta"><span class="topic">${t.topic}</span><span class="score-pill">${t.score}/100</span></div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.context)}</p><p class="selected-state">${level}</p><button class="button secondary" onclick="openProposal('${t.id}')">Откликнуться →</button></article>`}).join('') || '<p>Нет задач с такими фильтрами.</p>'; renderResponses(); }
function openProposal(id){ selectedTaskId=id; const task=tasks.find(t=>t.id===id); $('proposalSection').classList.remove('hidden'); $('proposalFor').textContent=`Отклик на задачу: ${task.title}`; $('proposalSection').scrollIntoView({behavior:'smooth'}); }
function sendProposal(){ const idea=$('proposalIdea').value.trim(),plan=$('proposalPlan').value.trim();if(!selectedTaskId){showToast('Сначала выберите задачу в каталоге.');return}if(!idea||!plan){showToast('Опишите идею решения и план.');return} responses.unshift({id:'r'+Date.now(),taskId:selectedTaskId,teamId:Number($('teamSelect').value),idea,plan,link:$('prototypeLink').value.trim(),status:'pending'});save();$('proposalIdea').value='';$('proposalPlan').value='';showToast('Предложение отправлено бизнесу.');renderResponses();$('responses').scrollIntoView({behavior:'smooth'}); }
function renderResponses(){ $('responsesList').innerHTML=responses.map(r=>{const task=tasks.find(t=>t.id===r.taskId)||{};const team=teams.find(t=>t.id===r.teamId)||{};let action=r.status==='pending'?`<button class="small-btn pick" onclick="setResponse('${r.id}','selected')">Выбрать</button><button class="small-btn reject" onclick="setResponse('${r.id}','rejected')">Отклонить</button>`:`<span class="selected-state">${r.status==='selected'?'✓ Команда выбрана · +100 progress points':'Отклонено'}</span>`;return `<article class="response"><div><span class="topic">${escapeHtml(task.title||'Удалённая задача')}</span><h3>${escapeHtml(team.name||'Команда')}</h3><p><b>Идея:</b> ${escapeHtml(r.idea)}</p><p><b>План:</b> ${escapeHtml(r.plan)}</p><p><b>Прототип:</b> ${escapeHtml(r.link)}</p></div><div class="response-actions">${action}</div></article>`}).join(''); }
function setResponse(id,status){const r=responses.find(x=>x.id===id);if(!r)return;r.status=status;save();renderResponses();showToast(status==='selected'?'Команда выбрана вручную. Ей начислены баллы прогресса.':'Отклик отклонён.');}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value||'';return d.innerHTML;}

window.openProposal=openProposal; window.setResponse=setResponse;
$('analyzeButton').addEventListener('click',analyzeDraft); $('buildCardButton').addEventListener('click',populateCard); $('publishButton').addEventListener('click',publish); $('sendProposal').addEventListener('click',sendProposal); $('loadDemoButton').addEventListener('click',loadDemo); $('resetDemoButton').addEventListener('click',resetDemo); fields.forEach(key=>$(key).addEventListener('input',updateCard)); $('topicFilter').addEventListener('change',renderCatalog); $('readinessFilter').addEventListener('change',renderCatalog);
$('teamSelect').innerHTML=teams.map(t=>`<option value="${t.id}">${t.name} — ${t.skills}</option>`).join(''); renderCatalog();
