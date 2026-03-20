"""
keyword 디렉토리의 KR_BattleKeywords*.json 파일을 통합하여
keywords.json을 출력합니다.

실행 위치: egogift_script/
출력 파일: egogift_script/keywords.json
"""

import json
import os

KEYWORD_DIR = os.path.join(os.path.dirname(__file__), "keyword")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "keywords.json")


def main():
    files = sorted(
        f for f in os.listdir(KEYWORD_DIR)
        if f.endswith(".json")
    )

    keyword_map = {}
    for fname in files:
        path = os.path.join(KEYWORD_DIR, fname)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for item in data.get("dataList", []):
            kw_id = item.get("id")
            kw_name = item.get("name")
            if kw_id and kw_name and kw_id not in keyword_map:
                keyword_map[kw_id] = kw_name

    result = {"dataList": [{"id": k, "name": v} for k, v in sorted(keyword_map.items())]}

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"키워드 수집: {len(keyword_map)}개 ({len(files)}개 파일)")
    print(f"저장: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
