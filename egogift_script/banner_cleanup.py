import os, re, json

banner_dir  = r"C:\Git\yeon-sim\yeon-sim.github.io\static\images\banner"
theme_path  = r"C:\Git\yeon-sim\yeon-sim.github.io\data\theme.json"

# ── theme.json 로드 ──────────────────────────────────────────
with open(theme_path, encoding="utf-8") as f:
    themes = json.load(f)["dataList"]

def normalize(s):
    """공백·특수문자 제거 후 소문자"""
    return re.sub(r"[\s,.\-·]", "", s).lower()

# 정규화된 이름 → id 매핑
name_to_id = { normalize(t["name"]): str(t["id"]) for t in themes }

# ── 파일 분류 ────────────────────────────────────────────────
files = os.listdir(banner_dir)

old_files    = [f for f in files if f.endswith("_old.png")]
korean_files = [f for f in files
                if f.endswith(".png")
                and not f.endswith("_old.png")
                and f != "pack_default.png"
                and not re.match(r"^\d{4}\.png$", f)]

# ── 한글 → ID 매핑 확인 ──────────────────────────────────────
rename_plan = {}
unmatched   = []

for fname in korean_files:
    stem = os.path.splitext(fname)[0]
    key  = normalize(stem)
    if key in name_to_id:
        rename_plan[fname] = name_to_id[key] + ".png"
    else:
        unmatched.append(fname)

# ── 결과 출력 ────────────────────────────────────────────────
print(f"=== 삭제 대상 (_old): {len(old_files)}개 ===")
for f in sorted(old_files):
    print(f"  {f}")

print(f"\n=== 이름 변경 계획: {len(rename_plan)}개 ===")
for src, dst in sorted(rename_plan.items()):
    print(f"  {src} → {dst}")

if unmatched:
    print(f"\n=== 매핑 실패 (수동 확인 필요): {len(unmatched)}개 ===")
    for f in unmatched:
        print(f"  {f}")

# ── 실행 ─────────────────────────────────────────────────────
input("\n위 내용으로 진행합니다. Enter를 누르세요...")

deleted = renamed = err = 0

# 1) _old 삭제
for fname in old_files:
    path = os.path.join(banner_dir, fname)
    try:
        os.remove(path)
        deleted += 1
    except Exception as e:
        print(f"[ERR 삭제] {fname}: {e}")
        err += 1

# 2) 한글 → ID 이름 변경
for src, dst in rename_plan.items():
    src_path = os.path.join(banner_dir, src)
    dst_path = os.path.join(banner_dir, dst)
    if os.path.exists(dst_path):
        print(f"[SKIP] 이미 존재: {dst}")
        continue
    try:
        os.rename(src_path, dst_path)
        print(f"[OK] {src} → {dst}")
        renamed += 1
    except Exception as e:
        print(f"[ERR 변경] {src}: {e}")
        err += 1

print(f"\n완료: 삭제 {deleted}개 / 이름변경 {renamed}개 / 오류 {err}개")
