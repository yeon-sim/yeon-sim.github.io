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

import json, glob, sys
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = "static/font/logotypejp_mp_b_1.1.ttf"       # 원본(전체 글리프) — 유지
OUT = "static/font/logotypejp_mp_b_1.1.woff2"     # 서브셋 산출물 — 사이트가 참조
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

# 2) 항상 포함: ASCII 인쇄가능 문자(숫자·영문·기호 — JP 문장에 섞여 나옴)
chars.update(chr(c) for c in range(0x20, 0x7F))

codepoints = sorted(ord(c) for c in chars)
print(f"[수집] JP 파일 {files}개 → 고유 문자 {len(codepoints)}자")

# 3) 서브셋 → woff2
font = TTFont(SRC)
ss = subset.Subsetter(subset.Options(flavor="woff2", ignore_missing_unicodes=True))
ss.populate(unicodes=codepoints)
ss.subset(font)
font.flavor = "woff2"
font.save(OUT)

# 4) 결과 보고
import os
src_mb = os.path.getsize(SRC) / 1048576
out_kb = os.path.getsize(OUT) / 1024
print(f"[완료] {OUT}")
print(f"       원본 {src_mb:.2f}MB(ttf) → 서브셋 {out_kb:.0f}KB(woff2), 글리프 {font['maxp'].numGlyphs}개")
