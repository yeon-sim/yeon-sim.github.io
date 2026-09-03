#!/usr/bin/env python3
# logotypejp 일본어 폰트 서브셋 생성기.
#
# 원본(static/font/logotypejp_mp_b_1.1.ttf, 유지)에서, 사이트가 실제 표시하는
# 일본어 문자만 남긴 woff2(static/font/logotypejp_mp_b_1.1.woff2)를 만든다.
# 이 폰트는 KOTRA_BOLD 스택의 "일본어 레이어"라 data/lang/jp 의 모든 표시 텍스트가 대상.
#
# ⚠️ 재생성 필요 시점: data/lang/jp 에 새 일본어 텍스트(신규 인격·기프트·키워드 등)가
#    추가되면, 서브셋 밖 글자는 폴백 폰트로 떨어진다. 그때 이 스크립트를 다시 실행.
#
# 실행: yeon-sim.github.io/ 에서  python scripts/subset-jp-font.py
# 요구: fonttools + brotli (설치돼 있음)

import json, glob, re, sys
from fontTools.ttLib import TTFont
from fontTools import subset

# 구멍 보고가 일본어 글자를 찍으므로 콘솔이 cp949 여도 죽지 않게 (Windows)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SRC = "static/font/logotypejp_mp_b_1.1.ttf"       # 원본(전체 글리프) — 유지
OUT = "static/font/logotypejp_mp_b_1.1.woff2"     # ① 서브셋 — 사이트 문안 전용(기본 티어)
OUT_FULL = "static/font/logotypejp_mp_b_1.1-full.woff2"  # ② 전체 티어 — 사용자가 직접 입력한 일본어용(지연 로딩)
JP_GLOB = "data/lang/jp/**/*.json"

# 1) data/lang/jp 전체 문자열에서 사용 문자 수집
chars = set()
files = 0
for path in glob.glob(JP_GLOB, recursive=True):
    files += 1
    with open(path, encoding="utf-8") as fh:
        stack = [json.load(fh)]
    while stack:
        v = stack.pop()
        if isinstance(v, str):
            chars.update(v)
        elif isinstance(v, dict):
            stack.extend(v.values())
        elif isinstance(v, list):
            stack.extend(v)

# 2) data/lang/jp 밖의 일본어 출처도 수집
#    ⚠️ 사이트 자체 문안(번역 페이지·템플릿 인라인)은 lang 데이터에 없다.
#       빠뜨리면 해당 글자만 폴백 폰트로 떨어져 자형이 어긋난다(실제로 10자 누락 사고).
extra_files = sorted(glob.glob("content/i18n/*-jp.md"))
for path in extra_files:
    with open(path, encoding="utf-8") as fh:
        chars.update(fh.read())

# 사이트 JS 자산의 일본어 문안 (예: default-presets-config.js 의 기본 프리셋 이름)
#   ⚠️ lang 데이터가 아니라 코드에 들어 있어 JP_GLOB 에 안 걸린다. 빠뜨리면 폴백 폰트로 떨어진다.
js_files = sorted(glob.glob("assets/js/*.js"))
for path in js_files:
    with open(path, encoding="utf-8") as fh:
        chars.update(fh.read())

# 템플릿 인라인 번역(data-jp="...") — 현재 browse 목록 페이지
tmpl_hits = 0
for path in glob.glob("layouts/**/*.html", recursive=True):
    with open(path, encoding="utf-8") as fh:
        for m in re.findall(r'data-jp="([^"]*)"', fh.read()):
            chars.update(m)
            tmpl_hits += 1
print(f"[수집] 번역 페이지 {len(extra_files)}개 · JS 자산 {len(js_files)}개 · 템플릿 data-jp {tmpl_hits}건 추가")

# 3) 항상 포함
#    · ASCII 인쇄가능 문자(숫자·영문·기호 — JP 문장에 섞여 나옴)
#    · 가나 전체 + CJK 구두점 + 전각/반각 폼
#      스캔 결과와 무관하게 넣는다. 6KB 남짓이라 사실상 공짜인데,
#      앞으로 일본어 문안을 추가할 때 가나 누락 사고가 원천적으로 사라진다.
scanned = set(chars)   # 구멍 보고용 — 실제 사용 문자만(아래 ALWAYS 는 폰트에 없어도 정상)
chars.update(chr(c) for c in range(0x20, 0x7F))
ALWAYS = [(0x3000, 0x303F), (0x3040, 0x30FF), (0x31F0, 0x31FF), (0xFF00, 0xFF9F)]
for a, b in ALWAYS:
    chars.update(chr(c) for c in range(a, b + 1))

codepoints = sorted(ord(c) for c in chars)
print(f"[수집] JP 파일 {files}개 → 고유 문자 {len(codepoints)}자")

# 4) 서브셋 → woff2
def build(unicodes, out):
    font = TTFont(SRC)
    ss = subset.Subsetter(subset.Options(flavor="woff2", ignore_missing_unicodes=True))
    ss.populate(unicodes=unicodes)
    ss.subset(font)
    font.flavor = "woff2"
    font.save(out)
    return font["maxp"].numGlyphs

n_sub = build(codepoints, OUT)

# ② 전체 티어 — 사용자가 직접 입력한 일본어(프리셋 이름 등)용.
#    사이트 문안은 ① 이 전부 커버하므로, 이 파일은 "① 에 없는 글자가 실제로 화면에 나올 때만"
#    브라우저가 내려받는다(CSS 폰트 매칭은 글자 단위). 그래서 크지만 평소엔 요청 0건.
#    ⚠️ style.css 의 @font-face 에 반드시 unicode-range 를 걸 것 —
#       안 걸면 이모지 등 이 폰트에 없는 글자에서도 후보로 잡혀 1MB 를 받는다.
JP_RANGES = [(0x3000, 0x303F), (0x3040, 0x30FF), (0x31F0, 0x31FF),
             (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0xFF00, 0xFFEF)]
full_cps = sorted({c for a, b in JP_RANGES for c in range(a, b + 1)})
n_full = build(full_cps, OUT_FULL)

# 5) 결과 보고
import os
src_mb = os.path.getsize(SRC) / 1048576
print(f"[완료] 원본 {src_mb:.2f}MB(ttf)")
print(f"       ① {OUT}")
print(f"          {os.path.getsize(OUT)/1024:.0f}KB · 글리프 {n_sub}개  (사이트 문안 + 가나 전체)")
print(f"       ② {OUT_FULL}")
print(f"          {os.path.getsize(OUT_FULL)/1024:.0f}KB · 글리프 {n_full}개  (사용자 입력용 · 지연 로딩)")

# 6) 구멍 보고 — 사이트 문안인데 두 티어 모두에 없는 글자.
#    이런 글자는 style.css 의 'logotypejp-full' unicode-range 에 들어 있으면
#    매번 1MB 를 받고도 시스템 폰트로 떨어진다(순수 낭비). 나오면 그 코드포인트를
#    unicode-range 에서 구멍으로 빼야 한다(현재 U+63B7 '揷' 가 그렇게 처리돼 있다).
have = set(TTFont(OUT).getBestCmap()) | set(TTFont(OUT_FULL).getBestCmap())
holes = sorted({ord(c) for c in scanned if any(a <= ord(c) <= b for a, b in JP_RANGES) and ord(c) not in have})
if holes:
    print("[경고] 두 티어 모두 미커버(원본 폰트에 없음). unicode-range 에서 제외 검토:")
    for c in holes:
        print(f"       {chr(c)} U+{c:04X}")
else:
    print("[확인] 사이트 JP 문안은 모두 커버됨")
