// 언어 파일 동기화 스크립트 (KR / EN / JP)
//
// 게임 클라이언트의 로컬라이징 원본(Localize/{kr,en,jp})을 data/lang/{kr,en,jp} 로 복사한다.
// 이전에는 사용자가 손으로 배치하던 단계 — 클라이언트 경로가 별도 디렉터리라는
// 이유였으나, 원본을 그대로 복사하면 되므로 자동화한다.
//
//   node scripts/sync-lang.mjs            # dry-run: 리포트만, 파일 미수정
//   node scripts/sync-lang.mjs --write    # data/lang/{kr,en,jp} 에 실제 복사
//   node scripts/sync-lang.mjs --lang en          # 특정 언어만 (기본: 전부)
//   node scripts/sync-lang.mjs --localize "<Localize 경로>"   # 기본값은 Steam 설치 경로
//
// 규칙:
//  - 대상 = data/lang/{lc} 가 이미 가진 파일 중 클라이언트 Localize/{lc} 에 동명(basename)이
//    있는 것. 사이트 디렉터리 구조(skill/·passive/·egoskill/…)는 사이트 측 분류이고
//    클라이언트는 평평하므로, basename 으로 매칭해 원래 위치에 덮어쓴다.
//    클라이언트 파일도 언어 접두어를 갖는다(KR_/EN_/JP_)라 언어끼리 섞이지 않는다.
//  - 클라이언트에 없는 파일 = 사이트 authoring(yeonsim/ 하위 9종) → 건드리지 않음.
//    ⚠️ yeonsim/ 을 위한 별도 예외는 두지 않는다 — 동명 파일이 없어 자동으로 걸러진다.
//  - 게임은 같은 용도의 lang 을 업데이트마다 접미사를 붙여 쪼갠다
//    (KR_BattleKeywords-walpu8 · KR_BattleKeywords_Mirror7 — 구분자는 - 도 _ 도 쓴다).
//    ROUTES 가 그 계열(접두)과 사이트 디렉터리를 잇고, 사이트에 아직 없는 신규 접미사는
//    **리포트에만** 올린다(참조 건수 동봉). 편입은 `--adopt <파일명>` 으로 1회 결정.
//    → 자동 편입하지 않는 이유: 실측 결과 후보 17개 중 사이트가 실제로 쓰는 건 0개였고
//      (연출 전용 hidden 레코드가 참조 검사를 통과하는 등) 참조 수만으론 판정이 안 된다.
//  - ⭐ 유실 검사: 복사로 사라질 "사이트에만 있는 레코드/최상위 키" 중
//    data_override/lang/{lc} 로 복원되지 않는 것이 있으면 경고하고 --write 를 거부한다.
//    (실제 사고: KR_ResistText 의 resist_unwatched, {KR,EN,JP}_SkillTag 의 skillTag 플래그)
//  - ⭐ 언어 간 커버리지: KR 에 있는 계열 파일이 EN/JP 에 없으면 리포트에 올린다.
//    언어별 파일 집합이 갈라지면 그 항목만 조용히 한국어로 남는다(경고는 아님 —
//    클라이언트 원본에 실제로 없는 경우가 있다: EN_Skills_Ego_Personality-a1c9p2).
//  - 사이트 파일에 in-place 로 손댄 값(레코드 필드 수정)은 탐지 대상이 아니다.
//    그런 수정은 정책상 data_override 로 관리한다.
//
// 파이프라인 위치: 이 단계 → apply-overrides → parse-keywords(KR 전용) → 이미지/버프 아이콘.
// (버프 아이콘 누락 산출이 parsingdata 를 읽으므로 반드시 그보다 앞이다.)
// ⚠️ JP 텍스트가 갱신되면 scripts/subset-jp-font.py 도 재실행할 것(서브셋 밖 글자는 폴백 폰트).

import { readdirSync, statSync, readFileSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, basename, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const REPORT_PATH = join(SCRIPT_DIR, "sync-lang-report.txt");

const DEFAULT_LOCALIZE =
  "C:/Program Files (x86)/Steam/steamapps/common/Limbus Company/LimbusCompany_Data/Assets/Resources_moved/Localize";

const ALL_LANGS = ["kr", "en", "jp"];

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const li = argv.indexOf("--localize");
const LOCALIZE = li >= 0 ? argv[li + 1] : DEFAULT_LOCALIZE;
const gi = argv.indexOf("--lang");
const LANGS = gi >= 0 ? [argv[gi + 1]] : ALL_LANGS;
const ai = argv.indexOf("--adopt");
const ADOPT = ai >= 0 ? argv[ai + 1] : null;   // 신규 접미사 파일 1개를 사이트로 편입

if (LANGS.some((lc) => !ALL_LANGS.includes(lc))) {
  console.error(`--lang 은 ${ALL_LANGS.join("|")} 중 하나여야 합니다.`);
  process.exit(1);
}

const langDir = (lc) => join(ROOT, "data", "lang", lc);
const overrideDir = (lc) => join(ROOT, "data_override", "lang", lc);
const srcDir = (lc) => join(LOCALIZE, lc);

// 파일명은 언어 접두어(KR_/EN_/JP_)를 갖는다. 표는 접두어를 뗀 이름으로 매칭해 3개 언어를 함께 쓴다.
const stripPrefix = (name) => name.replace(/^(KR|EN|JP)_/, "");
const langOf = (name) => (name.match(/^(KR|EN|JP)_/)?.[1] ?? "").toLowerCase() || null;

// 파일명 계열(접두) → 사이트 하위 디렉터리. 첫 매치 우선이라 순서가 중요하다
// (Skills_Ego* 가 Skills* 보다 먼저 와야 egoskill/ 로 간다).
// 기존 사이트 파일 전부가 이 표대로 배치돼 있는지 시작 시 자기검증한다.
const ROUTES = [
  [/^BattleKeywords/, "parsingdata"],
  [/^SkillTag/, "parsingdata"],
  [/^Skills_Ego/, "egoskill"],
  [/^Passive_Ego/, "egoskill"],
  [/^Egos/, "egoskill"],
  [/^Skills/, "skill"],
  [/^Passives/, "passive"],
  [/^UnitKeyword/, "unitkeyword"],
  [/^EGOgift/, "egogift"],
  [/^EgoGiftCategory/, "egogift"],
  [/^Personalities/, ""],
  [/^ResistText/, ""],
  [/^MirrorDungeonTheme/, ""],
];
// 사이트가 쓰지 않는 주체(적·환상체·조수·튜토리얼·이벤트). 접두만으로는 걸러지지 않아 명시한다
// (이게 없으면 Skills_Enemy* 등 176개가 후보로 쏟아진다).
const DENY = /^(Skills|Passives)_(Enemy|Abnormality|Assist|Tutorial|fools)/;

const routeOf = (name) => {
  const s = stripPrefix(name);
  return DENY.test(s) ? null : (ROUTES.find(([re]) => re.test(s))?.[1] ?? null);
};

for (const lc of LANGS) {
  if (!existsSync(srcDir(lc))) {
    console.error(`클라이언트 언어 경로 없음: ${srcDir(lc)}\n--localize <Localize 경로> 로 지정하세요.`);
    process.exit(1);
  }
  if (!existsSync(langDir(lc))) {
    console.error(`사이트 언어 디렉터리 없음: ${relative(ROOT, langDir(lc))}`);
    process.exit(1);
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const rows = (o) =>
  Array.isArray(o) ? o : Array.isArray(o.dataList) ? o.dataList : Array.isArray(o.list) ? o.list : [];
// 컨테이너(dataList/list) 를 뺀 최상위 키 = 파일 단위 플래그
const flags = (o) =>
  Array.isArray(o) ? [] : Object.keys(o).filter((k) => !Array.isArray(o[k]));

// 참조 universe 는 언어 무관 부분(data/ 의 레코드 id)을 공유하고, 텍스트 토큰만 언어별로 더한다.
let dataIds = null;
function dataIdUniverse() {
  if (dataIds) return dataIds;
  dataIds = new Set();
  const all = (d) => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? all(join(d, e.name)) : [join(d, e.name)]));
  for (const f of all(join(ROOT, "data"))) {
    if (!f.endsWith(".json") || f.split(sep).join("/").includes("data/lang/")) continue;
    let d; try { d = JSON.parse(readFileSync(f, "utf-8")); } catch { continue; }
    for (const r of rows(d)) if (r && r.id != null) dataIds.add(String(r.id));
  }
  return dataIds;
}

// ── 언어 1개 분석 ─────────────────────────────────────────────────────────
function analyze(lc) {
  const LANG = langDir(lc), OVERRIDE_LANG = overrideDir(lc), SRC = srcDir(lc);
  const report = [], warn = [], authored = [], copies = [];
  let nSame = 0, nCopy = 0;

  for (const sitePath of walk(LANG)) {
    const rel = relative(LANG, sitePath);
    const srcPath = join(SRC, basename(rel));

    if (!existsSync(srcPath)) { authored.push(rel); continue; }
    if (readFileSync(sitePath).equals(readFileSync(srcPath))) { nSame++; continue; }

    let site, client;
    try { site = readJson(sitePath); client = readJson(srcPath); }
    catch { warn.push(`${rel}: JSON 파싱 실패 → 건너뜀`); continue; }

    // 사이트에만 있는 레코드 / 최상위 플래그
    const clientIds = new Set(rows(client).map((r) => String(r.id)));
    const siteOnlyIds = rows(site).map((r) => String(r.id)).filter((id) => !clientIds.has(id));
    const siteOnlyFlags = flags(site).filter(
      (k) => JSON.stringify(site[k]) !== JSON.stringify(client[k])
    );

    // data_override 가 복원해 주는 것 제외
    const ovPath = join(OVERRIDE_LANG, rel);
    let covIds = new Set(), covFlags = new Set();
    if (existsSync(ovPath)) {
      const ov = readJson(ovPath);
      covIds = new Set(rows(ov).map((r) => String(r.id)));
      covFlags = new Set(flags(ov));
    }
    const lostIds = siteOnlyIds.filter((id) => !covIds.has(id));
    const lostFlags = siteOnlyFlags.filter((k) => !covFlags.has(k));

    if (lostIds.length || lostFlags.length) {
      const what = [
        ...lostIds.map((id) => `레코드 ${id}`),
        ...lostFlags.map((k) => `최상위 키 ${k}`),
      ];
      warn.push(`${rel}: ${what.join(", ")} — 오버라이드 미등록 → 복사 시 유실`);
    }

    const nDiff = rows(site).filter((r) => {
      const c = rows(client).find((x) => String(x.id) === String(r.id));
      return c && JSON.stringify(c) !== JSON.stringify(r);
    }).length;
    report.push(`  ${rel}${nDiff ? ` (레코드 ${nDiff}건 상이 — 토큰화/게임갱신)` : ""}`);
    copies.push([rel, srcPath]);
    nCopy++;
  }

  // ROUTES 자기검증: 기존 사이트 파일이 표대로 배치돼 있는가
  const siteRels = walk(LANG).map((p) => relative(LANG, p));
  const siteNames = new Set(siteRels.map((p) => basename(p)));
  for (const rel of siteRels) {
    const dir = routeOf(basename(rel));
    if (dir === null) continue;             // authoring 파일은 ROUTES 밖(정상)
    const cur = rel.includes(sep) ? rel.split(sep)[0] : "";
    if (dir !== cur) warn.push(`ROUTES 불일치: ${rel} 은 표상 ${dir || "(root)"} 소속인데 ${cur || "(root)"} 에 있음 — 표를 고칠 것`);
  }

  // 신규 접미사 파일 (클라이언트에만 있음. 복사하지 않고 리포트만)
  const candidates = readdirSync(SRC)
    .filter((f) => f.endsWith(".json") && !siteNames.has(f) && routeOf(f) !== null)
    .sort();

  // 참조 universe = data/(lang 제외) 레코드 id + **클라이언트** lang desc 의 [Token].
  // ⚠️ 토큰을 사이트 lang 에서 읽으면 한 박자 늦는다 — 신규 계열 파일의 키워드는 같은
  // 업데이트의 새 desc 에 처음 등장하므로, 아직 복사 전인 사이트 텍스트에는 없어서
  // 첫 dry-run 에서 참조 0 으로 묻힌다. 그래서 소스(클라이언트) 쪽 텍스트를 본다.
  let universe = null;
  const refCount = (file) => {
    if (universe === null) {
      universe = new Set(dataIdUniverse());
      for (const f of readdirSync(SRC)) {        // 사이트가 쓰는 계열의 클라이언트 텍스트만
        if (!f.endsWith(".json") || routeOf(f) === null) continue;
        for (const m of readFileSync(join(SRC, f), "utf-8").matchAll(/\[([A-Za-z][A-Za-z0-9_]*)\]/g))
          universe.add(m[1]);
      }
    }
    let d; try { d = readJson(join(SRC, file)); } catch { return -1; }
    const ids = new Set(rows(d).map((r) => String(r.id)));
    return [...ids].filter((i) => universe.has(i)).length;
  };

  return { lc, LANG, SRC, report, warn, authored, copies, candidates, refCount, nSame, nCopy, siteRels };
}

const results = LANGS.map(analyze);
const byLang = Object.fromEntries(results.map((r) => [r.lc, r]));

// ── 언어 간 커버리지: KR 기준으로 EN/JP 에 없는 파일 ─────────────────────────
// 언어별 파일 집합이 갈라지면 그 항목만 조용히 한국어로 남는다.
// 경고가 아니라 리포트 항목이다 — 클라이언트 원본에 실제로 없는 경우가 있다.
const coverage = [];
if (byLang.kr && LANGS.length > 1) {
  const key = (rel) => relative(".", rel).split(sep).join("/").replace(/(^|\/)(KR|EN|JP)_/, "$1");
  const krKeys = new Set(byLang.kr.siteRels.map(key));
  for (const lc of LANGS.filter((x) => x !== "kr")) {
    const has = new Set(byLang[lc].siteRels.map(key));
    const missing = [...krKeys].filter((k) => !has.has(k)).sort();
    const extra = [...has].filter((k) => !krKeys.has(k)).sort();
    for (const m of missing) coverage.push(`  ${lc}: 없음 — ${m}  (kr 에는 있음 → 해당 항목은 한국어로 표시됨)`);
    for (const e of extra) coverage.push(`  ${lc}: kr 에 없는 파일 — ${e}`);
  }
}

// ── --adopt: 후보 1개를 사이트로 편입 (파일명 접두어로 언어 판별) ─────────────
if (ADOPT) {
  const lc = langOf(ADOPT);
  const r = lc && byLang[lc];
  if (!r) {
    console.error(`--adopt 대상의 언어를 알 수 없습니다: ${ADOPT} (KR_/EN_/JP_ 접두어 필요)`);
    process.exit(1);
  }
  if (!r.candidates.includes(ADOPT)) {
    console.error(`--adopt 대상이 ${lc} 후보에 없습니다: ${ADOPT}\n리포트의 "신규 접미사 후보" 목록에서 고르세요.`);
    process.exit(1);
  }
  const dst = join(r.LANG, routeOf(ADOPT), ADOPT);
  if (WRITE) { copyFileSync(join(r.SRC, ADOPT), dst); console.log(`편입: ${ADOPT} → ${relative(ROOT, dst)}`); }
  else console.log(`편입예정: ${ADOPT} → ${relative(ROOT, dst)} (--write 필요)`);
}

// ── 출력 ─────────────────────────────────────────────────────────────────
const allWarn = results.flatMap((r) => r.warn.map((w) => `[${r.lc}] ${w}`));
const totCopy = results.reduce((a, r) => a + r.nCopy, 0);

const lines = [
  `== sync-lang 리포트 (${WRITE ? "WRITE" : "DRY-RUN"}) ==`,
  `소스: ${LOCALIZE}`,
  `언어: ${LANGS.join(" · ")}`,
  ...results.map((r) =>
    `  ${r.lc}  동일 ${r.nSame} · 갱신 ${r.nCopy} · authoring ${r.authored.length} · 후보 ${r.candidates.length} · 경고 ${r.warn.length}`),
  "",
];
for (const r of results) {
  lines.push(
    `## [${r.lc}] 갱신 대상`,
    ...(r.report.length ? r.report : ["  (없음)"]),
    "",
    `## [${r.lc}] 사이트 authoring (클라이언트에 없음 → 복사 대상 아님)`,
    ...(r.authored.length ? r.authored.map((x) => `  ${x}`) : ["  (없음)"]),
    "",
    `## [${r.lc}] 신규 접미사 후보 (클라이언트에만 있음 — 복사하지 않음)`,
    "   필요하면 `--adopt <파일명> --write` 로 1회 편입하면 이후 자동 동기화된다.",
    "   참조 = 파일의 id 중 사이트 데이터·클라이언트 텍스트가 언급하는 수. 힌트일 뿐이다",
    "   (hidden 레코드·미사용 정의도 걸리므로, 0이 아니어도 필요하다는 뜻은 아니다).",
    ...(r.candidates.length
      ? r.candidates.map((f) => `  ${f}  [${routeOf(f) || "(root)"}] 참조 ${r.refCount(f)}`)
      : ["  (없음)"]),
    "",
  );
}
lines.push(
  "## 언어 간 커버리지 (kr 기준)",
  "   여기 오른 항목은 그 언어에 파일이 없어 사이트가 한국어 폴백으로 표시한다.",
  "   클라이언트 원본에 실제로 없는 경우가 있으므로 경고는 아니다.",
  ...(coverage.length ? coverage : ["  (차이 없음)"]),
  "",
  "## 경고",
  ...(allWarn.length ? allWarn.map((w) => `  ⚠ ${w}`) : ["  (없음)"]),
);
writeFileSync(REPORT_PATH, lines.join("\n") + "\n");

console.log(lines.slice(0, 3 + results.length).join("\n"));
if (coverage.length) {
  console.log(`\n언어 간 커버리지 차이 ${coverage.length}건 (리포트 참고 — 경고 아님)`);
}
if (allWarn.length) {
  console.log("");
  allWarn.forEach((w) => console.log(`  ⚠ ${w}`));
  console.log(`\n유실 위험이 있어 복사하지 않았습니다. 해당 항목을 data_override/lang/{언어} 에 등록한 뒤 다시 실행하세요.`);
  console.log(`리포트: ${relative(ROOT, REPORT_PATH)}`);
  process.exit(1);
}

if (WRITE) {
  for (const r of results) for (const [rel, srcPath] of r.copies) copyFileSync(srcPath, join(r.LANG, rel));
  console.log(`\n→ ${totCopy}개 파일 갱신 완료 (${results.map((r) => `${r.lc} ${r.nCopy}`).join(" · ")}).`);
  console.log(`NEXT  apply-overrides --write · parse-keywords --write(KR 전용) — 둘 다 dry-run 검수 먼저`);
  console.log(`      JP 텍스트가 바뀌었으면 python scripts/subset-jp-font.py 도 재실행`);
} else {
  console.log(`\n→ dry-run. 적용하려면 --write.`);
}
console.log(`리포트: ${relative(ROOT, REPORT_PATH)}`);
