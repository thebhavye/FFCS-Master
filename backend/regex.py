import json
import re
from pathlib import Path

CONSTRAINTS_FILE = Path(__file__).with_name("constraints.json")
SUBJECTS_FILE = Path(__file__).with_name("subjects.json")
MAX_TIMETABLE_OPTIONS = 500


def load_constraints():
    if not CONSTRAINTS_FILE.exists():
        return []

    try:
        raw_data = json.loads(CONSTRAINTS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(raw_data, list):
        return []

    normalized = []
    seen = set()

    for item in raw_data:
        if not isinstance(item, str):
            continue

        value = item.strip()
        if not value:
            continue

        if value not in seen:
            normalized.append(value)
            seen.add(value)

        # Timetable sends values like "L31+L32"; split so regex checks
        # against individual slots (L31, L32) can pass.
        for part in value.split("+"):
            slot = part.strip()
            if slot and slot not in seen:
                normalized.append(slot)
                seen.add(slot)

    return normalized


def load_subjects():
    if not SUBJECTS_FILE.exists():
        return []

    try:
        raw_data = json.loads(SUBJECTS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(raw_data, list):
        return []

    normalized_subjects = []
    for item in raw_data:
        if not isinstance(item, dict):
            continue

        subject_name = item.get("subject_name")
        subject_type = item.get("subject_type")
        theory_faculties = item.get("theory_faculties", [])
        lab_faculties = item.get("lab_faculties", [])

        if not isinstance(subject_name, str) or not subject_name.strip():
            continue
        if subject_type not in (1, 2, 3):
            continue
        if not isinstance(theory_faculties, list) or not all(
            isinstance(fac, str) for fac in theory_faculties
        ):
            continue
        if not isinstance(lab_faculties, list) or not all(
            isinstance(fac, str) for fac in lab_faculties
        ):
            continue

        cleaned = {
            "subject_name": subject_name.strip(),
            "subject_type": subject_type,
            "theory_faculties": [fac.strip() for fac in theory_faculties if fac.strip()],
            "lab_faculties": [fac.strip() for fac in lab_faculties if fac.strip()],
        }
        if cleaned["subject_type"] == 1:
            cleaned["lab_faculties"] = []

        normalized_subjects.append(cleaned)

    return normalized_subjects

from data import is_clash

sub_fac = [[] for i in range(10)] #x is subject, y is faculty

sub_slots = {
    #Morning
    "A1":  [("MON", 800, 850), ("WED", 900, 950)],
    "B1":  [("TUE", 800, 850), ("THU", 900, 950)],
    "C1":  [("WED", 800, 850), ("FRI", 900, 950)],
    "D1":  [("MON", 1000, 1050), ("THU", 800, 850)],
    "E1":  [("TUE", 1000, 1050), ("FRI", 800, 850)],
    "F1":  [("MON", 900, 950), ("WED", 1000, 1050)],
    "G1":  [("TUE", 900, 950), ("THU", 1000, 1050)],
    "TA1": [("FRI", 1000, 1050)],
    "TB1": [("MON", 1100, 1150)],
    "TC1": [("TUE", 1100, 1150)],
    "TD1": [("FRI", 1200, 1250)],
    "TE1": [("THU", 1100, 1150)],
    "TF1": [("FRI", 1100, 1150)],
    "TG1": [("MON", 1200, 1250)],
    "TAA1":[("TUE", 1200, 1250)],
    "TCC1":[("THU",1200,1250)],

    #Evening
    "A2":  [("MON", 1400, 1450), ("WED", 1500, 1550)],
    "B2":  [("TUE", 1400, 1450), ("THU", 1500, 1550)],
    "C2":  [("WED", 1400, 1450), ("FRI", 1500, 1550)],
    "D2":  [("MON", 1600, 1650), ("THU", 1400, 1450)],
    "E2":  [("TUE", 1600, 1650), ("FRI", 1400, 1450)],
    "F2":  [("MON", 1500, 1550), ("WED", 1600, 1650)],
    "G2":  [("TUE", 1500, 1550), ("THU", 1600, 1650)],
    "TA2": [("FRI", 1600, 1650)],
    "TB2": [("MON", 1700, 1750)],
    "TC2": [("TUE", 1700, 1750)],
    "TD2": [("WED", 1700, 1750)],
    "TE2": [("THU", 1700, 1750)],
    "TF2": [("FRI", 1700, 1750)],
    "TG2": [("MON", 1800, 1850)],
    "TAA2": [("TUE", 1800, 1850)],
    "TBB2": [("WED", 1800, 1850)],
    "TCC2": [("THU", 1800, 1850)],
    "TDD2": [("FRI", 1800, 1850)],

    # Monday
    "L1": [("MON", 800, 850)], "L2": [("MON", 851, 940)], "L3": [("MON", 951, 1040)],
    "L4": [("MON", 1041, 1130)], "L5": [("MON", 1140, 1230)], "L6": [("MON", 1231, 1320)],
    "L31": [("MON", 1400, 1450)], "L32": [("MON", 1451, 1540)], "L33": [("MON", 1551, 1640)],
    "L34": [("MON", 1641, 1730)], "L35": [("MON", 1740, 1830)], "L36": [("MON", 1831, 1920)],

    # Tuesday
    "L7": [("TUE", 800, 850)], "L8": [("TUE", 851, 940)], "L9": [("TUE", 951, 1040)],
    "L10": [("TUE", 1041, 1130)], "L11": [("TUE", 1140, 1230)], "L12": [("TUE", 1231, 1320)],
    "L37": [("TUE", 1400, 1450)], "L38": [("TUE", 1451, 1540)], "L39": [("TUE", 1551, 1640)],
    "L40": [("TUE", 1641, 1730)], "L41": [("TUE", 1740, 1830)], "L42": [("TUE", 1831, 1920)],

    # Wednesday
    "L13": [("WED", 800, 850)], "L14": [("WED", 851, 940)], "L15": [("WED", 951, 1040)],
    "L16": [("WED", 1041, 1130)], "L17": [("WED", 1140, 1230)], "L18": [("WED", 1231, 1320)],
    "L43": [("WED", 1400, 1450)], "L44": [("WED", 1451, 1540)], "L45": [("WED", 1551, 1640)],
    "L46": [("WED", 1641, 1730)], "L47": [("WED", 1740, 1830)], "L48": [("WED", 1831, 1920)],

    # Thursday
    "L19": [("THU", 800, 850)], "L20": [("THU", 851, 940)], "L21": [("THU", 951, 1040)],
    "L22": [("THU", 1041, 1130)], "L23": [("THU", 1140, 1230)], "L24": [("THU", 1231, 1320)],
    "L49": [("THU", 1400, 1450)], "L50": [("THU", 1451, 1540)], "L51": [("THU", 1551, 1640)],
    "L52": [("THU", 1641, 1730)], "L53": [("THU", 1740, 1830)], "L54": [("THU", 1831, 1920)],

    # Friday
    "L25": [("FRI", 800, 850)], "L26": [("FRI", 851, 940)], "L27": [("FRI", 951, 1040)],
    "L28": [("FRI", 1041, 1130)], "L29": [("FRI", 1140, 1230)], "L30": [("FRI", 1231, 1320)],
    "L55": [("FRI", 1400, 1450)], "L56": [("FRI", 1451, 1540)], "L57": [("FRI", 1551, 1640)],
    "L58": [("FRI", 1641, 1730)], "L59": [("FRI", 1740, 1830)], "L60": [("FRI", 1831, 1920)],

}






constraint = load_constraints()  # the constraints set by users
subject_inputs = load_subjects()[:10]  # hard cap: process max 10 subjects


FACULTY_ENTRY_PATTERN = re.compile(r"^(\S+)\s+\S+\s+(.*)$")


def normalize_faculty_name(name):
    return " ".join(name.upper().split())


def parse_faculty_entry(entry):
    if not isinstance(entry, str):
        return None

    text = entry.strip()
    if not text:
        return None

    match = FACULTY_ENTRY_PATTERN.search(text)
    if match:
        slot_token = match.group(1).strip()
        faculty = match.group(2).strip()
    else:
        parts = text.split(None, 1)
        if len(parts) < 2:
            return None
        slot_token = parts[0].strip()
        faculty = parts[1].strip()

    slots = [slot.strip() for slot in slot_token.split("+") if slot.strip()]
    if not slots or not faculty:
        return None

    return {
        "raw": text,
        "faculty": faculty,
        "faculty_key": normalize_faculty_name(faculty),
        "slots": slots,
    }


def split_constraint_slots():
    theory_slots = []
    lab_slots = []
    seen_theory = set()
    seen_lab = set()
    selected_slot_set = set()

    for slot in constraint:
        # Ignore composite strings like "L31+L32"; keep atomic known slots only.
        if slot not in sub_slots:
            continue
        selected_slot_set.add(slot)

        if slot.startswith("L"):
            if slot not in seen_lab:
                lab_slots.append(slot)
                seen_lab.add(slot)
        else:
            if slot not in seen_theory:
                theory_slots.append(slot)
                seen_theory.add(slot)

    return theory_slots, lab_slots, selected_slot_set


def option_has_internal_clash(slots):
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            if is_clash(slots[i], slots[j]):
                return True
    return False


def build_subject_options_from_backend():
    _, _, selected_slot_set = split_constraint_slots()
    backend_sub_fac = []

    for subject in subject_inputs:
        subject_name = subject.get("subject_name", "").strip()
        subject_type = subject.get("subject_type")
        theory_faculties = subject.get("theory_faculties", [])
        lab_faculties = subject.get("lab_faculties", [])

        options = []
        valid_theory_entries = []
        valid_lab_entries = []

        for entry in theory_faculties:
            parsed = parse_faculty_entry(entry)
            if parsed and all(slot in selected_slot_set for slot in parsed["slots"]):
                valid_theory_entries.append(parsed)

        for entry in lab_faculties:
            parsed = parse_faculty_entry(entry)
            if parsed and all(slot in selected_slot_set for slot in parsed["slots"]):
                valid_lab_entries.append(parsed)

        if subject_type == 1:
            for theory_entry in valid_theory_entries:
                theory_slots = theory_entry["slots"]
                if option_has_internal_clash(theory_slots):
                    continue
                options.append(
                    (
                        f"{subject_name} | {theory_entry['raw']}",
                        theory_slots,
                    )
                )
        elif subject_type in (2, 3):
            theory_by_faculty = {}
            lab_by_faculty = {}

            for entry in valid_theory_entries:
                theory_by_faculty.setdefault(entry["faculty_key"], []).append(entry)
            for entry in valid_lab_entries:
                lab_by_faculty.setdefault(entry["faculty_key"], []).append(entry)

            common_faculties = set(theory_by_faculty).intersection(lab_by_faculty)

            for faculty_key in common_faculties:
                for theory_entry in theory_by_faculty[faculty_key]:
                    for lab_entry in lab_by_faculty[faculty_key]:
                        merged_slots = []
                        seen_slots = set()
                        for slot in theory_entry["slots"] + lab_entry["slots"]:
                            if slot not in seen_slots:
                                merged_slots.append(slot)
                                seen_slots.add(slot)

                        if option_has_internal_clash(merged_slots):
                            continue

                        options.append(
                            (
                                f"{subject_name} | {theory_entry['faculty']} | T:{theory_entry['raw']} | L:{lab_entry['raw']}",
                                merged_slots,
                            )
                        )

        backend_sub_fac.append(options)

    return backend_sub_fac


sub_fac = build_subject_options_from_backend()


# --- CLASH ENGINE INTEGRATION ---


def solve_pnc(sub_idx, current_schedule, current_occupied_slots, active_subs):
    # Base Case: All subjects processed
    if sub_idx == len(active_subs):
        return [current_schedule]

    all_valid = []
    
    # fac_name is the key (Faculty), fac_slots is the list of slots
    for fac_name, fac_slots in active_subs[sub_idx]:
        has_conflict = False
        
        # Check if any slot of this new faculty clashes with slots already picked
        for new_slot in fac_slots:
            for existing_slot in current_occupied_slots:
                if is_clash(new_slot, existing_slot):
                    has_conflict = True
                    break
            if has_conflict: break
            
        if not has_conflict:
            # Recursive call: Move to next subject (sub_idx + 1)
            res = solve_pnc(
                sub_idx + 1, 
                current_schedule + [fac_name], 
                current_occupied_slots + fac_slots, 
                active_subs
            )
            if res:
                all_valid.extend(res)
            
            # Limit total solutions for performance.
            if len(all_valid) >= MAX_TIMETABLE_OPTIONS:
                return all_valid
                
    return all_valid

# --- TRIGGERING THE ENGINE ---

# 1. Prepare active_subs and check for completeness
active_subs = sub_fac
failed_subject = (not active_subs) or any(len(options) == 0 for options in active_subs)

# 2. Final Output Logic
if failed_subject:
    print("\nNO TABLE POSSIBLE")
    print("Reason: Missing subjects, missing faculties, or no matching slots in selected constraints.")
else:
    print("\nGenerating Timetables...")
    results = solve_pnc(0, [], [], active_subs)

    if not results:
        print("\nNO TABLE POSSIBLE")
        print("Reason: All combinations result in a time clash.")
    else:
        print(f"\nFound {len(results)} valid timetables:")
        for i, timetable in enumerate(results):
            print(f"\nOption {i+1}:")
            for selection in timetable:
                print(f"  - {selection}")

