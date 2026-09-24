# SanaMatch frontend handoff

Integration update (2026-09-23): Lead verified the real SQLite backend and local AI module in a browser; see `integration-qa.md`. Requests now send a bounded recent history (20 messages / 24,000 characters), while the full conversation remains visible in the page. Nested errors, publication concurrency, safe undo after manual edits, and API-mode new drafts are covered by additional UI tests. The verification section below records the original frontend delivery.

## Scope

Vanilla HTML, CSS, and JavaScript frontend. The backend contract is consumed through `ui/api-client.js`; local test behavior is isolated in `ui/demo-adapter.js`. No server or AI implementation is included here.

## User flow

1. Start with a draft and open a conversation. The card is editable from the beginning.
2. Desktop displays conversation and card side by side. At widths up to 820 px, use the `Диалог` and `Карточка` tabs.
3. Chat accepts unlimited messages. Enter sends; Shift+Enter adds a line. While a request is pending, the send action is disabled. A failed request keeps the entered text and offers retry.
4. The client sends `requestId`, `cardVersion`, draft, current card, history, and `language: "ru"`. It ignores a response if request ID/version no longer match the current request/card.
5. `updates` and `suggestions` become separate pending items. Neither changes the card until `Применить`; each can be rejected. Existing and proposed values are displayed. A manual edit is visibly flagged before explicit application. The latest application can be undone.
6. Publish opens an in-app confirmation dialog. Published tasks appear in the catalog. `Подробнее` loads the full task in API mode and shows all detail fields, with empty fields rendered as `Не указано`. The detail view can lead to the response form.
7. A business user manually selects or rejects responses; selection updates the progress board.

## API client

`ui/api-client.js` implements the supplied endpoints:

- `GET /api/health`
- `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`
- `GET /api/teams`
- `GET /api/responses`, `POST /api/responses`, `PATCH /api/responses/:id`
- `POST /api/ai/chat`

Task create/update payload omits `id`; the server response supplies it. Response create sends `{taskId, teamId, idea, plan, link}`. Response decisions send `{status: "selected" | "rejected"}`.

The server and site are expected on one origin. A successful health request selects API mode. If health is unavailable, the interface switches to the explicitly labelled local demo adapter. Once API mode is selected, a failed write reports an error and does not write to local storage.

## Demo data

The local adapter uses only `sanamatch_demo_v2_tasks` and `sanamatch_demo_v2_responses`. It does not read, migrate, overwrite, or delete legacy `sanamatch_tasks` / `sanamatch_responses`. Its chat results are fixed test fixtures labeled as local test responses; they do not represent a connected AI model.

## Verification performed

- `node --check app.js`, `node --check ui/api-client.js`, `node --check ui/demo-adapter.js`.
- Browser checked at 320, 390, 820, and 1440 px. `document.documentElement.scrollWidth` matched viewport width at every size.
- Local demo: loaded draft, confirmed facts are not applied automatically, continued past three user answers, applied and rejected proposal items, tested manual field warning and undo, and checked Enter / Shift+Enter.
- Temporary local API fixture: exercised health/data load, first chat request returning 503, retry, full task detail GET, low-rating catalog visibility, response POST and manual status PATCH, plus task publish confirmation and POST.
- Browser console error/warning log was empty during the API interaction run.

The API fixture used for this verification was temporary and is not part of the repository. Live backend behavior still needs verification after Lead provides a running server and final response samples.
