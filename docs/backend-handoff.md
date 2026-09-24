STATUS:
The backend is implemented in Python 3.9+ using only the standard library and SQLite. It provides same-origin API routes and serves only the approved frontend asset allowlist. Lead's integration QA on 2026-09-23 reports the browser-to-HTTP-to-SQLite demo path passing, including persistence across reload and a second browser context. The backend tests now include explicit AI boundary type, limit, exception, and malformed-response coverage.

FILES:
- `server/main.py` — API routes, SQLite schema/seed, validation, readiness calculation, AI configuration/proxy boundary, and static-file allowlist.
- `server/tests/test_main.py` — reproducible backend/API tests on temporary project roots and temporary SQLite databases.
- `docs/backend-handoff.md` — this backend delivery and runtime handoff.

RUN COMMAND:
From the repository root:

```bash
python3 server/main.py --port 4174
```

Open `http://localhost:4174`. The default bind is loopback (`127.0.0.1`). The default database path is `server/data/sanamatch.sqlite3`; `SANAMATCH_DB_PATH` in the local environment or `.env` can override it. Starting the server does not use port `4173`. To stop the foreground server started by this command, press `Ctrl+C` in that terminal. Do not terminate an unrelated process by guessing its PID.

API:
All API responses are JSON; errors use `{ "error": { "code": "...", "message": "..." } }`.

- `GET /api/health` — reports API status, SQLite storage, and `aiConfigured`. `aiConfigured: true` means provider, key, and model settings are present; it does not prove a live LLM call succeeds.
- `GET /api/tasks`, `GET /api/tasks/:id` — list/fetch tasks.
- `POST /api/tasks` — create a draft or published task. The server generates the ID when omitted and computes the score; a supplied score is ignored.
- `PATCH /api/tasks/:id` — update task fields. Publishing requires nonempty title, context, and result. A low score does not block publishing; an existing ID cannot be changed.
- `GET /api/teams` — list teams and derived `progressPoints`.
- `GET /api/responses` — list responses.
- `POST /api/responses` — create a response for a known team and published task. Duplicate team/task pairs, blank idea/plan, and non-HTTP(S) links are rejected.
- `PATCH /api/responses/:id` — select or reject a response. Decisions are final; a database constraint and write transaction allow at most one selected team per task, including concurrent requests. Selection gives 100 derived progress points once.
- `POST /api/ai/chat` — validates the approved AI request, passes it to `ai/service.py::respond_turn(payload, config=config)`, and returns the request's original `requestId` and `cardVersion`. AI exceptions and malformed AI output are returned as generic JSON 502 errors; provider details are not leaked.

The server computes readiness: context 20, data 20, result 15, success 15, constraints 10, users 10, contact plus format 10. Labels are 0–39 Draft, 40–69 Working, 70–89 Ready, and 90–100 Priority. Synthetic records are seeded once per database and are not overwritten on restarts.

TEST COMMANDS AND RESULTS:

```bash
python3 -m unittest discover -s server/tests -p 'test_*.py' -v
```

Backend/API result on 2026-09-23: **18 tests passed**. They cover create/update, server-computed readiness, persistence after restart, seed-once behavior, duplicate responses, concurrent single selection, one-time points, JSON error envelopes, and static-file blocking for `.env`, SQLite files, server source, `.git`, README, and traversal paths. AI boundary coverage includes `requestId`/`cardVersion`, input types, body/history/card/draft limits, client-supplied configuration rejection, AI-not-ready, exception redaction, malformed AI output, and the actual local fallback without provider credentials.

Tests use temporary project roots, temporary SQLite files, and ephemeral loopback ports. They do not reset or write the demo database and do not bind `4173`. The current AI/ML suite also passed 25 tests in this QA pass. `docs/integration-qa.md` records an earlier run with 24 AI tests and 12 UI integration tests, plus browser-to-SQLite scenarios.

AI INTEGRATION:
The backend owns only the HTTP boundary. It reads provider settings at startup from the process environment or `.env`; the AI/ML chat owns AI setup and `.env`. The backend passes `provider`, `api_key`, `model`, `base_url`, and `timeout_seconds` to the AI service. Request body is limited to 64 KiB, draft to 5000 characters, card JSON to 24000 bytes, history to 20 messages/24000 combined characters, and each history message to 4000 characters. Health configuration status is not an LLM availability check. Live external-provider success was not part of integration QA.

DATA PRESERVATION:
The configured SQLite database persists tasks and responses across backend restarts. Tests use disposable temporary databases only. Do not delete the working database to reset the demo. The UI's “Новая задача” clears only the current in-memory draft; it keeps published tasks and responses. Chat and unpublished draft state are not persisted.

LIMITATIONS:
- This is a local demo without user accounts, authorization, or public-deployment hardening. Do not expose it to the public internet.
- Live external LLM success, load testing, and a full security audit have not been confirmed. The local AI fallback is covered by a no-key integration test.
- SQLite is local to the server host; there is no multi-machine sync.

NEXT FOR LEAD:
- The AI/ML chat confirmed its `.env` setup is complete. The key is intentionally blank, so `aiConfigured` is `false`; the local fallback is active. After the key is added locally, restart this process to load it. Treat `aiConfigured: true` only as configuration presence, not proof of a successful LLM request.
- Keep the service bound to `127.0.0.1` for the demo. Stop only this process with `Ctrl+C` in terminal session `41593`; exact PID command at handoff: `kill -TERM 20181`.

FINAL DEMO RUNTIME:
- State: running and health-checked on loopback.
- URL: `http://localhost:4174` (`GET /api/health` returned `200`).
- Process: PID `20181`, command `python3 server/main.py --port 4174`, started in terminal session `41593`.
- Health: `{"status":"ok","storage":"sqlite","aiConfigured":false}`; this uses local AI fallback until a key is configured.
- SQLite path: `/Users/mak/Documents/Hackathon/SanaMatch/server/data/sanamatch.sqlite3` (45,056 bytes at verification time). Tests did not access or reset it.
