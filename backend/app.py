import json
import os
import subprocess
import datetime
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)
CONSTRAINTS_FILE = Path(__file__).with_name("constraints.json")
SUBJECTS_FILE = Path(__file__).with_name("subjects.json")
HISTORY_FILE = Path(__file__).with_name("history.json")
MAX_SUBJECTS = 10


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# Load local env files if present.
load_env_file(Path(__file__).with_name("key.env"))
load_env_file(Path(__file__).with_name(".env"))

BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "")
BACKBOARD_ASSISTANT_ID = os.getenv("BACKBOARD_ASSISTANT_ID", "")


def backboard_request(method: str, path: str, payload: dict | None = None):
    if not BACKBOARD_API_KEY or not BACKBOARD_ASSISTANT_ID:
        return None, "Backboard credentials not configured"

    url = f"https://app.backboard.io/api{path}"
    headers = {
        "X-API-Key": BACKBOARD_API_KEY,
        "Content-Type": "application/json",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}, None
    except urllib.error.HTTPError as exc:
        try:
            return None, exc.read().decode("utf-8")
        except Exception:
            return None, str(exc)
    except Exception as exc:
        return None, str(exc)


def load_constraints():
    if not CONSTRAINTS_FILE.exists():
        return []
    try:
        data = json.loads(CONSTRAINTS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, str)]
    return []


def save_constraints(slots):
    CONSTRAINTS_FILE.write_text(json.dumps(slots), encoding="utf-8")


def load_subjects():
    if not SUBJECTS_FILE.exists():
        return []
    try:
        data = json.loads(SUBJECTS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def save_subjects(subjects):
    SUBJECTS_FILE.write_text(json.dumps(subjects), encoding="utf-8")


def reset_backend_state():
    # Start each app run with a fresh working set.
    save_constraints([])
    save_subjects([])


def load_history():
    if not HISTORY_FILE.exists():
        return []
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def save_history(memories):
    HISTORY_FILE.write_text(json.dumps(memories), encoding="utf-8")


def add_history_record(record: dict):
    memories = load_history()
    payload = dict(record)
    payload.setdefault(
        "created_at", datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    )
    memories.append(payload)
    save_history(memories)
    return payload


def parse_entry_details(entry_text):
    cleaned = entry_text.strip()
    if not cleaned:
        return None

    # Theory + lab format:
    # Subject | Faculty | T:slot+slot ROOM Faculty Name | L:slot+slot ROOM Faculty Name
    if " | T:" in cleaned and " | L:" in cleaned:
        subject, faculty, remainder = cleaned.split(" | ", 2)
        if " | L:" not in remainder:
            return None
        theory_part, lab_part = remainder.split(" | L:", 1)
        theory_part = theory_part.replace("T:", "", 1).strip()
        lab_part = lab_part.strip()
        return {
            "subject": subject.strip(),
            "faculty": faculty.strip(),
            "theory": parse_slot_payload(theory_part),
            "lab": parse_slot_payload(lab_part),
        }

    # Theory only format:
    # Subject | slot+slot ROOM Faculty Name
    if " | " in cleaned:
        subject, payload = cleaned.split(" | ", 1)
        return {
            "subject": subject.strip(),
            "faculty": "",
            "theory": parse_slot_payload(payload),
            "lab": None,
        }

    return {
        "subject": cleaned,
        "faculty": "",
        "theory": None,
        "lab": None,
    }


def parse_slot_payload(payload_text):
    # payload looks like: "L31+L32 BMT101E Prof Name"
    payload = payload_text.strip()
    parts = payload.split()
    if len(parts) < 2:
        return {"slot": payload, "room": "", "faculty": ""}

    slot = parts[0]
    room = parts[1] if len(parts) >= 2 else ""
    faculty = " ".join(parts[2:]) if len(parts) > 2 else ""
    return {"slot": slot, "room": room, "faculty": faculty}


def parse_regex_output(output_text):
    combos = []
    current_combo = None
    message_lines = []

    for raw_line in output_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if line.startswith("Option ") and line.endswith(":"):
            if current_combo is not None:
                combos.append(current_combo)
            current_combo = {
                "title": line[:-1],
                "entries": [],
            }
            continue

        if line.startswith("  - "):
            if current_combo is not None:
                parsed = parse_entry_details(line[4:].strip())
                if parsed:
                    current_combo["entries"].append(parsed)
            continue

        if stripped and stripped not in ("Generating Timetables...",):
            message_lines.append(stripped)

    if current_combo is not None:
        combos.append(current_combo)

    return combos, message_lines


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/history", methods=["GET", "POST", "OPTIONS"])
def history_api():
    if request.method == "OPTIONS":
        return ("", 200)

    if request.method == "GET":
        source = request.args.get("source")
        if source == "local" or not BACKBOARD_API_KEY or not BACKBOARD_ASSISTANT_ID:
            return jsonify({"ok": True, "data": {"memories": load_history()}})
        data, error = backboard_request(
            "GET",
            f"/assistants/{BACKBOARD_ASSISTANT_ID}/memories",
        )
        if error:
            # Fall back to local history if Backboard fails.
            return jsonify(
                {"ok": True, "data": {"memories": load_history()}, "error": error}
            )
        return jsonify({"ok": True, "data": data})

    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    metadata = payload.get("metadata")

    if not isinstance(content, str) or not content.strip():
        return jsonify({"ok": False, "error": "content is required"}), 400

    body = {"content": content.strip()}
    if isinstance(metadata, dict):
        body["metadata"] = metadata

    if not BACKBOARD_API_KEY or not BACKBOARD_ASSISTANT_ID:
        record = add_history_record(body)
        return jsonify({"ok": True, "data": record})

    data, error = backboard_request(
        "POST",
        f"/assistants/{BACKBOARD_ASSISTANT_ID}/memories",
        body,
    )
    if error:
        # Fall back to local history if Backboard fails.
        record = add_history_record(body)
        return jsonify({"ok": True, "data": record, "error": error})
    return jsonify({"ok": True, "data": data})


@app.route("/history/clear", methods=["POST", "OPTIONS"])
def history_clear_api():
    if request.method == "OPTIONS":
        return ("", 200)

    # Always clear local history for the UI.
    deleted_count = len(load_history())
    save_history([])
    if not BACKBOARD_API_KEY or not BACKBOARD_ASSISTANT_ID:
        return jsonify({"ok": True, "deleted": deleted_count})

    data, error = backboard_request(
        "GET",
        f"/assistants/{BACKBOARD_ASSISTANT_ID}/memories",
    )
    if error:
        return jsonify({"ok": False, "error": error}), 500

    memories = data.get("memories", []) if isinstance(data, dict) else []
    failed = []
    for memory in memories:
        memory_id = memory.get("id") if isinstance(memory, dict) else None
        if not memory_id:
            continue
        _, delete_error = backboard_request(
            "DELETE",
            f"/assistants/{BACKBOARD_ASSISTANT_ID}/memories/{memory_id}",
        )
        if delete_error:
            failed.append(memory_id)

    if failed:
        return jsonify({"ok": False, "error": f"Failed to delete: {failed}"}), 500

    return jsonify({"ok": True, "deleted": len(memories), "local_deleted": deleted_count})


@app.route("/constraints", methods=["GET", "POST", "OPTIONS"])
def constraints_api():
    if request.method == "OPTIONS":
        return ("", 200)

    if request.method == "GET":
        return jsonify({"constraints": load_constraints()})

    payload = request.get_json(silent=True) or {}
    slots = payload.get("slots")

    if not isinstance(slots, list) or not all(isinstance(item, str) for item in slots):
        return jsonify({"error": "slots must be a list of strings"}), 400

    cleaned = []
    seen = set()
    for slot in slots:
        value = slot.strip()
        if not value or value in seen:
            continue
        cleaned.append(value)
        seen.add(value)

    save_constraints(cleaned)
    print("Updated constraints:", cleaned, flush=True)
    return jsonify({"ok": True, "constraints": cleaned})


@app.route("/subjects", methods=["GET", "POST", "DELETE", "OPTIONS"])
def subjects_api():
    if request.method == "OPTIONS":
        return ("", 200)

    if request.method == "GET":
        return jsonify({"subjects": load_subjects(), "max_subjects": MAX_SUBJECTS})

    if request.method == "DELETE":
        payload = request.get_json(silent=True) or {}
        subject_name = payload.get("subject_name")
        subjects = load_subjects()

        if not subject_name:
            save_subjects([])
            return jsonify({"ok": True, "subjects": []})

        filtered = [
            item for item in subjects if item.get("subject_name") != subject_name
        ]
        save_subjects(filtered)
        return jsonify({"ok": True, "subjects": filtered})

    payload = request.get_json(silent=True) or {}
    subject_name = payload.get("subject_name")
    subject_type = payload.get("subject_type")
    theory_faculties = payload.get("theory_faculties", [])
    lab_faculties = payload.get("lab_faculties", [])

    if not isinstance(subject_name, str) or not subject_name.strip():
        return jsonify({"error": "subject_name must be a non-empty string"}), 400

    if subject_type not in (1, 2, 3):
        return jsonify({"error": "subject_type must be 1, 2, or 3"}), 400

    if not isinstance(theory_faculties, list) or not all(
        isinstance(item, str) for item in theory_faculties
    ):
        return jsonify({"error": "theory_faculties must be a list of strings"}), 400

    if not isinstance(lab_faculties, list) or not all(
        isinstance(item, str) for item in lab_faculties
    ):
        return jsonify({"error": "lab_faculties must be a list of strings"}), 400

    cleaned_subject = {
        "subject_name": subject_name.strip(),
        "subject_type": subject_type,
        "theory_faculties": [item.strip() for item in theory_faculties if item.strip()],
        "lab_faculties": [item.strip() for item in lab_faculties if item.strip()],
    }

    if cleaned_subject["subject_type"] == 1:
        cleaned_subject["lab_faculties"] = []

    subjects = load_subjects()
    replaced = False
    for idx, existing in enumerate(subjects):
        if existing.get("subject_name") == cleaned_subject["subject_name"]:
            subjects[idx] = cleaned_subject
            replaced = True
            break

    if not replaced:
        if len(subjects) >= MAX_SUBJECTS:
            return jsonify({"error": "maximum 10 subjects allowed"}), 400
        subjects.append(cleaned_subject)

    save_subjects(subjects)
    print("Updated subjects:", subjects, flush=True)
    return jsonify({"ok": True, "subject": cleaned_subject, "subjects": subjects})


@app.route("/generate", methods=["GET", "OPTIONS"])
def generate_api():
    if request.method == "OPTIONS":
        return ("", 200)

    regex_path = Path(__file__).with_name("regex.py")
    run = subprocess.run(
        ["python", str(regex_path)],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).parent),
    )

    if run.returncode != 0:
        return jsonify({"ok": False, "error": run.stderr.strip() or "Failed to run regex.py"}), 500

    combos, messages = parse_regex_output(run.stdout)
    # Store a history record in Backboard (best-effort).
    history_payload = {
        "content": f"Generated {len(combos)} combos.",
        "metadata": {
            "constraints": load_constraints(),
            "subjects": [s.get("subject_name") for s in load_subjects()],
            "combo_count": len(combos),
            "sample_combos": combos[:5],
        },
    }
    history_error = None
    # Always write local history so the UI can reliably load it.
    add_history_record(history_payload)
    if BACKBOARD_API_KEY and BACKBOARD_ASSISTANT_ID:
        _, history_error = backboard_request(
            "POST",
            f"/assistants/{BACKBOARD_ASSISTANT_ID}/memories",
            history_payload,
        )
        if history_error:
            print("Backboard history error:", history_error, flush=True)
    return jsonify(
        {
            "ok": True,
            "combos": combos,
            "messages": messages,
            "raw_output": run.stdout,
            "history_error": history_error,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
