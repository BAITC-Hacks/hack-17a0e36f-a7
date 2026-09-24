(() => {
  const teams = [
    { id: 1, name: 'CodeNomads', skills: 'AI, UX, web' },
    { id: 2, name: 'DataMinds', skills: 'Data Science, Python' },
    { id: 3, name: 'Qadam Devs', skills: 'Full-stack, mobile' },
    { id: 4, name: 'GreenByte', skills: 'Analytics, ML' },
    { id: 5, name: 'FutureFive', skills: 'Product, frontend' }
  ];
  const tasks = [
    { id: 's1', title: 'Умная маршрутизация обращений', topic: 'Retail', company: 'Qadam Store', context: 'Интернет-магазин получает много однотипных обращений, операторы вручную распределяют их между отделами.', users: 'Операторы поддержки и руководитель контакт-центра', data: 'Обезличенные примеры обращений и категории отделов.', result: 'Прототип подсказки категории и маршрута обращения.', success: 'Сократить среднее время распределения на 20% в тесте.', constraints: 'Не использовать персональные данные. Прототип за 3 недели.', contact: 'Алия, product@qadam.example', format: 'Еженедельная встреча и обратная связь в чате.', published: true },
    { id: 's2', title: 'Навигатор учебных проектов', topic: 'EdTech', company: 'Study Lab', context: 'Студентам сложно найти подходящий проект среди предложений партнёров.', users: 'Студенты старших курсов и координаторы практики', data: 'Тестовые профили навыков и описания проектов.', result: 'Прототип подбора проектов по интересам и навыкам.', success: 'Пять студентов находят релевантный проект за одну сессию.', constraints: 'Только демонстрационные профили.', contact: 'Марат, edu@study.example', format: 'Две консультации в неделю.', published: true },
    { id: 's3', title: 'Раннее обнаружение потерь энергии', topic: 'FinTech', company: 'Green Grid', context: 'Команда эксплуатации поздно замечает отклонения в энергопотреблении.', users: 'Инженеры и аналитики эксплуатации', data: 'Синтетические часовые показания счётчиков.', result: 'Дашборд с аномалиями и объяснением отклонений.', success: 'Показать три сценария отклонений на тестовом наборе.', constraints: 'Без подключения к реальным приборам.', contact: 'Дана, energy@grid.example', format: 'Демо по пятницам.', published: true },
    { id: 's4', title: 'Понятный путь пациента', topic: 'HealthTech', company: 'Clinic North', context: 'Пациентам сложно понять порядок записи и подготовки к приёму.', users: 'Пациенты и администраторы клиники', data: 'Обезличенные инструкции и FAQ клиники.', result: 'Навигационный прототип по типу визита.', success: 'Пять пользователей проходят сценарий без помощи администратора.', constraints: 'Не давать медицинских рекомендаций.', contact: 'Асем, care@clinic.example', format: 'Онлайн-консультация раз в неделю.', published: true },
    { id: 's5', title: 'Планирование платежей малого бизнеса', topic: 'FinTech', company: 'Qadam Finance', context: 'Малому бизнесу сложно заранее увидеть риск нехватки средств.', users: 'Финансовый менеджер малого бизнеса', data: 'Синтетические транзакции за 12 месяцев.', result: 'Календарь платежей с ранними предупреждениями.', success: 'Показать риск кассового разрыва за 14 дней.', constraints: 'Только синтетические данные.', contact: 'Дана, finance@demo.example', format: 'Демо по пятницам.', published: true }
  ];
  const responses = [
    { id: 'r1', taskId: 's1', teamId: 2, idea: 'Классифицируем обращения и показываем оператору черновик маршрутизации.', plan: 'Неделя 1: данные; неделя 2: прототип; неделя 3: тест.', link: 'https://github.com/dataminds/support-ai', status: 'pending' },
    { id: 'r2', taskId: 's2', teamId: 5, idea: 'Сопоставление навыков команды с задачами каталога.', plan: 'MVP за 10 дней, затем usability-тест.', link: 'https://github.com/futurefive/navigator', status: 'pending' },
    { id: 'r3', taskId: 's3', teamId: 4, idea: 'Дашборд временных рядов с аномалиями.', plan: 'Прототип за 2 недели.', link: 'https://example.com/demo-energy', status: 'pending' },
    { id: 'r4', taskId: 's4', teamId: 3, idea: 'Навигатор записи по инструкции клиники.', plan: 'Прототип и проверка сценария за неделю.', link: 'https://example.com/demo-clinic', status: 'pending' },
    { id: 'r5', taskId: 's5', teamId: 1, idea: 'Календарь платежей на синтетических данных.', plan: 'Анализ данных, календарь, тест за две недели.', link: 'https://example.com/demo-finance', status: 'pending' }
  ];
  const keys = { tasks: 'sanamatch_demo_v2_tasks', responses: 'sanamatch_demo_v2_responses' };
  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) && value.every(item => item && typeof item === 'object' && typeof item.id === 'string') ? value : structuredClone(fallback);
    }
    catch { return structuredClone(fallback); }
  };
  const persist = (nextTasks, nextResponses) => {
    try {
      localStorage.setItem(keys.tasks, JSON.stringify(nextTasks));
      localStorage.setItem(keys.responses, JSON.stringify(nextResponses));
      return true;
    } catch (error) { throw new Error('Браузер не сохранил демо-изменения. Проверьте место в хранилище и повторите действие.'); }
  };
  const fixtureQuestions = [
    ['users', 'Кто будет пользоваться результатом задачи?'],
    ['data', 'Какие данные или материалы доступны команде?'],
    ['result', 'Какой конкретный результат должна показать команда?'],
    ['success', 'По какому измеримому признаку вы оцените успех?'],
    ['constraints', 'Какие сроки или ограничения нужно учесть?'],
    ['contact', 'К кому команда сможет обратиться с вопросами?'],
    ['format', 'Как часто и в каком формате удобно общаться?']
  ];
  window.SanaMatchDemo = Object.freeze({
    mode: 'demo', teams,
    load: () => ({ tasks: read(keys.tasks, tasks), responses: read(keys.responses, responses) }),
    save: persist,
    reset: () => persist(tasks, responses),
    async chat(payload) {
      await new Promise(resolve => setTimeout(resolve, 240));
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const userAnswers = messages.filter(message => message.role === 'user');
      const requestId = payload.requestId;
      const cardVersion = payload.cardVersion;
      const updates = [];
      let reply;
      if (!userAnswers.length && payload.draft) {
        if (!payload.card.context) updates.push({ field: 'context', value: payload.draft, evidence: 'Извлечено из черновика (тестовый ответ демо).' });
        reply = `Черновик принят. ${fixtureQuestions[0][1]}`;
      } else {
        const lastQuestion = messages.filter(message => message.role === 'assistant').at(-1)?.content || '';
        const questionIndex = fixtureQuestions.findIndex(([, question]) => lastQuestion.includes(question));
        const answer = String(userAnswers.at(-1)?.content || '').trim();
        if (answer && questionIndex >= 0) updates.push({ field: fixtureQuestions[questionIndex][0], value: answer, evidence: `Текст вашего ответа: «${answer.slice(0, 180)}» (тестовый ответ демо).` });
        reply = `Принял ответ. ${questionIndex + 1 < fixtureQuestions.length ? fixtureQuestions[questionIndex + 1][1] : 'Что ещё важно добавить к задаче?'}`;
      }
      const canSuggest = userAnswers.length > 0;
      return {
        requestId, cardVersion, mode: 'fallback',
        reply: `${reply} Это фиксированный тестовый ответ локального демо, не подключённая AI-модель.`,
        updates,
        suggestions: canSuggest ? [{ field: 'format', value: 'Согласовать удобный формат и регулярность связи с бизнесом', reason: 'Тестовый пример предложения. Замените своими условиями, если они отличаются.' }] : [],
        missingFields: fixtureQuestions.map(([field]) => field).filter(field => !payload.card?.[field]),
        issues: []
      };
    }
  });
})();
