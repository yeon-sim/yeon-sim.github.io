import os
import json
import re

LANG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'lang')

for lang in sorted(os.listdir(LANG_DIR)):
    dir_path = os.path.join(LANG_DIR, lang)
    if not os.path.isdir(dir_path):
        continue

    prefix    = lang.upper()
    base_file = f"{prefix}_UnitKeyword.json"
    base_path = os.path.join(dir_path, base_file)
    pattern   = re.compile(rf"^{prefix}_UnitKeyword.*\.json$", re.IGNORECASE)

    all_files = sorted(f for f in os.listdir(dir_path) if pattern.match(f))
    add_files = [f for f in all_files if f != base_file]

    if not add_files:
        print(f"[{lang}] 추가 파일 없음, 건너뜀")
        continue

    if not os.path.exists(base_path):
        print(f"[{lang}] 기본 파일({base_file}) 없음, 건너뜀")
        continue

    with open(base_path, encoding="utf-8") as f:
        base = json.load(f)

    id_map = {item["id"]: item for item in base["dataList"]}

    for file in add_files:
        with open(os.path.join(dir_path, file), encoding="utf-8") as f:
            data = json.load(f)
        for item in data["dataList"]:
            id_map[item["id"]] = item
        print(f"  [{lang}] + {file} ({len(data['dataList'])}개)")

    merged = {"dataList": list(id_map.values())}
    with open(base_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"  [{lang}] {base_file} 저장 완료 (총 {len(merged['dataList'])}개 항목)\n")
