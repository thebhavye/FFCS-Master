import json
import os
import subprocess
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)
CONSTRAINTS_FILE = Path(__file__).with_name("constraints.json")
SUBJECTS_FILE = Path(__file__).with_name("subjects.json")
MAX_SUBJECTS = 10


def load_constraints():
    if not CONSTRAINTS_FILE.exists():
        return []
    try:
        data = json.loads(CONSTRAINTS_FILE.read_text(encoding="utf-8-sig"))
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
        data = json.loads(SUBJECTS_FILE.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def save_subjects(subjects):
    SUBJECTS_FILE.write_text(json.dumps(subjects), encoding="utf-8")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


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


FACULTY_OPTIONS_FILE = Path(__file__).with_name("facultyOptions.json")


@app.route("/faculty-options", methods=["GET", "OPTIONS"])
def faculty_options_api():
    if request.method == "OPTIONS":
        return ("", 200)
    if not FACULTY_OPTIONS_FILE.exists():
        print(f"[WARN] facultyOptions.json not found at {FACULTY_OPTIONS_FILE}", flush=True)
        return jsonify({}), 200
    try:
        data = json.loads(FACULTY_OPTIONS_FILE.read_text(encoding="utf-8-sig"))
        print(f"[INFO] Served faculty options with {len(data)} subjects", flush=True)
    except json.JSONDecodeError as e:
        print(f"[ERROR] facultyOptions.json parse error: {e}", flush=True)
        return jsonify({}), 200
    return jsonify(data)


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
    return jsonify({"ok": True, "combos": combos, "messages": messages, "raw_output": run.stdout})


def parse_entry_details(entry_text):
    cleaned = entry_text.strip()
    if not cleaned:
        return None

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

    if " | " in cleaned:
        subject, payload = cleaned.split(" | ", 1)
        return {
            "subject": subject.strip(),
            "faculty": "",
            "theory": parse_slot_payload(payload),
            "lab": None,
        }

    return {"subject": cleaned, "faculty": "", "theory": None, "lab": None}


def parse_slot_payload(payload_text):
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
            current_combo = {"title": line[:-1], "entries": []}
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




if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))


@app.route("/")
def home():
    return "FFCS Backend is running"
