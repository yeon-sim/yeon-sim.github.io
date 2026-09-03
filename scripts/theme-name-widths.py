#!/usr/bin/env python3
# 테마팩 이름 목록 + 언어별 렌더 폭 측정 → scripts/theme-names-en.txt
#
# 용도: 테마팩 배너 이미지(static/images/banner/{id}.png, 617x240)를 언어별로 만들 때
#       문자열이 얼마나 길어지는지 미리 파악하기 위한 것.
#
# 폰트: KR·EN = KOTRA_BOLD / JP = logotypejp_mp_b_1.1  (사이트 스택과 동일한 배분)
#   ⚠️ KOTRA_BOLD 는 가나·한자를 빈 글리프로만 갖고(ア=0.098em) 실제로는 못 쓴다. JP 는 반드시 별도 폰트.
#
# 측정: advance width 합 + legacy kern 페어 커닝.
#   · KOTRA_BOLD  kern 1901쌍 (+GPOS/kern, 보통 동일 데이터라 legacy 만 적용)
#   · logotypejp  커닝 테이블 없음 → advance 합이 곧 정확한 폭
#   ⚠️ 폭은 "font-size 100px 기준". 실제 크기 S 에서는  폭 x S/100.
#   ⚠️ KR/EN 과 JP 는 폰트가 달라 같은 크기라도 글자가 커 보이는 정도가 다르다
#      (대문자 A: KOTRA 0.872em vs logotypejp 0.696em). 비율은 참고치로 볼 것.
#
# 실행: yeon-sim.github.io/ 에서  python scripts/theme-name-widths.py

import json
import os
import re
from fontTools.ttLib import TTFont

FONTS = {
    "kr": ("KOTRA_BOLD", "static/font/KOTRA_BOLD.ttf"),
    "en": ("KOTRA_BOLD", "static/font/KOTRA_BOLD.ttf"),
    "jp": ("logotypejp_mp_b_1.1", "static/font/logotypejp_mp_b_1.1.ttf"),
}
OUT = "scripts/theme-names-en.txt"
REF = 100.0
BANNER = (617, 240)


class Measurer:
    def __init__(self, path):
        self.font = TTFont(path, lazy=True)
        self.upm = self.font['head'].unitsPerEm
        self.cmap = self.font.getBestCmap()
        self.hmtx = self.font['hmtx']
        self.kern = {}
        if 'kern' in self.font:
            for st in self.font['kern'].kernTables:
                self.kern.update(st.kernTable)

    def width(self, text, size=REF):
        glyphs, missing = [], []
        for ch in text:
            g = self.cmap.get(ord(ch))
            (glyphs if g else missing).append(g or ch)
        units = sum(self.hmtx[g][0] for g in glyphs)
        for a, b in zip(glyphs, glyphs[1:]):
            units += self.kern.get((a, b), 0)
        return units / self.upm * size, missing


M = {lc: Measurer(p) for lc, (_, p) in FONTS.items()}

read = lambda p: json.load(open(p, encoding="utf-8"))
rows = lambda lc: read(f"data/lang/{lc}/{lc.upper()}_MirrorDungeonTheme-1.json")["dataList"]
DATA = {lc: {str(r["id"]): r for r in rows(lc)} for lc in ("kr", "en", "jp")}

used = set()
for f in os.listdir("data/floor_data"):
    if f.endswith(".json"):
        for t in read(f"data/floor_data/{f}").get("list", []):
            used.add(str(t["id"]))

strip = lambda s: re.sub(r"<[^>]*>", "", s or "")


def text_of(lc, i):
    r = DATA[lc].get(i) or {}
    return strip(r.get("specialName") or r.get("name") or "")


ids = [i for i in sorted(DATA["en"], key=int) if i in used]

recs = []
for i in ids:
    rec = {"id": i}
    for lc in ("kr", "en", "jp"):
        t = text_of(lc, i)
        w, miss = M[lc].width(t)
        rec[lc] = t
        rec[lc + "_w"] = w
        rec[lc + "_miss"] = miss
    rec["r_en"] = rec["en_w"] / rec["kr_w"] if rec["kr_w"] else 0
    rec["r_jp"] = rec["jp_w"] / rec["kr_w"] if rec["kr_w"] else 0
    recs.append(rec)

out = []
A = out.append
A("테마팩 이름 + 언어별 렌더 폭")
A("생성: scripts/theme-name-widths.py")
A("")
A(f"· 폭 단위 = font-size {REF:g}px 기준 px. 실제 크기 S 에서는  폭 x S/{REF:g}.")
A(f"· 배너 규격: {BANNER[0]}x{BANNER[1]} (static/images/banner/{{id}}.png)")
A(f"· 폰트  KR/EN = {FONTS['kr'][0]}  ·  JP = {FONTS['jp'][0]}")
A(f"  (KOTRA_BOLD 는 가나·한자를 빈 글리프로만 보유해 JP 에 쓸 수 없다)")
A("· 커닝  KOTRA_BOLD 1901쌍 반영 / logotypejp 커닝 테이블 없음(advance 합 = 정확)")
A("· 색상 태그(<color=...>)는 폭 계산에서 제외.")
A("⚠ KR/EN 과 JP 는 폰트가 달라 같은 크기라도 글자 크기 인상이 다르다(A: 0.872em vs 0.696em).")
A("  JP 비율은 '같은 font-size 에서의 폭 비교'일 뿐 시각적 크기 비교가 아니다.")
A("")

A(f"[전체] {len(recs)}종   ─ EN비 = EN폭/KR폭,  JP비 = JP폭/KR폭")
A("-" * 118)
A(f"  {'id':<6}{'KR':<24}{'KR폭':>8}  {'EN':<38}{'EN폭':>8}{'EN비':>7}  {'JP':<22}{'JP폭':>8}{'JP비':>7}")
for r in recs:
    A(f"  {r['id']:<6}{r['kr'][:22]:<24}{r['kr_w']:>7.0f}px  {r['en'][:36]:<38}{r['en_w']:>7.0f}px{r['r_en']:>6.2f}x  "
      f"{r['jp'][:20]:<22}{r['jp_w']:>7.0f}px{r['r_jp']:>6.2f}x")

for lc, label in (("en", "EN"), ("jp", "JP")):
    A("")
    A(f"[{label} 이 긴 순] 상위 15 — 배너에서 가장 빡빡한 항목")
    A("-" * 118)
    for r in sorted(recs, key=lambda x: -x[lc + "_w"])[:15]:
        A(f"  {r['id']:<6}{r[lc + '_w']:>8.0f}px  ({r['r_' + lc]:>5.2f}x)  {r[lc]}")

A("")
A("[KR 이 긴 순] 상위 10 — 현재 배너 기준 폰트 크기를 정하는 항목")
A("-" * 118)
for r in sorted(recs, key=lambda x: -x["kr_w"])[:10]:
    A(f"  {r['id']:<6}{r['kr_w']:>8.0f}px  {r['kr']}")

A("")
A("[요약]")
A("-" * 118)
for lc, label in (("kr", "KR"), ("en", "EN"), ("jp", "JP")):
    ws = [r[lc + "_w"] for r in recs]
    A(f"  {label} 폭   최소 {min(ws):>5.0f}px / 평균 {sum(ws)/len(ws):>5.0f}px / 최대 {max(ws):>5.0f}px")
for lc, label in (("en", "EN"), ("jp", "JP")):
    rs = [r["r_" + lc] for r in recs if r["kr_w"]]
    A(f"  {label} 비율  최소 {min(rs):.2f}x / 평균 {sum(rs)/len(rs):.2f}x / 최대 {max(rs):.2f}x")
kmax = max(r["kr_w"] for r in recs)
for lc, label in (("en", "EN"), ("jp", "JP")):
    lmax = max(r[lc + "_w"] for r in recs)
    A(f"  → KR 최장에 맞춘 크기를 기준으로, {label} 최장 항목은 그 크기의 {kmax/lmax:.0%} 이하여야 들어간다.")

A("")
A("[경고] 폰트에 글리프가 없는 문자")
A("-" * 118)
found = False
for lc, label in (("kr", "KR"), ("en", "EN"), ("jp", "JP")):
    agg = {}
    for r in recs:
        for ch in r[lc + "_miss"]:
            agg.setdefault(ch, []).append(r["id"])
    for ch, whom in agg.items():
        found = True
        A(f"  [{label}/{FONTS[lc][0]}] '{ch}' (U+{ord(ch):04X})  →  테마 {', '.join(whom)}")
if found:
    A("  해당 글자는 배너에서 폴백 폰트로 떨어지거나 두부(□)로 나온다. 표기 교체나 폰트 보강이 필요하다.")
else:
    A("  없음")

open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
for m in M.values():
    m.font.close()
print(f"{OUT} 생성 — {len(recs)}종 (kr/en/jp)")
