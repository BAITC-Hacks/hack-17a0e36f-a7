INTEGRATION UPDATE (2026-09-23): Lead completed real-browser integration with this backend. Nested API errors are now displayed correctly; the API-mode button starts a new draft without deleting server data. There is no server reset panel. See `integration-qa.md` for final checks. The handoff below records the backend delivery before integration.

STATUS:
Implemented a Python 3.9+ standard-library HTTP server backed by SQLite. It serves the approved local frontend assets and provides task, team, response, health, and AI proxy routes. The frontend currently calls the same-origin API when its health check succeeds and falls back to the browser demo adapter when the server is unavailable.

FILES:
- `server/main.py` — HTTP routes, SQLite schema and one-time seed, validation, readiness scoring, AI configuration/proxy boundary, and static-file allowlist.
- `server/tests/test_main.py` — API tests using temporary project roots, temporary SQLite databases, and ephemeral loopback ports.
- `.env.example` — environment variable names with empty placeholders only.
- `.gitignore` — preserves `.playwright-cli/` and `output/`, and excludes `.env`, Python caches, and SQLite artifacts.
- `docs/backend-handoff.md` — this handoff.

RUN COMMAND:
From the `SanaMatch` directory:

```bash
python3 server/main.py --port 4174
```

The default bind address is `127.0.0.1`. The database is created at `server/data/sanamatch.sqlite3`; `SANAMATCH_DB_PATH` in `.env` can override it. The server does not bind to or modify port `4173`.

API:
All API responses are JSON. Errors use `{ "error": { "code": "...", "message": "..." } }`.

- `GET /api/health` — reports status, SQLite storage, and whether provider, key, and model settings are configured.
- `GET /api/tasks` and `GET /api/tasks/:id` — list or fetch tasks.
- `POST /api/tasks` — creates a draft or published task. The server generates an ID if omitted and computes `score`; a supplied score is ignored.
- `PATCH /api/tasks/:id` — edits task fields. A published task requires nonempty `title`, `context`, and `result`; low readiness does not block publication. The ID cannot be changed.
- `GET /api/teams` — returns teams with derived integer `progressPoints`.
- `GET /api/responses` — lists responses.
- `POST /api/responses` — accepts `{ "taskId", "teamId", "idea", "plan", "link" }`; validates IDs, publication, duplicate team/task pairs, nonempty idea/plan, and HTTP(S) links.
- `PATCH /api/responses/:id` — accepts `{ "status": "selected" | "rejected" }`. Decisions are final. SQLite transaction locking and a unique partial index prevent two teams being selected for one task, including concurrent requests. A selected response adds exactly 100 derived progress points.
- `POST /api/ai/chat` — validates the approved request and size limits, loads provider settings only from process environment or `.env`, calls the AI/ML-owned `ai/service.py::respond_turn(payload, config=config)`, and returns the original `requestId` and `cardVersion`. It returns `503 AI_NOT_READY` if the AI module cannot load.

The server computes readiness with weights: context 20, data 20, result 15, success 15, constraints 10, users 10, contact and format together 10. Levels are 0–39 Draft, 40–69 Working, 70–89 Ready, and 90–100 Priority. Demo records are seeded once per database and are not overwritten on later starts.

TEST COMMANDS AND RESULTS:

```bash
python3 -m unittest discover -s server/tests -v
python3 -m unittest discover -s ai -p 'test_service.py' -v
```

Results on 2026-09-23:
- Backend/API suite: 16 tests passed.
- AI/ML-owned service suite: 24 tests passed.

Backend coverage includes task create/read/patch and server-computed rating; one-time seed and persistence; score weights and all level boundaries; invalid/non-standard JSON, unsupported methods, and unknown IDs; duplicate and invalid responses; simultaneous competing selections and non-duplicated points; static allowlisting and blocked `.env`, database, server code, `.git`, README, and traversal paths; AI-not-ready behavior, stub contract/config handling, local-fallback HTTP integration; and request/history size limits. The static allowlist includes the frontend API client and demo adapter scripts.

Tests use temporary directories and databases, and bind only ephemeral loopback ports. The AI integration test uses empty provider configuration and exercises local fallback without a paid or external request. Tests do not touch a working database or bind port `4173`.

AI INTEGRATION:
The backend dynamically loads the AI/ML-owned `ai/service.py` and passes the approved payload with `provider`, `api_key`, `model`, `base_url`, and `timeout_seconds`. Prompting and fallback behavior remain owned by the AI module. Configure `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL`; `AI_BASE_URL` is optional and `AI_TIMEOUT_SECONDS` defaults to 30 and is capped at 60. Credentials are not returned by health or chat routes, and request bodies are not logged. Limits are 5000 characters for draft text, 20 chat messages/24000 combined history characters, and 64 KiB for the full request body.

LIMITATIONS:
- This is a local demo server without accounts, roles, authentication, or public-deployment hardening.
- If the health check fails, the frontend falls back to its browser demo adapter and localStorage. Existing localStorage data is not migrated into SQLite. In API mode, the reset-demo button explains that resetting is handled through a server panel; no server reset route is defined.
- The UI API client currently looks for a top-level error `message`, while the API contract nests it at `error.message`; users may see a generic HTTP error for API failures. Frontend files are outside backend ownership.
- If the AI/ML-owned `ai/service.py` is absent at runtime, the chat route returns `AI_NOT_READY`.
- SQLite is local to the server host; this does not provide cloud hosting or multi-machine deployment.

NEXT FOR LEAD:
- Ask the frontend owner to update API error parsing to read `payload.error.message` and, where useful, `payload.error.code` without changing the agreed API envelope.
- Confirm the demo reset experience in API mode; the backend currently has no reset route, so any server-side reset needs an agreed contract and ownership decision.
- Keep the AI/ML-owned `ai/service.py` response contract aligned with the proxy; its 24-test suite passes, and the backend integration covers its no-key fallback.
- Review access needs before binding beyond `127.0.0.1`; this demo server is not authenticated.
