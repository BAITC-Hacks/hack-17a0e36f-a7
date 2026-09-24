#!/usr/bin/env python3
"""Small same-origin HTTP and SQLite backend for the SanaMatch demo."""

import argparse
import importlib
import json
import math
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT = 4174
MAX_BODY_BYTES = 64 * 1024
MAX_HISTORY_MESSAGES = 20
MAX_HISTORY_CHARS = 24000
MAX_TEXT_LENGTH = 10000
MAX_DRAFT_LENGTH = 5000
MAX_AI_CARD_BYTES = 24000
TASK_TEXT_FIELDS = (
    "title",
    "topic",
    "context",
    "data",
    "result",
    "success",
    "constraints",
    "users",
    "contact",
    "format",
    "company",
)
READINESS_WEIGHTS = {
    "context": 20,
    "data": 20,
    "result": 15,
    "success": 15,
    "constraints": 10,
    "users": 10,
    "contactFormat": 10,
}
TASK_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/enhancements.css": "enhancements.css",
    "/accessibility.css": "accessibility.css",
    "/chatbot.css": "chatbot.css",
    "/favicon.svg": "favicon.svg",
    "/ui/api-client.js": "ui/api-client.js",
    "/ui/demo-adapter.js": "ui/demo-adapter.js",
}

SEED_TEAMS = [
    {"id": 1, "name": "Code Nomads", "skills": "UX, AI-агенты", "interests": "Retail, клиентская поддержка", "technologies": "React, JavaScript"},
    {"id": 2, "name": "DataMinds", "skills": "Аналитика, ML", "interests": "FinTech, анализ данных", "technologies": "Python, pandas"},
    {"id": 3, "name": "Pixel Pioneers", "skills": "Product design, frontend", "interests": "HealthTech, доступные интерфейсы", "technologies": "Figma, HTML, CSS"},
    {"id": 4, "name": "Qadam Tech", "skills": "Backend, интеграции", "interests": "GovTech, городские сервисы", "technologies": "Python, SQLite"},
    {"id": 5, "name": "Future Five", "skills": "EdTech, GenAI", "interests": "Образование, учебные проекты", "technologies": "JavaScript, Python"},
]
SEED_TASKS = [
    {
        "id": "s1",
        "title": "AI-помощник для обработки обращений",
        "topic": "Retail",
        "context": "Операторы интернет-магазина вручную сортируют повторяющиеся обращения клиентов.",
        "data": "Анонимизированные примеры 200 обращений и категории.",
        "result": "Прототип классификатора обращений с черновиком ответа.",
        "success": "Сократить ручную сортировку минимум на 30%.",
        "constraints": "Срок 4 недели, только обезличенные данные.",
        "users": "Операторы поддержки и руководитель контакт-центра.",
        "contact": "Айгерим, product@demo.kz",
        "format": "Две консультации в неделю.",
        "published": True,
    },
    {
        "id": "s2",
        "title": "Навигатор практики для студентов",
        "topic": "EdTech",
        "context": "Студенты не понимают, какие практические задачи соответствуют их навыкам.",
        "data": "Каталог задач и профили навыков.",
        "result": "Каталог с подборкой задач.",
        "success": "Пользователь находит подходящую задачу за 3 минуты.",
        "constraints": "MVP только для веба.",
        "users": "Студенты 2–4 курсов.",
        "contact": "Айдана, ed@demo.kz",
        "format": "Еженедельная обратная связь.",
        "published": True,
    },
    {
        "id": "s3",
        "title": "Панель энергопотребления офиса",
        "topic": "GovTech",
        "context": "Администратор не видит пики энергопотребления по этажам.",
        "data": "CSV со счётчиками по часам.",
        "result": "Дашборд аномалий и рекомендаций.",
        "success": "Найти 3 зоны перерасхода.",
        "constraints": "Без подключения к реальным приборам.",
        "users": "Facility-менеджер.",
        "contact": "",
        "format": "",
        "published": True,
    },
    {
        "id": "s4",
        "title": "Подбор консультации для пациентов",
        "topic": "HealthTech",
        "context": "Клиника хочет быстрее направлять запросы к подходящему специалисту.",
        "data": "Обезличенный перечень услуг.",
        "result": "Форма первичной навигации.",
        "success": "Снизить число ошибочных записей.",
        "constraints": "Не ставить диагнозы.",
        "users": "Новые пациенты клиники.",
        "contact": "Нурлан, clinic@demo.kz",
        "format": "Созвон раз в неделю.",
        "published": True,
    },
    {
        "id": "s5",
        "title": "Прогноз кассовых разрывов",
        "topic": "FinTech",
        "context": "Малому бизнесу сложно планировать обязательные платежи.",
        "data": "Синтетические транзакции за 12 месяцев.",
        "result": "Календарь рисков и подсказки.",
        "success": "Предупреждать за 14 дней.",
        "constraints": "Только синтетические данные.",
        "users": "Финансовый менеджер малого бизнеса.",
        "contact": "Дана, finance@demo.kz",
        "format": "Демо по пятницам.",
        "published": True,
    },
]
SEED_RESPONSES = [
    {
        "id": "r1",
        "taskId": "s1",
        "teamId": 2,
        "idea": "Классифицируем обращения и показываем оператору черновик маршрутизации.",
        "plan": "Неделя 1: данные; неделя 2: прототип; неделя 3: тест.",
        "link": "https://github.com/dataminds/support-ai",
        "status": "pending",
    },
    {
        "id": "r2",
        "taskId": "s2",
        "teamId": 5,
        "idea": "Сопоставление навыков команды с задачами каталога.",
        "plan": "MVP за 10 дней, затем usability-тест.",
        "link": "https://github.com/futurefive/navigator",
        "status": "pending",
    },
    {
        "id": "r3",
        "taskId": "s3",
        "teamId": 4,
        "idea": "Дашборд временных рядов с аномалиями.",
        "plan": "Прототип за 2 недели.",
        "link": "https://github.com/qadam/energy",
        "status": "pending",
    },
    {
        "id": "r4",
        "taskId": "s4",
        "teamId": 1,
        "idea": "Безопасная форма-навигатор по типу запроса.",
        "plan": "MVP за 7 дней.",
        "link": "https://github.com/codenomads/clinic",
        "status": "pending",
    },
    {
        "id": "r5",
        "taskId": "s5",
        "teamId": 2,
        "idea": "Календарь платежей с ранними предупреждениями.",
        "plan": "Аналитический прототип за 2 недели.",
        "link": "https://github.com/dataminds/cashflow",
        "status": "pending",
    },
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    context TEXT NOT NULL,
    data TEXT NOT NULL,
    result TEXT NOT NULL,
    success TEXT NOT NULL,
    constraints TEXT NOT NULL,
    users TEXT NOT NULL,
    contact TEXT NOT NULL,
    format TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    analysis_json TEXT NOT NULL DEFAULT '{}',
    published INTEGER NOT NULL CHECK (published IN (0, 1)),
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    skills TEXT NOT NULL,
    interests TEXT NOT NULL DEFAULT '',
    technologies TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    idea TEXT NOT NULL,
    plan TEXT NOT NULL,
    link TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'selected', 'rejected')),
    progress_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (progress_confirmed IN (0, 1)),
    progress_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, team_id)
);
CREATE INDEX IF NOT EXISTS responses_status_idx ON responses(status);
"""


def _reject_json_constant(value):
    raise ValueError("Non-standard JSON constant: " + value)


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def load_environment(project_root=PROJECT_ROOT, base_environment=None):
    """Read a tiny .env file without overwriting the process environment."""
    environment = dict(os.environ if base_environment is None else base_environment)
    env_path = Path(project_root) / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return environment
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[7:].lstrip()
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] in ("'", '"') and value[-1:] == value[:1] and len(value) >= 2:
            value = value[1:-1]
        if key and key not in environment:
            environment[key] = value
    return environment


def ai_configuration(project_root=PROJECT_ROOT, environment=None):
    env = load_environment(project_root, environment)
    try:
        timeout = float(env.get("AI_TIMEOUT_SECONDS", "30") or "30")
        if not math.isfinite(timeout) or timeout <= 0:
            timeout = 30.0
    except (TypeError, ValueError):
        timeout = 30.0
    timeout = min(timeout, 60.0)
    return {
        "provider": env.get("AI_PROVIDER", "").strip(),
        "api_key": env.get("AI_API_KEY", "").strip(),
        "model": env.get("AI_MODEL", "").strip(),
        "base_url": env.get("AI_BASE_URL", "").strip(),
        "timeout_seconds": timeout,
    }


def ai_is_configured(config):
    return bool(config["provider"] and config["api_key"] and config["model"])


def resolve_database_path(project_root=PROJECT_ROOT, environment=None):
    env = load_environment(project_root, environment)
    raw_path = env.get("SANAMATCH_DB_PATH", "").strip()
    path = Path(raw_path) if raw_path else Path("server/data/sanamatch.sqlite3")
    if not path.is_absolute():
        path = Path(project_root) / path
    return path.resolve()


def is_safe_id(value):
    return isinstance(value, str) and TASK_ID_RE.fullmatch(value) is not None


def has_text(value):
    return isinstance(value, str) and bool(value.strip())


def calculate_readiness(card):
    values = {
        "context": has_text(card.get("context")),
        "data": has_text(card.get("data")),
        "result": has_text(card.get("result")),
        "success": has_text(card.get("success")),
        "constraints": has_text(card.get("constraints")),
        "users": has_text(card.get("users")),
        "contactFormat": has_text(card.get("contact")) and has_text(card.get("format")),
    }
    return sum(READINESS_WEIGHTS[key] for key, filled in values.items() if filled)


def readiness_level(score):
    if score < 40:
        return {"name": "Черновик", "className": "draft"}
    if score < 70:
        return {"name": "Рабочая", "className": "working"}
    if score < 90:
        return {"name": "Готовая", "className": "ready"}
    return {"name": "Приоритетная", "className": "priority"}


def connect_database(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


@contextmanager
def transaction(db_path, immediate=False):
    connection = connect_database(db_path)
    try:
        connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _task_storage_values(task):
    analysis = task.get("analysis", {})
    return (
        task["id"],
        task.get("title", ""),
        task.get("topic", ""),
        task.get("context", ""),
        task.get("data", ""),
        task.get("result", ""),
        task.get("success", ""),
        task.get("constraints", ""),
        task.get("users", ""),
        task.get("contact", ""),
        task.get("format", ""),
        task.get("company", ""),
        json.dumps(analysis, ensure_ascii=False, separators=(",", ":")),
        1 if task.get("published", False) else 0,
        calculate_readiness(task),
    )


def _insert_task(connection, task):
    connection.execute(
        """INSERT INTO tasks
        (id,title,topic,context,data,result,success,constraints,users,contact,format,
         company,analysis_json,published,score)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        _task_storage_values(task),
    )


def initialize_database(db_path):
    connection = connect_database(db_path)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA)
    finally:
        connection.close()
    with transaction(db_path, immediate=True) as connection:
        # Non-destructive migration: keep tasks, decisions and responses intact.
        for table, fields in (
            ("teams", {"interests": "TEXT NOT NULL DEFAULT ''", "technologies": "TEXT NOT NULL DEFAULT ''"}),
            ("responses", {"progress_confirmed": "INTEGER NOT NULL DEFAULT 0 CHECK (progress_confirmed IN (0, 1))", "progress_note": "TEXT NOT NULL DEFAULT ''"}),
        ):
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(" + table + ")")}
            for column, definition in fields.items():
                if column not in columns:
                    connection.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition)
        connection.execute("DROP INDEX IF EXISTS one_selected_team_per_task")
        for team in SEED_TEAMS:
            connection.execute(
                "UPDATE teams SET interests = CASE WHEN interests = '' THEN ? ELSE interests END, "
                "technologies = CASE WHEN technologies = '' THEN ? ELSE technologies END WHERE id = ?",
                (team["interests"], team["technologies"], team["id"]),
            )
        seeded = connection.execute(
            "SELECT value FROM app_meta WHERE key = ?", ("demo_seed_v1",)
        ).fetchone()
        if seeded is not None:
            return
        connection.executemany(
            "INSERT INTO teams(id,name,skills,interests,technologies) VALUES (?,?,?,?,?)",
            [(team["id"], team["name"], team["skills"], team["interests"], team["technologies"]) for team in SEED_TEAMS],
        )
        for task in SEED_TASKS:
            _insert_task(connection, task)
        connection.executemany(
            """INSERT INTO responses(id,task_id,team_id,idea,plan,link,status)
            VALUES (?,?,?,?,?,?,?)""",
            [
                (
                    response["id"],
                    response["taskId"],
                    response["teamId"],
                    response["idea"],
                    response["plan"],
                    response["link"],
                    response["status"],
                )
                for response in SEED_RESPONSES
            ],
        )
        connection.execute(
            "INSERT INTO app_meta(key,value) VALUES (?,?)", ("demo_seed_v1", "done")
        )


def _task_from_row(row):
    try:
        analysis = json.loads(row["analysis_json"] or "{}")
        if not isinstance(analysis, dict):
            analysis = {}
    except (TypeError, ValueError):
        analysis = {}
    task = {
        "id": row["id"],
        "title": row["title"],
        "topic": row["topic"],
        "context": row["context"],
        "data": row["data"],
        "result": row["result"],
        "success": row["success"],
        "constraints": row["constraints"],
        "users": row["users"],
        "contact": row["contact"],
        "format": row["format"],
        "company": row["company"],
        "analysis": analysis,
        "published": bool(row["published"]),
    }
    task["score"] = calculate_readiness(task)
    return task


def _response_from_row(row):
    return {
        "id": row["id"],
        "taskId": row["task_id"],
        "teamId": row["team_id"],
        "idea": row["idea"],
        "plan": row["plan"],
        "link": row["link"],
        "status": row["status"],
        "progressConfirmed": bool(row["progress_confirmed"]),
        "progressNote": row["progress_note"],
    }


def list_tasks(db_path):
    connection = connect_database(db_path)
    try:
        rows = connection.execute("SELECT * FROM tasks ORDER BY rowid").fetchall()
        return [_task_from_row(row) for row in rows]
    finally:
        connection.close()


def get_task(db_path, task_id):
    connection = connect_database(db_path)
    try:
        row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.")
        return _task_from_row(row)
    finally:
        connection.close()


def _validate_task_payload(payload, partial=False):
    if not isinstance(payload, dict):
        raise ApiError(400, "INVALID_TASK", "Ожидается JSON-объект задачи.")
    allowed = set(TASK_TEXT_FIELDS) | {"id", "published", "analysis", "score"}
    unknown = set(payload) - allowed
    if unknown:
        raise ApiError(400, "UNKNOWN_FIELD", "В задаче есть неизвестные поля.")
    result = {}
    for key in TASK_TEXT_FIELDS:
        if key not in payload:
            if not partial:
                result[key] = ""
            continue
        value = payload[key]
        if not isinstance(value, str):
            raise ApiError(400, "INVALID_FIELD", "Текстовые поля задачи должны быть строками.")
        max_length = 300 if key == "title" else 120 if key == "topic" else MAX_TEXT_LENGTH
        if len(value) > max_length:
            raise ApiError(400, "FIELD_TOO_LONG", "Одно из полей задачи слишком длинное.")
        result[key] = value.strip()
    if "analysis" in payload:
        analysis = payload["analysis"]
        if not isinstance(analysis, dict):
            raise ApiError(400, "INVALID_FIELD", "Поле analysis должно быть JSON-объектом.")
        try:
            encoded_analysis = json.dumps(analysis, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            raise ApiError(400, "INVALID_FIELD", "Поле analysis содержит неподдерживаемые данные.")
        if len(encoded_analysis.encode("utf-8")) > 16000:
            raise ApiError(400, "FIELD_TOO_LONG", "Поле analysis слишком большое.")
        result["analysis"] = analysis
    elif not partial:
        result["analysis"] = {}
    if "published" in payload:
        if not isinstance(payload["published"], bool):
            raise ApiError(400, "INVALID_FIELD", "Поле published должно быть boolean.")
        result["published"] = payload["published"]
    elif not partial:
        result["published"] = False
    if "id" in payload:
        if not is_safe_id(payload["id"]):
            raise ApiError(400, "INVALID_ID", "Некорректный идентификатор задачи.")
        result["id"] = payload["id"]
    return result


def _ensure_publishable(task):
    if task.get("published") and not all(
        has_text(task.get(field)) for field in ("title", "context", "result")
    ):
        raise ApiError(
            400,
            "TASK_NOT_READY_TO_PUBLISH",
            "Для публикации нужны название, контекст и ожидаемый результат.",
        )


def create_task(db_path, payload):
    task = _validate_task_payload(payload)
    task["id"] = task.get("id") or uuid.uuid4().hex
    _ensure_publishable(task)
    try:
        with transaction(db_path, immediate=True) as connection:
            _insert_task(connection, task)
    except sqlite3.IntegrityError:
        raise ApiError(409, "TASK_ID_CONFLICT", "Задача с таким идентификатором уже существует.")
    return get_task(db_path, task["id"])


def patch_task(db_path, task_id, payload):
    updates = _validate_task_payload(payload, partial=True)
    supplied_id = updates.pop("id", None)
    if supplied_id is not None and supplied_id != task_id:
        raise ApiError(400, "TASK_ID_IMMUTABLE", "Идентификатор задачи нельзя изменить.")
    updates.pop("score", None)
    if not updates:
        raise ApiError(400, "EMPTY_PATCH", "Не переданы поля для изменения.")
    with transaction(db_path, immediate=True) as connection:
        row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.")
        task = _task_from_row(row)
        task.update(updates)
        _ensure_publishable(task)
        values = _task_storage_values(task)
        connection.execute(
            """UPDATE tasks SET title=?,topic=?,context=?,data=?,result=?,success=?,constraints=?,
            users=?,contact=?,format=?,company=?,analysis_json=?,published=?,score=?,
            updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            values[1:] + (task_id,),
        )
    return get_task(db_path, task_id)


def list_teams(db_path):
    connection = connect_database(db_path)
    try:
        rows = connection.execute(
            """SELECT t.id,t.name,t.skills,t.interests,t.technologies,COUNT(r.id)*100 AS progress_points
            FROM teams t LEFT JOIN responses r ON r.team_id=t.id AND r.status='selected' AND r.progress_confirmed=1
            GROUP BY t.id ORDER BY t.id"""
        ).fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "skills": row["skills"],
                "interests": row["interests"],
                "technologies": row["technologies"],
                "progressPoints": row["progress_points"],
            }
            for row in rows
        ]
    finally:
        connection.close()


def list_responses(db_path):
    connection = connect_database(db_path)
    try:
        rows = connection.execute("SELECT * FROM responses ORDER BY rowid").fetchall()
        return [_response_from_row(row) for row in rows]
    finally:
        connection.close()


def _validate_http_url(value):
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 2048
        or any(character.isspace() or ord(character) < 32 for character in value)
    ):
        return False
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme.lower() in ("http", "https")
            and bool(parsed.hostname)
            and not any(character.isspace() for character in parsed.hostname)
            and parsed.username is None
            and parsed.password is None
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
    except ValueError:
        return False


def create_response(db_path, payload):
    if not isinstance(payload, dict):
        raise ApiError(400, "INVALID_RESPONSE", "Ожидается JSON-объект отклика.")
    if set(payload) != {"taskId", "teamId", "idea", "plan", "link"}:
        raise ApiError(400, "INVALID_RESPONSE", "Передайте taskId, teamId, idea, plan и link.")
    task_id = payload["taskId"]
    team_id = payload["teamId"]
    idea = payload["idea"]
    plan = payload["plan"]
    link = payload["link"]
    if not is_safe_id(task_id):
        raise ApiError(400, "INVALID_TASK_ID", "Некорректный taskId.")
    if isinstance(team_id, bool) or not isinstance(team_id, int):
        raise ApiError(400, "INVALID_TEAM_ID", "teamId должен быть числом.")
    if not isinstance(idea, str) or not idea.strip() or len(idea) > MAX_TEXT_LENGTH:
        raise ApiError(400, "INVALID_IDEA", "Идея обязательна и должна быть текстом.")
    if not isinstance(plan, str) or not plan.strip() or len(plan) > MAX_TEXT_LENGTH:
        raise ApiError(400, "INVALID_PLAN", "План обязателен и должен быть текстом.")
    if not _validate_http_url(link):
        raise ApiError(400, "INVALID_LINK", "Нужна корректная HTTP/HTTPS-ссылка.")
    response_id = "r" + uuid.uuid4().hex
    try:
        with transaction(db_path, immediate=True) as connection:
            task = connection.execute(
                "SELECT published FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if task is None:
                raise ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.")
            if not task["published"]:
                raise ApiError(409, "TASK_NOT_PUBLISHED", "На неопубликованную задачу нельзя откликнуться.")
            team = connection.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
            if team is None:
                raise ApiError(404, "TEAM_NOT_FOUND", "Команда не найдена.")
            connection.execute(
                """INSERT INTO responses(id,task_id,team_id,idea,plan,link,status)
                VALUES (?,?,?,?,?,?,?)""",
                (response_id, task_id, team_id, idea.strip(), plan.strip(), link, "pending"),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "DUPLICATE_RESPONSE", "Команда уже отправила отклик на эту задачу.")
    connection = connect_database(db_path)
    try:
        row = connection.execute("SELECT * FROM responses WHERE id = ?", (response_id,)).fetchone()
        return _response_from_row(row)
    finally:
        connection.close()


def patch_response(db_path, response_id, payload):
    if not isinstance(payload, dict) or set(payload) not in ({"status"}, {"progressConfirmed", "progressNote"}):
        raise ApiError(400, "INVALID_RESPONSE_STATUS", "Передайте status или подтверждение выполненного этапа с описанием.")
    confirming_progress = "progressConfirmed" in payload
    status = payload.get("status")
    note = payload.get("progressNote", "")
    if confirming_progress and (payload["progressConfirmed"] is not True or not isinstance(note, str) or not note.strip() or len(note) > 1000):
        raise ApiError(400, "INVALID_PROGRESS", "Опишите подтверждённый выполненный этап (до 1000 символов).")
    if not confirming_progress and status not in ("selected", "rejected"):
        raise ApiError(400, "INVALID_RESPONSE_STATUS", "Статус должен быть selected или rejected.")
    if not is_safe_id(response_id):
        raise ApiError(404, "RESPONSE_NOT_FOUND", "Отклик не найден.")
    with transaction(db_path, immediate=True) as connection:
        row = connection.execute("SELECT * FROM responses WHERE id = ?", (response_id,)).fetchone()
        if row is None:
            raise ApiError(404, "RESPONSE_NOT_FOUND", "Отклик не найден.")
        if confirming_progress:
            if row["status"] != "selected":
                raise ApiError(409, "TEAM_NOT_SELECTED", "Сначала выберите команду вручную.")
            if row["progress_confirmed"]:
                raise ApiError(409, "PROGRESS_ALREADY_CONFIRMED", "Этап уже подтверждён; повторные баллы не начисляются.")
            connection.execute(
                "UPDATE responses SET progress_confirmed = 1, progress_note = ? WHERE id = ?",
                (note.strip(), response_id),
            )
        else:
            if row["status"] != "pending":
                raise ApiError(409, "RESPONSE_ALREADY_RESOLVED", "Отклик уже обработан.")
            connection.execute(
                "UPDATE responses SET status = ? WHERE id = ? AND status = 'pending'",
                (status, response_id),
            )
        updated = connection.execute("SELECT * FROM responses WHERE id = ?", (response_id,)).fetchone()
        return _response_from_row(updated)


def _load_ai_service(project_root):
    service_file = Path(project_root) / "ai" / "service.py"
    if not service_file.is_file():
        return None
    root_text = str(Path(project_root).resolve())
    added = root_text not in sys.path
    if added:
        sys.path.insert(0, root_text)
    try:
        importlib.invalidate_caches()
        module = importlib.import_module("ai.service")
        module_path = Path(getattr(module, "__file__", "")).resolve()
        if module_path != service_file.resolve():
            return None
        if not callable(getattr(module, "respond_turn", None)):
            return None
        return module
    except (ImportError, OSError, AttributeError, ValueError):
        return None
    finally:
        if added:
            try:
                sys.path.remove(root_text)
            except ValueError:
                pass


def _validate_ai_request(payload):
    required = {"requestId", "cardVersion", "draft", "card", "messages", "language"}
    if not isinstance(payload, dict) or set(payload) != required:
        raise ApiError(400, "AI_INVALID_REQUEST", "Запрос AI не соответствует контракту.")
    request_id = payload["requestId"]
    card_version = payload["cardVersion"]
    draft = payload["draft"]
    card = payload["card"]
    messages = payload["messages"]
    if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 128:
        raise ApiError(400, "AI_INVALID_REQUEST", "Некорректный requestId.")
    if isinstance(card_version, bool) or not isinstance(card_version, int) or card_version < 0:
        raise ApiError(400, "AI_INVALID_REQUEST", "cardVersion должен быть целым неотрицательным числом.")
    if not isinstance(draft, str) or not draft.strip() or len(draft) > MAX_DRAFT_LENGTH:
        raise ApiError(400, "AI_INVALID_REQUEST", "Черновик обязателен и слишком длинным быть не должен.")
    if not isinstance(card, dict):
        raise ApiError(400, "AI_INVALID_REQUEST", "card должен быть JSON-объектом.")
    if not isinstance(messages, list) or len(messages) > MAX_HISTORY_MESSAGES:
        raise ApiError(400, "AI_INVALID_REQUEST", "История чата слишком длинная.")
    try:
        if len(json.dumps(card, ensure_ascii=False).encode("utf-8")) > MAX_AI_CARD_BYTES:
            raise ApiError(400, "AI_INVALID_REQUEST", "Карточка слишком большая.")
    except (TypeError, ValueError):
        raise ApiError(400, "AI_INVALID_REQUEST", "Карточка содержит неподдерживаемые данные.")
    history_chars = 0
    for message in messages:
        if not isinstance(message, dict) or set(message) != {"role", "content"}:
            raise ApiError(400, "AI_INVALID_REQUEST", "Сообщение истории должно содержать role и content.")
        if message["role"] not in ("user", "assistant"):
            raise ApiError(400, "AI_INVALID_REQUEST", "Недопустимая роль сообщения.")
        if not isinstance(message["content"], str) or len(message["content"]) > 4000:
            raise ApiError(400, "AI_INVALID_REQUEST", "Сообщение истории слишком длинное.")
        history_chars += len(message["content"])
    if history_chars > MAX_HISTORY_CHARS:
        raise ApiError(400, "AI_INVALID_REQUEST", "Общий размер истории чата превышен.")
    if payload["language"] != "ru":
        raise ApiError(400, "AI_INVALID_REQUEST", "Поддерживается language=ru.")
    return payload


def _validate_ai_result(result):
    if not isinstance(result, dict):
        return False
    if result.get("mode") not in ("llm", "fallback") or not isinstance(result.get("reply"), str):
        return False
    if len(result["reply"]) > 12000:
        return False
    list_fields = ("updates", "suggestions", "missingFields", "issues")
    if any(not isinstance(result.get(key), list) for key in list_fields):
        return False
    for item in result["updates"]:
        if not isinstance(item, dict) or not all(
            isinstance(item.get(key), str) for key in ("field", "value", "evidence")
        ):
            return False
    for item in result["suggestions"]:
        if not isinstance(item, dict) or not all(
            isinstance(item.get(key), str) for key in ("field", "value", "reason")
        ):
            return False
    if any(not isinstance(field, str) for field in result["missingFields"]):
        return False
    for item in result["issues"]:
        if not isinstance(item, dict) or not all(
            isinstance(item.get(key), str) for key in ("field", "message")
        ):
            return False
    return True


def _ai_call(project_root, environment, service_loader, payload):
    service = service_loader(project_root)
    if service is None:
        raise ApiError(503, "AI_NOT_READY", "AI-модуль ещё не подключён.")
    config = ai_configuration(project_root, environment)
    try:
        result = service.respond_turn(payload, config=config)
    except Exception:
        raise ApiError(502, "AI_SERVICE_ERROR", "AI-модуль временно не смог обработать запрос.")
    if not _validate_ai_result(result):
        raise ApiError(502, "AI_INVALID_RESPONSE", "AI-модуль вернул ответ неверного формата.")
    response = {
        "mode": result["mode"],
        "reply": result["reply"],
        "updates": result["updates"],
        "suggestions": result["suggestions"],
        "missingFields": result["missingFields"],
        "issues": result["issues"],
        "requestId": payload["requestId"],
        "cardVersion": payload["cardVersion"],
    }
    return response


class SanaMatchHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_handler(db_path, project_root, environment, ai_service_loader):
    class SanaMatchHandler(BaseHTTPRequestHandler):
        server_version = "SanaMatch/1.0"
        sys_version = ""

        def log_message(self, format_string, *args):
            # Access logs contain request paths only; request bodies and secrets are never logged.
            super().log_message(format_string, *args)

        def _send_json(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _send_api_error(self, error):
            self._send_json(error.status, {"error": {"code": error.code, "message": error.message}})

        def _read_json(self):
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type != "application/json":
                raise ApiError(415, "CONTENT_TYPE_REQUIRED", "Ожидается Content-Type: application/json.")
            length_header = self.headers.get("Content-Length")
            if length_header is None:
                raise ApiError(411, "CONTENT_LENGTH_REQUIRED", "Нужен Content-Length.")
            try:
                length = int(length_header)
            except ValueError:
                raise ApiError(400, "INVALID_CONTENT_LENGTH", "Некорректный Content-Length.")
            if length < 0:
                raise ApiError(400, "INVALID_CONTENT_LENGTH", "Некорректный Content-Length.")
            if length > MAX_BODY_BYTES:
                raise ApiError(413, "REQUEST_TOO_LARGE", "Размер запроса превышает допустимый предел.")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ApiError(400, "INVALID_BODY", "Тело запроса прочитано не полностью.")
            try:
                return json.loads(raw.decode("utf-8"), parse_constant=_reject_json_constant)
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                raise ApiError(400, "INVALID_JSON", "Тело запроса должно содержать корректный JSON.")

        def _send_static(self, path):
            filename = STATIC_FILES.get(path)
            if filename is None:
                self.send_error(404, "Not found")
                return
            root = Path(project_root).resolve()
            relative_path = Path(filename)
            candidate = root / relative_path
            cursor = root
            for part in relative_path.parts:
                cursor = cursor / part
                if cursor.is_symlink():
                    self.send_error(404, "Not found")
                    return
            if not candidate.is_file():
                self.send_error(404, "Not found")
                return
            try:
                resolved = candidate.resolve(strict=True)
                resolved.relative_to(root)
                body = resolved.read_bytes()
            except (OSError, ValueError):
                self.send_error(404, "Not found")
                return
            content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml"):
                content_type += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _dispatch(self, method):
            try:
                parsed = urlsplit(self.path)
                path = unquote(parsed.path)
                if not path.startswith("/api/") and path != "/api":
                    if method == "GET":
                        self._send_static(path)
                    else:
                        self.send_error(405, "Method not allowed")
                    return
                self._dispatch_api(method, path)
            except ApiError as error:
                self._send_api_error(error)
            except sqlite3.IntegrityError:
                self._send_api_error(ApiError(409, "CONFLICT", "Запись конфликтует с существующими данными."))
            except (sqlite3.Error, OSError):
                self._send_api_error(ApiError(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера."))
            except Exception:
                self._send_api_error(ApiError(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера."))

        def _dispatch_api(self, method, path):
            if path == "/api/health":
                if method != "GET":
                    raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
                config = ai_configuration(project_root, environment)
                self._send_json(
                    200,
                    {"status": "ok", "storage": "sqlite", "aiConfigured": ai_is_configured(config)},
                )
                return
            if path == "/api/tasks":
                if method == "GET":
                    self._send_json(200, {"tasks": list_tasks(db_path)})
                    return
                if method == "POST":
                    task = create_task(db_path, self._read_json())
                    self._send_json(201, {"task": task})
                    return
                raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
            task_match = re.fullmatch(r"/api/tasks/([^/]+)", path)
            if task_match:
                task_id = task_match.group(1)
                if not is_safe_id(task_id):
                    raise ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.")
                if method == "GET":
                    self._send_json(200, {"task": get_task(db_path, task_id)})
                    return
                if method == "PATCH":
                    task = patch_task(db_path, task_id, self._read_json())
                    self._send_json(200, {"task": task})
                    return
                raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
            if path == "/api/teams":
                if method != "GET":
                    raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
                self._send_json(200, {"teams": list_teams(db_path)})
                return
            if path == "/api/responses":
                if method == "GET":
                    self._send_json(200, {"responses": list_responses(db_path)})
                    return
                if method == "POST":
                    response = create_response(db_path, self._read_json())
                    self._send_json(201, {"response": response})
                    return
                raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
            response_match = re.fullmatch(r"/api/responses/([^/]+)", path)
            if response_match:
                response_id = response_match.group(1)
                if method != "PATCH":
                    raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
                response = patch_response(db_path, response_id, self._read_json())
                self._send_json(200, {"response": response})
                return
            if path == "/api/ai/chat":
                if method != "POST":
                    raise ApiError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута.")
                payload = _validate_ai_request(self._read_json())
                result = _ai_call(project_root, environment, ai_service_loader, payload)
                self._send_json(200, result)
                return
            raise ApiError(404, "NOT_FOUND", "Маршрут не найден.")

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_PATCH(self):
            self._dispatch("PATCH")

        def do_PUT(self):
            self._dispatch("PUT")

        def do_DELETE(self):
            self._dispatch("DELETE")

        def do_OPTIONS(self):
            self._dispatch("OPTIONS")

        def do_HEAD(self):
            self._dispatch("HEAD")

    return SanaMatchHandler


def make_server(
    host="127.0.0.1",
    port=DEFAULT_PORT,
    db_path=None,
    project_root=PROJECT_ROOT,
    environment=None,
    ai_service_loader=None,
):
    root = Path(project_root).resolve()
    env = load_environment(root, environment)
    database = Path(db_path).resolve() if db_path else resolve_database_path(root, env)
    initialize_database(database)
    loader = ai_service_loader or _load_ai_service
    handler = make_handler(database, root, env, loader)
    return SanaMatchHTTPServer((host, port), handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description="SanaMatch local demo API")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: localhost only)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    server = make_server(host=args.host, port=args.port)
    print("SanaMatch server listening at http://%s:%s" % (args.host, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping SanaMatch server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
