"""
gift 디렉토리의 KR_EGOgift*.json 파일을 통합하여
egogifts.json을 출력합니다.

- id 필터 없음 (결과 파일을 직접 수정하세요)
- keyword 디렉토리의 키워드로 desc 치환
- 카테고리 자동 배정 (KR_EgoGiftCategory.json 참조)
- simpleDesc 제외, name/desc/category/grade만 포함
- grade 기본값: "-" (1, 2, 3, 4, 5, ex 중 하나로 수동 설정)
- 5자리 id(강화 gift)는 기본 gift의 upgrade 칼럼에 레벨별로 병합
  (예: id 11234 → id 1234의 upgrade["1"])

실행 위치: egogift_script/
출력 파일: egogift_script/egogifts.json
"""

import json
import os
import re

GIFT_DIR        = os.path.join(os.path.dirname(__file__), "gift")
KEYWORD_DIR     = os.path.join(os.path.dirname(__file__), "keyword")
OUTPUT_FILE     = os.path.join(os.path.dirname(__file__), "egogifts.json")
BLACKLIST_FILE  = os.path.join(os.path.dirname(__file__), "gift_blacklist.json")
WHITELIST_FILE  = os.path.join(os.path.dirname(__file__), "gift_whitelist.json")

CATEGORY_FILE = os.path.join(GIFT_DIR, "KR_EgoGiftCategory.json")

ASCII_KW  = re.compile(r"\[([A-Za-z_]+)\]")
# 완전 제거할 태그 (태그 전체 삭제, 내용 유지)
REMOVE_TAGS = re.compile(
    r'<style="[^"]*">'          # <style="...">
    r'|</style>'                 # </style>
    r'|</?noparse>'              # <noparse> / </noparse>
    r'|<color=#[0-9a-fA-F]+>'   # <color=#rrggbb>
    r'|</color>'                 # </color>
    r'|</?i>'                    # <i> / </i>
)
# 한글 포함 커스텀 태그: 꺽쇠만 제거하고 내용 유지 (<혈귀> → 혈귀)
KOREAN_TAG = re.compile(r'<([^a-zA-Z/<>][^>]*)>')


# ── 0. 블랙리스트 로드 ────────────────────────────────────────────

def load_blacklist():
    if not os.path.exists(BLACKLIST_FILE):
        return set()
    with open(BLACKLIST_FILE, encoding="utf-8") as f:
        data = json.load(f)
    ids = {item["id"] for item in data.get("dataList", [])}
    print(f"블랙리스트 로드: {len(ids)}개")
    return ids


# ── 0-1. 화이트리스트 로드 ───────────────────────────────────────

def load_whitelist():
    if not os.path.exists(WHITELIST_FILE):
        return {}
    with open(WHITELIST_FILE, encoding="utf-8") as f:
        data = json.load(f)
    overrides = {item["id"]: item for item in data.get("dataList", [])}
    print(f"화이트리스트 로드: {len(overrides)}개")
    return overrides


# ── 1. 키워드 맵 로드 ─────────────────────────────────────────────

def load_keywords():
    keyword_map = {}
    files = sorted(f for f in os.listdir(KEYWORD_DIR) if f.endswith(".json"))
    for fname in files:
        with open(os.path.join(KEYWORD_DIR, fname), encoding="utf-8") as f:
            data = json.load(f)
        for item in data.get("dataList", []):
            kw_id = item.get("id")
            kw_name = item.get("name")
            if kw_id and kw_name and kw_id not in keyword_map:
                keyword_map[kw_id] = kw_name
    print(f"키워드 로드: {len(keyword_map)}개 ({len(files)}개 파일)")
    return keyword_map


# ── 2. 카테고리 로드 ──────────────────────────────────────────────

def load_categories():
    if not os.path.exists(CATEGORY_FILE):
        print(f"[경고] 카테고리 파일 없음: {CATEGORY_FILE}")
        return [], []
    with open(CATEGORY_FILE, encoding="utf-8") as f:
        data = json.load(f)
    categories = [
        {"id": item["id"], "name": item["name"]}
        for item in data.get("dataList", [])
    ]
    category_ids = [c["id"] for c in categories if c["id"] != "None"]
    print(f"카테고리 로드: {len(categories)}개")
    return categories, category_ids


# ── 3. desc 처리 함수 ─────────────────────────────────────────────

def resolve_desc(desc, keyword_map):
    desc = REMOVE_TAGS.sub("", desc)
    desc = ASCII_KW.sub(lambda m: keyword_map.get(m.group(1), m.group(0)), desc)
    return desc

IGNORE_CATEGORIES = {"Random"}

def assign_category(desc_raw, categories, category_ids):
    found = ASCII_KW.findall(desc_raw)
    for kw in found:
        if kw in category_ids and kw not in IGNORE_CATEGORIES:
            return kw
    for cat in categories:
        if cat["id"] in ("None", *IGNORE_CATEGORIES):
            continue
        if cat["name"] in desc_raw:
            return cat["id"]
    return "None"


# ── 4. gift 파일 통합 ─────────────────────────────────────────────

def parse_item(item, keyword_map, categories, category_ids, whitelist):
    """단일 gift 항목을 파싱하여 dict 반환."""
    item_id = item["id"]
    desc_raw = item.get("desc", "")
    parsed = {
        "name": item["name"],
        "category": assign_category(desc_raw, categories, category_ids),
        "desc": resolve_desc(desc_raw, keyword_map),
        "grade": "-",
        "difficulty": "normal",
        "tags": [],
        "packs": [],
    }
    if item_id in whitelist:
        override = whitelist[item_id]
        for field in ("name", "category", "desc", "grade", "difficulty", "tags", "packs"):
            if field in override:
                parsed[field] = override[field]
    return parsed


def load_gifts(keyword_map, categories, category_ids, blacklist, whitelist):
    files = sorted(
        f for f in os.listdir(GIFT_DIR)
        if f.startswith("KR_EGOgift_") and f.endswith(".json")
    )

    base_gifts = {}   # id(4자리) → parsed dict
    upgrades = {}     # base_id → { level(str) → parsed dict }

    for fname in files:
        with open(os.path.join(GIFT_DIR, fname), encoding="utf-8") as f:
            data = json.load(f)
        for item in data.get("dataList", []):
            item_id = item.get("id")
            if item_id is None:
                continue
            if item_id in blacklist:
                continue

            if 1000 <= item_id <= 9999:
                # 기본 gift (4자리)
                if item_id in base_gifts:
                    continue
                parsed = parse_item(item, keyword_map, categories, category_ids, whitelist)
                parsed["id"] = item_id
                base_gifts[item_id] = parsed

            elif 10000 <= item_id <= 99999:
                # 강화 gift (5자리): 첫 자리 = 강화 레벨, 나머지 4자리 = 기본 ID
                level = item_id // 10000
                base_id = item_id % 10000
                if base_id not in upgrades:
                    upgrades[base_id] = {}
                level_key = str(level)
                if level_key in upgrades[base_id]:
                    continue
                parsed = parse_item(item, keyword_map, categories, category_ids, whitelist)
                upgrades[base_id][level_key] = parsed

    # 강화 데이터를 기본 gift의 upgrade 칼럼에 병합 (레벨 순 정렬 배열)
    UPGRADE_EXCLUDE = {"grade", "difficulty", "packs"}
    for base_id, levels in upgrades.items():
        if base_id not in base_gifts:
            continue
        base_gifts[base_id]["upgrade"] = [
            {k: v for k, v in upg.items() if k not in UPGRADE_EXCLUDE}
            for _, upg in sorted(levels.items())
        ]

    return sorted(base_gifts.values(), key=lambda x: x["id"])


# ── 5. 검증 및 저장 ───────────────────────────────────────────────

def main():
    blacklist = load_blacklist()
    whitelist = load_whitelist()
    keyword_map = load_keywords()
    categories, category_ids = load_categories()
    gifts = load_gifts(keyword_map, categories, category_ids, blacklist, whitelist)

    upgraded_count = sum(1 for g in gifts if "upgrade" in g)
    print(f"EGO 선물 수집: {len(gifts)}개 (강화 보유: {upgraded_count}개)")

    # 카테고리 분포
    cat_name = {c["id"]: c["name"] for c in categories}
    dist = {}
    for g in gifts:
        c = g["category"]
        dist[c] = dist.get(c, 0) + 1
    for cid, cnt in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"  {cat_name.get(cid, cid)}: {cnt}개")

    # 미해소 키워드 경고 (기본 + 강화 desc 모두 검사)
    unresolved = set()
    for g in gifts:
        unresolved.update(ASCII_KW.findall(g["desc"]))
        for upg in g.get("upgrade", []):
            unresolved.update(ASCII_KW.findall(upg["desc"]))
    if unresolved:
        print(f"[경고] 미해소 키워드 {len(unresolved)}개: {sorted(unresolved)}")
    else:
        print("키워드 치환: 모두 해소 완료")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"dataList": gifts}, f, ensure_ascii=False, indent=2)
    print(f"저장: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
