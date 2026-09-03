#!/usr/bin/env python3
# Corporate Logo Bold 라틴 서브셋 생성기.
#
# 원본(static/font/Corporate-Logo-Bold-ver2.otf, 유지)에서 라틴 영역만 남긴
# woff2(static/font/Corporate-Logo-Bold-latin.woff2)를 만든다.
#
# 왜 필요한가:
#   KOTRA_BOLD 는 Latin Extended-A/B 글리프가 전혀 없다(실측 0/128, 0/208).
#   그래서 'Ryōshū'(료슈 영문 표기) 의 ō(U+014D)·ū(U+016B) 만 시스템 폰트로 폴백되어
#   같은 단어 안에서 자형·굵기가 어긋나 보였다. 마크론만 다른 폰트로 채우면
#   여전히 이질적이므로, 라틴 영역 전체를 이 폰트가 담당한다.
#
# ⚠️ 원본은 2MB(전체 일본어 글리프 포함)라 그대로 쓰면 안 된다. 라틴만 남기면 수십 KB.
# ⚠️ JP 레이어(logotypejp_mp_b_1.1)와는 별개다. 같은 서체 계열이지만 그쪽엔 마크론이 없다.
#
# 재생성 필요 시점: 거의 없음. 코드포인트 "범위" 기준이라 data/ 가 바뀌어도 영향 없다
#   (문자 수집 기반인 subset-jp-font.py 와 다른 점).
#
# 실행: yeon-sim.github.io/ 에서  python scripts/subset-latin-font.py
# 요구: fonttools + brotli (설치돼 있음)

import os
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = "static/font/Corporate-Logo-Bold-ver2.otf"        # 원본(전체 글리프) — 유지
OUT = "static/font/Corporate-Logo-Bold-latin.woff2"     # 서브셋 산출물 — 사이트가 참조

# style.css 의 라틴 레이어 unicode-range 와 동일하게 유지할 것
RANGES = [
    (0x0020, 0x007E),   # Basic Latin (영문·숫자·기호)
    (0x00A0, 0x00FF),   # Latin-1 Supplement
    (0x0100, 0x017F),   # Latin Extended-A  ← ō(014D) ū(016B)
    (0x0180, 0x024F),   # Latin Extended-B
    (0x2000, 0x206F),   # General Punctuation (– — ' " … 등)
]

codepoints = [c for lo, hi in RANGES for c in range(lo, hi + 1)]

font = TTFont(SRC)
have = set(font.getBestCmap())
present = [c for c in codepoints if c in have]
print(f"[대상] 라틴 범위 {len(codepoints)}개 중 원본 보유 {len(present)}개")
for name, lo, hi in [("Latin Ext-A", 0x0100, 0x017F), ("Latin Ext-B", 0x0180, 0x024F)]:
    n = sum(1 for c in present if lo <= c <= hi)
    print(f"       {name}: {n}개")
for c in (0x014D, 0x016B):
    print(f"       U+{c:04X} {chr(c)}: {'보유' if c in have else '없음 ← 문제'}")

ss = subset.Subsetter(subset.Options(flavor="woff2", ignore_missing_unicodes=True))
ss.populate(unicodes=present)
ss.subset(font)
font.flavor = "woff2"
font.save(OUT)

src_mb = os.path.getsize(SRC) / 1048576
out_kb = os.path.getsize(OUT) / 1024
print(f"[완료] {OUT}")
print(f"       원본 {src_mb:.2f}MB(otf) → 서브셋 {out_kb:.0f}KB(woff2), 글리프 {font['maxp'].numGlyphs}개")
