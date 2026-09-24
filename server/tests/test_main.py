import concurrent.futures
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))
import main  # noqa: E402


class SanaMatchHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name) / "project"
        self.project_root.mkdir()
        (self.project_root / "index.html").write_text("<!doctype html><title>fixture</title>", encoding="utf-8")
        (self.project_root / "app.js").write_text("window.fixture = true;", encoding="utf-8")
        ui_dir = self.project_root / "ui"
        ui_dir.mkdir()
        (ui_dir / "api-client.js").write_text("window.apiFixture = true;", encoding="utf-8")
        (ui_dir / "demo-adapter.js").write_text("window.demoFixture = true;", encoding="utf-8")
        (self.project_root / ".env").write_text("AI_API_KEY=fixture-secret", encoding="utf-8")
        git_dir = self.project_root / ".git"
        git_dir.mkdir()
        (git_dir / "config").write_text("private git config", encoding="utf-8")
        self.db_path = self.project_root / "server" / "data" / "test.sqlite3"
        self.ai_loader = None
        self._start_server()

    def tearDown(self):
        self._stop_server()
        self.temp_dir.cleanup()

    def _start_server(self, ai_service_loader=None, environment=None, project_root=None):
        self.server = main.make_server(
            host="127.0.0.1",
            port=0,
            db_path=self.db_path,
            project_root=project_root or self.project_root,
            environment=environment,
            ai_service_loader=ai_service_loader,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def _stop_server(self):
        server = getattr(self, "server", None)
        if server is not None:
            server.shutdown()
            server.server_close()
            self.thread.join(timeout=3)
            self.server = None

    def _restart_server(self, ai_service_loader=None, environment=None, project_root=None):
        self._stop_server()
        self._start_server(
            ai_service_loader=ai_service_loader,
            environment=environment,
            project_root=project_root,
        )

    def request(self, method, path, payload=None, raw_body=None, headers=None):
        request_headers = dict(headers or {})
        body = None
        if raw_body is not None:
            body = raw_body
            request_headers.setdefault("Content-Type", "application/json")
        elif payload is not None:
            body = json.dumps(payload).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        body_bytes = response.read()
        status = response.status
        content_type = response.getheader("Content-Type", "")
        connection.close()
        if "application/json" in content_type:
            return status, json.loads(body_bytes.decode("utf-8"))
        return status, body_bytes.decode("utf-8", errors="replace")

    @staticmethod
    def valid_task(**overrides):
        payload = {
            "title": "Новая задача",
            "topic": "Retail",
            "context": "Есть повторяющаяся проблема.",
            "data": "",
            "result": "Нужен рабочий прототип.",
            "success": "",
            "constraints": "",
            "users": "",
            "contact": "",
            "format": "",
            "company": "Demo",
            "analysis": {"mode": "fallback"},
            "published": True,
        }
        payload.update(overrides)
        return payload

    @staticmethod
    def valid_response(**overrides):
        payload = {
            "taskId": "s1",
            "teamId": 1,
            "idea": "Классифицировать и направлять обращения.",
            "plan": "Собрать прототип и проверить на примерах.",
            "link": "https://example.org/prototype",
        }
        payload.update(overrides)
        return payload

    def test_health_and_five_demo_records(self):
        status, health = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health, {"status": "ok", "storage": "sqlite", "aiConfigured": False})
        self.assertEqual(len(self.request("GET", "/api/tasks")[1]["tasks"]), 5)
        self.assertEqual(len(self.request("GET", "/api/teams")[1]["teams"]), 5)
        self.assertEqual(len(self.request("GET", "/api/responses")[1]["responses"]), 5)
        self.assertEqual(self.request("GET", "/api/tasks")[1]["tasks"][0]["id"], "s1")

    def test_task_create_read_patch_and_server_rating(self):
        status, created = self.request("POST", "/api/tasks", self.valid_task(score=100))
        self.assertEqual(status, 201)
        task = created["task"]
        self.assertNotEqual(task["score"], 100)
        self.assertEqual(task["score"], 35)
        self.assertIsInstance(task["analysis"], dict)
        self.assertEqual(task["company"], "Demo")
        self.assertEqual(self.request("GET", "/api/tasks/" + task["id"])[1]["task"]["score"], 35)
        status, updated = self.request(
            "PATCH", "/api/tasks/" + task["id"], {"data": "Примеры обращений", "score": 100}
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["task"]["score"], 55)
        self.assertEqual(updated["task"]["data"], "Примеры обращений")

    def test_task_id_cannot_be_changed_by_patch(self):
        status, result = self.request("PATCH", "/api/tasks/s1", {"id": "other-id", "title": "Changed"})
        self.assertEqual(status, 400)
        self.assertEqual(result["error"]["code"], "TASK_ID_IMMUTABLE")
        self.assertEqual(self.request("GET", "/api/tasks/s1")[1]["task"]["title"], "AI-помощник для обработки обращений")

    def test_publish_minimum_and_unpublished_task_can_be_saved(self):
        status, created = self.request(
            "POST", "/api/tasks", self.valid_task(published=False, title="", context="", result="")
        )
        self.assertEqual(status, 201)
        task_id = created["task"]["id"]
        status, error = self.request("PATCH", "/api/tasks/" + task_id, {"published": True})
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "TASK_NOT_READY_TO_PUBLISH")
        status, updated = self.request(
            "PATCH",
            "/api/tasks/" + task_id,
            {"title": "Задача", "context": "Контекст", "result": "Результат", "published": True},
        )
        self.assertEqual(status, 200)
        self.assertTrue(updated["task"]["published"])
        self.assertEqual(updated["task"]["score"], 35)

    def test_readiness_weights_and_all_level_boundaries(self):
        self.assertEqual(main.calculate_readiness({}), 0)
        self.assertEqual(main.calculate_readiness({"contact": "есть"}), 0)
        self.assertEqual(main.calculate_readiness({"contact": "есть", "format": "есть"}), 10)
        complete = {key: "заполнено" for key in main.TASK_TEXT_FIELDS}
        self.assertEqual(main.calculate_readiness(complete), 100)
        expected = {
            0: "Черновик",
            39: "Черновик",
            40: "Рабочая",
            69: "Рабочая",
            70: "Готовая",
            89: "Готовая",
            90: "Приоритетная",
            100: "Приоритетная",
        }
        for score, label in expected.items():
            with self.subTest(score=score):
                self.assertEqual(main.readiness_level(score)["name"], label)

    def test_seed_runs_once_and_database_survives_restart(self):
        status, changed = self.request("PATCH", "/api/tasks/s1", {"title": "Сохранённое название"})
        self.assertEqual(status, 200)
        main.initialize_database(self.db_path)
        self._restart_server()
        status, task = self.request("GET", "/api/tasks/s1")
        self.assertEqual(status, 200)
        self.assertEqual(task["task"]["title"], "Сохранённое название")
        self.assertEqual(len(self.request("GET", "/api/tasks")[1]["tasks"]), 5)

    def test_invalid_json_and_unknown_ids_use_error_envelope(self):
        status, body = self.request("POST", "/api/tasks", raw_body=b"{")
        self.assertEqual(status, 400)
        self.assertEqual(set(body), {"error"})
        self.assertEqual(set(body["error"]), {"code", "message"})
        status, body = self.request("POST", "/api/tasks", raw_body=b'{"score":NaN}')
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "INVALID_JSON")
        status, body = self.request("GET", "/api/tasks/no-such-task")
        self.assertEqual(status, 404)
        self.assertEqual(body["error"]["code"], "TASK_NOT_FOUND")
        status, body = self.request("PATCH", "/api/responses/no-such-response", {"status": "selected"})
        self.assertEqual(status, 404)
        self.assertEqual(body["error"]["code"], "RESPONSE_NOT_FOUND")

    def test_duplicate_responses_and_invalid_links_are_rejected(self):
        status, body = self.request("POST", "/api/responses", self.valid_response())
        self.assertEqual(status, 201)
        self.assertEqual(body["response"]["status"], "pending")
        status, duplicate = self.request("POST", "/api/responses", self.valid_response())
        self.assertEqual(status, 409)
        self.assertEqual(duplicate["error"]["code"], "DUPLICATE_RESPONSE")
        status, invalid = self.request(
            "POST", "/api/responses", self.valid_response(taskId="s2", teamId=1, link="javascript:alert(1)")
        )
        self.assertEqual(status, 400)
        self.assertEqual(invalid["error"]["code"], "INVALID_LINK")
        status, invalid = self.request(
            "POST", "/api/responses", self.valid_response(taskId="s2", teamId=1, link="https://example .org")
        )
        self.assertEqual(status, 400)
        self.assertEqual(invalid["error"]["code"], "INVALID_LINK")
        status, invalid = self.request(
            "POST", "/api/responses", self.valid_response(taskId="missing")
        )
        self.assertEqual(status, 404)
        self.assertEqual(invalid["error"]["code"], "TASK_NOT_FOUND")
        status, invalid = self.request(
            "POST", "/api/responses", self.valid_response(taskId="s2", teamId=999)
        )
        self.assertEqual(status, 404)
        self.assertEqual(invalid["error"]["code"], "TEAM_NOT_FOUND")

    def test_multiple_selections_require_confirmed_progress_for_points(self):
        status, added = self.request(
            "POST", "/api/responses", self.valid_response(taskId="s1", teamId=1)
        )
        self.assertEqual(status, 201)
        response_id = added["response"]["id"]
        barrier = threading.Barrier(3)

        def choose(identifier):
            barrier.wait(timeout=5)
            return self.request("PATCH", "/api/responses/" + identifier, {"status": "selected"})[0]

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(choose, "r1")
            second = executor.submit(choose, response_id)
            barrier.wait(timeout=5)
            statuses = sorted((first.result(timeout=10), second.result(timeout=10)))
        self.assertEqual(statuses, [200, 200])
        status, teams = self.request("GET", "/api/teams")
        self.assertEqual(status, 200)
        self.assertEqual(sum(team["progressPoints"] for team in teams["teams"]), 0)
        status, selected = self.request("GET", "/api/responses")
        self.assertEqual(status, 200)
        winner = [response for response in selected["responses"] if response["taskId"] == "s1" and response["status"] == "selected"]
        self.assertEqual(len(winner), 2)
        status, repeated = self.request("PATCH", "/api/responses/" + winner[0]["id"], {"status": "selected"})
        self.assertEqual(status, 409)
        self.assertEqual(repeated["error"]["code"], "RESPONSE_ALREADY_RESOLVED")
        teams_after = self.request("GET", "/api/teams")[1]["teams"]
        self.assertEqual(sum(team["progressPoints"] for team in teams_after), 0)
        for response in winner:
            status, confirmed = self.request("PATCH", "/api/responses/" + response["id"], {
                "progressConfirmed": True, "progressNote": "Бизнес проверил демонстрационный прототип."
            })
            self.assertEqual(status, 200)
            self.assertTrue(confirmed["response"]["progressConfirmed"])
        self.assertEqual(sum(team["progressPoints"] for team in self.request("GET", "/api/teams")[1]["teams"]), 200)
        self._restart_server()
        self.assertEqual(sum(team["progressPoints"] for team in self.request("GET", "/api/teams")[1]["teams"]), 200)

    def test_progress_requires_selected_team_and_a_nonempty_note(self):
        payload = {"progressConfirmed": True, "progressNote": "Этап проверен"}
        status, result = self.request("PATCH", "/api/responses/r1", payload)
        self.assertEqual(status, 409)
        self.assertEqual(result["error"]["code"], "TEAM_NOT_SELECTED")
        self.request("PATCH", "/api/responses/r1", {"status": "selected"})
        for invalid in [False, 1, "true"]:
            self.assertEqual(self.request("PATCH", "/api/responses/r1", {**payload, "progressConfirmed": invalid})[0], 400)
        for invalid in ["", "  ", 15, "x" * 1001]:
            self.assertEqual(self.request("PATCH", "/api/responses/r1", {**payload, "progressNote": invalid})[0], 400)
        self.request("PATCH", "/api/responses/r2", {"status": "rejected"})
        self.assertEqual(self.request("PATCH", "/api/responses/r2", payload)[0], 409)

    def test_concurrent_progress_confirmation_awards_points_only_once(self):
        self.request("PATCH", "/api/responses/r1", {"status": "selected"})
        barrier = threading.Barrier(3)

        def confirm():
            barrier.wait(timeout=5)
            return self.request("PATCH", "/api/responses/r1", {
                "progressConfirmed": True, "progressNote": "Проверен прототип классификатора."
            })[0]

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            first, second = executor.submit(confirm), executor.submit(confirm)
            barrier.wait(timeout=5)
            self.assertEqual(sorted([first.result(timeout=10), second.result(timeout=10)]), [200, 409])
        self.assertEqual(sum(team["progressPoints"] for team in self.request("GET", "/api/teams")[1]["teams"]), 100)

    def test_legacy_database_migrates_without_losing_decisions(self):
        database = self.project_root / "legacy.sqlite3"
        connection = main.connect_database(database)
        connection.executescript("""
            CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL, skills TEXT NOT NULL);
            CREATE TABLE responses (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, team_id INTEGER NOT NULL,
                idea TEXT NOT NULL, plan TEXT NOT NULL, link TEXT NOT NULL, status TEXT NOT NULL);
            CREATE UNIQUE INDEX one_selected_team_per_task ON responses(task_id) WHERE status='selected';
            INSERT INTO teams VALUES (42, 'Сохранённая команда', 'Python');
            INSERT INTO responses VALUES ('legacy', 's1', 42, 'Сохранённая идея', 'План', 'https://example.com', 'selected');
        """)
        connection.close()
        main.initialize_database(database)
        main.initialize_database(database)
        stored = next(response for response in main.list_responses(database) if response["id"] == "legacy")
        self.assertEqual(stored["idea"], "Сохранённая идея")
        self.assertEqual(stored["status"], "selected")
        self.assertFalse(stored["progressConfirmed"])
        self.assertEqual(len(main.list_responses(database)), 6)
        self.assertEqual(main.patch_response(database, "r1", {"status": "selected"})["status"], "selected")
        self.assertEqual(sum(team["progressPoints"] for team in main.list_teams(database)), 0)

    def test_five_drafts_and_complete_team_profiles(self):
        drafts = json.loads((SERVER_DIR.parent / "data" / "demo-drafts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(drafts), 5)
        self.assertEqual(len({item["id"] for item in drafts}), 5)
        self.assertGreater(len({item["completeness"] for item in drafts}), 1)
        for item in drafts:
            self.assertTrue(item["text"].strip())
            self.assertTrue(item["topic"].strip())
        teams = self.request("GET", "/api/teams")[1]["teams"]
        self.assertEqual(len(teams), 5)
        for team in teams:
            for field in ("name", "skills", "interests", "technologies"):
                self.assertTrue(team[field].strip())

    def test_static_allowlist_blocks_env_database_server_and_git(self):
        status, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("fixture", body)
        self.assertEqual(self.request("GET", "/app.js")[0], 200)
        self.assertEqual(self.request("GET", "/ui/api-client.js")[0], 200)
        self.assertEqual(self.request("GET", "/ui/demo-adapter.js")[0], 200)
        for path in (
            "/.env",
            "/server/main.py",
            "/server/data/test.sqlite3",
            "/.git/config",
            "/README.md",
            "/%2e%2e/.env",
        ):
            with self.subTest(path=path):
                status, _ = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_ai_not_ready_when_service_file_is_absent(self):
        payload = {
            "requestId": "req-1",
            "cardVersion": 2,
            "draft": "Черновик задачи",
            "card": {},
            "messages": [{"role": "user", "content": "Привет"}],
            "language": "ru",
        }
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 503)
        self.assertEqual(result["error"]["code"], "AI_NOT_READY")

    def test_ai_stub_contract_receives_server_config_and_server_echoes_ids(self):
        captured = {}

        def respond_turn(payload, config=None):
            captured["payload"] = payload
            captured["config"] = config
            return {
                "mode": "fallback",
                "reply": "Уточните доступные данные.",
                "updates": [],
                "suggestions": [],
                "missingFields": ["data"],
                "issues": [],
            }

        stub = SimpleNamespace(respond_turn=respond_turn)
        environment = {
            "AI_PROVIDER": "test-provider",
            "AI_API_KEY": "server-only-test-secret",
            "AI_MODEL": "test-model",
            "AI_BASE_URL": "https://provider.example/v1",
            "AI_TIMEOUT_SECONDS": "12",
        }
        self._restart_server(ai_service_loader=lambda root: stub, environment=environment)
        payload = {
            "requestId": "request-original",
            "cardVersion": 7,
            "draft": "Нужно лучше обрабатывать обращения клиентов.",
            "card": {"context": "Обращения клиентов"},
            "messages": [{"role": "user", "content": "Какие данные нужны?"}],
            "language": "ru",
        }
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 200)
        self.assertEqual(result["requestId"], "request-original")
        self.assertEqual(result["cardVersion"], 7)
        self.assertEqual(result["mode"], "fallback")
        self.assertEqual(captured["payload"], payload)
        self.assertEqual(captured["config"]["api_key"], "server-only-test-secret")
        self.assertEqual(captured["config"]["timeout_seconds"], 12.0)
        self.assertNotIn("server-only-test-secret", json.dumps(result))
        self.assertEqual(self.request("GET", "/api/health")[1]["aiConfigured"], True)

    def test_ai_real_local_fallback_runs_through_http_without_provider_keys(self):
        self._restart_server(
            environment={"AI_PROVIDER": "", "AI_API_KEY": "", "AI_MODEL": "", "AI_BASE_URL": ""},
            project_root=main.PROJECT_ROOT,
        )
        payload = {
            "requestId": "local-fallback-check",
            "cardVersion": 3,
            "draft": "Нужно улучшить обработку обращений клиентов.",
            "card": {"context": "Обработка обращений клиентов"},
            "messages": [],
            "language": "ru",
        }
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 200)
        self.assertEqual(result["mode"], "fallback")
        self.assertEqual(result["requestId"], payload["requestId"])
        self.assertEqual(result["cardVersion"], payload["cardVersion"])
        self.assertIsInstance(result["reply"], str)
        self.assertIsInstance(result["updates"], list)

    def test_ai_input_rejects_client_configuration_and_oversized_history(self):
        payload = {
            "requestId": "request-1",
            "cardVersion": 1,
            "draft": "Черновик",
            "card": {},
            "messages": [],
            "language": "ru",
            "api_key": "client-secret",
        }
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 400)
        self.assertEqual(result["error"]["code"], "AI_INVALID_REQUEST")
        payload.pop("api_key")
        payload["messages"] = [{"role": "user", "content": "x" * 4001}]
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 400)
        self.assertEqual(result["error"]["code"], "AI_INVALID_REQUEST")

    def test_ai_request_rejects_invalid_types_and_contract_limits(self):
        base = {
            "requestId": "request-1",
            "cardVersion": 1,
            "draft": "Черновик задачи",
            "card": {},
            "messages": [],
            "language": "ru",
        }
        invalid_payloads = [
            {**base, "requestId": 1},
            {**base, "cardVersion": True},
            {**base, "cardVersion": -1},
            {**base, "draft": True},
            {**base, "draft": "x" * (main.MAX_DRAFT_LENGTH + 1)},
            {**base, "card": []},
            {**base, "card": {"data": "x" * main.MAX_AI_CARD_BYTES}},
            {**base, "messages": {}},
            {**base, "messages": [{"role": "system", "content": "x"}]},
            {**base, "messages": [{"role": "user", "content": "x" * 4001}]},
            {
                **base,
                "messages": [{"role": "user", "content": "x" * 4000} for _ in range(7)],
            },
            {
                **base,
                "messages": [{"role": "user", "content": "x"} for _ in range(main.MAX_HISTORY_MESSAGES + 1)],
            },
            {**base, "language": "en"},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload_keys=tuple(sorted(payload)), messages=len(payload["messages"]) if isinstance(payload["messages"], list) else None):
                status, result = self.request("POST", "/api/ai/chat", payload)
                self.assertEqual(status, 400)
                self.assertEqual(result["error"]["code"], "AI_INVALID_REQUEST")

    def test_ai_module_failures_return_generic_json_errors(self):
        def raises_provider_error(payload, config=None):
            raise RuntimeError("private provider diagnostic")

        payload = {
            "requestId": "error-check",
            "cardVersion": 0,
            "draft": "Черновик задачи",
            "card": {},
            "messages": [],
            "language": "ru",
        }
        failing_service = SimpleNamespace(respond_turn=raises_provider_error)
        self._restart_server(ai_service_loader=lambda root: failing_service, environment={})
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 502)
        self.assertEqual(result["error"]["code"], "AI_SERVICE_ERROR")
        self.assertNotIn("private provider diagnostic", json.dumps(result))

        malformed_service = SimpleNamespace(respond_turn=lambda payload, config=None: {"mode": "fallback"})
        self._restart_server(ai_service_loader=lambda root: malformed_service, environment={})
        status, result = self.request("POST", "/api/ai/chat", payload)
        self.assertEqual(status, 502)
        self.assertEqual(result["error"]["code"], "AI_INVALID_RESPONSE")

    def test_unsupported_api_methods_use_json_error_envelope(self):
        status, result = self.request("DELETE", "/api/tasks/s1")
        self.assertEqual(status, 405)
        self.assertEqual(result["error"]["code"], "METHOD_NOT_ALLOWED")
        status, result = self.request("PUT", "/api/health")
        self.assertEqual(status, 405)
        self.assertEqual(result["error"]["code"], "METHOD_NOT_ALLOWED")

    def test_request_body_limit(self):
        body = b" " * (main.MAX_BODY_BYTES + 1)
        status, result = self.request("POST", "/api/tasks", raw_body=body)
        self.assertEqual(status, 413)
        self.assertEqual(result["error"]["code"], "REQUEST_TOO_LARGE")


if __name__ == "__main__":
    unittest.main()
