(() => {
  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), path === '/api/health' ? 4000 : path === '/api/ai/chat' ? 65000 : 15000);
    try {
      const response = await fetch(path, {
        ...options, signal: controller.signal,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
      });
      let payload = null;
      try { payload = await response.json(); } catch { /* keep a useful HTTP error below */ }
      if (!response.ok) {
        const error = new Error(payload?.error?.message || payload?.message || `Запрос не выполнен (${response.status})`);
        error.status = response.status;
        error.code = payload?.error?.code;
        error.payload = payload;
        throw error;
      }
      if (!payload || typeof payload !== 'object') throw new Error('Сервер вернул некорректный ответ. Повторите запрос.');
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Проверьте состояние данных перед повторной отправкой.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  const body = value => ({ method: 'POST', body: JSON.stringify(value) });
  const patch = value => ({ method: 'PATCH', body: JSON.stringify(value) });

  window.SanaMatchApi = Object.freeze({
    health: async () => {
      const status = await request('/api/health');
      if (status.status !== 'ok') throw new Error('API SanaMatch недоступен.');
      return status;
    },
    getTasks: async () => (await request('/api/tasks')).tasks,
    getTask: async id => (await request(`/api/tasks/${encodeURIComponent(id)}`)).task,
    createTask: async task => (await request('/api/tasks', body(task))).task,
    updateTask: async (id, task) => (await request(`/api/tasks/${encodeURIComponent(id)}`, patch(task))).task,
    getTeams: async () => (await request('/api/teams')).teams,
    getResponses: async () => (await request('/api/responses')).responses,
    createResponse: async response => (await request('/api/responses', body(response))).response,
    updateResponse: async (id, status) => (await request(`/api/responses/${encodeURIComponent(id)}`, patch({ status }))).response,
    confirmProgress: async (id, progressNote) => (await request(`/api/responses/${encodeURIComponent(id)}`, patch({ progressConfirmed: true, progressNote }))).response,
    chat: payload => request('/api/ai/chat', body(payload))
  });
})();
