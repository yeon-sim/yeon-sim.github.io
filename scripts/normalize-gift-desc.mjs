// EGO 기프트 desc 정규화 전처리 스크립트
//
// 기프트 desc/simpleDesc 는 표기가 비일관적이다(예: "턴 종료시" vs "턴 종료 시").
// 이 스크립트는 desc 를 계산기·구조화 파이프라인의 입력이 될 수 있도록
// 표준형(canonical)으로 정규화한다. 정규화는 표면형(공백·마크업·동의어)만 다루며,
// 의미 구조화(→스크립트)는 후속 단계(LLM 추출+검수)에서 한다.
//
//   "<style=\"upgradeHighlight\">턴 종료시</style>, [Combustion] ..."  →  "턴 종료 시, [Combustion] ..."
//
// ⚠️ data/ 는 수정하지 않는다. 원본 lang 은 재추출로 덮이므로(롤백) 별도 산출물로만 둔다.
//   - 검수: gift_normalize_changeset/  (대상 파일별 [{loc, before, after}], git diff 로 델타 검수)
//   - 산출물(--write): gift_normalized/  (정규화된 desc 사본; 후속 파이프라인 입력)
//
// 실행 위치 무관(경로는 스크립트 기준):
//   node scripts/normalize-gift-desc.mjs            # dry-run: 리포트 + changeset 만
//   node scripts/normalize-gift-desc.mjs --write    # gift_normalized/ 에 산출물도 기록

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const DATA = join(ROOT, "data");
const GIFT_LANG = join(DATA, "lang", "kr", "egogift");
const REPORT_PATH = join(SCRIPT_DIR, "gift-normalize-report.txt");
const CHANGESET_DIR = join(ROOT, "gift_normalize_changeset");
const OUTPUT_DIR = join(ROOT, "gift_normalized");

const WRITE = process.argv.includes("--write");

// ── 정규화 맵 (인벤토리 리포트 기반. 새 데이터마다 리포트 검토 후 갱신) ──────────

// 1) 제거할 프레젠테이션 태그 이름(ASCII만). 안쪽 텍스트는 보존.
//    ⚠️ 한글 <…>(예: <혈귀>, <기계 융화 생명체>)는 종족/대상 참조라 태그가 아님 → 보존.
//    그래서 일괄 <[^>]+> 가 아니라 '알려진 ASCII 태그명'만 매칭한다.
const STRIP_TAGS = ["style", "color", "i", "b", "u", "noparse", "link", "sprite"];
const TAG_RE = new RegExp(`<\\/?(?:${STRIP_TAGS.join("|")})\\b[^>]*>`, "gi");

// 2) "X시" → "X 시" 공백 표준화 대상 stem (띄움형이 다수파 = 표준).
//    명시 allow-list 라 다시/즉시/반드시/역시 같은 단일어는 자동 보호됨(stem 에 없음).
const SI_STEMS = [
  "시작", "종료", "적중", "승리", "사용", "처치", "공격", "진행", "부여",
  "사망", "피격", "발동", "입장", "패배", "진입", "등장", "클리어", "소모", "참여",
  "보유", "소지", "획득", "처치할", "승리할", "사망할", "보유했을", "만족",
];
const SI_RE = new RegExp(`(${SI_STEMS.join("|")})시(?=[\\s,.)\\n\\]]|$)`, "g");
// 방어용: 분리하면 안 되는 단어(allow-list 로 이미 대부분 안전하나 명시 보호)
const PROTECT_SPACING = new Set(["다시", "즉시", "반드시", "역시", "동시", "항시", "일시", "잠시", "당시", "수시"]);

// 3) 동의어 표준화(보수적으로 시작 — 리포트 검토 후 확장). 부분일치 오염 주의.
//    예: "얻음"(422) vs "획득"(83) 통일은 의미손실 없음. 단 "피해"→"피해량" 은
//    "고정 피해"·"질투 피해"·"받는 피해" 문맥 때문에 무조건 통일 금지 → 여기 안 넣음.
const SYNONYM = [
  // [from, to]  — 단어경계가 모호한 한국어라 '치환 후에도 의미 동일'한 것만.
  // (시작은 비워두고 리포트의 [연산동사]/[시점] 인벤토리를 보며 채운다)
];

// ── 스코프: 기본 id 가 9xxx 인 기프트만(강화 19xxx/29xxx 포함) ──────────────
//   사이트 표시 454종(= base 9xxx) + 그 강화 217종 = 671 레코드.
//   제외: base 1xxx·2xxx (사이트 미표시 던전/이벤트 기프트).
function baseId(id) {
  const s = String(id);
  if (/^9\d{3}$/.test(s)) return s;     // base 9xxx
  const m = s.match(/^[12](9\d{3})$/);  // 강화 19xxx(lv1)/29xxx(lv2)
  return m ? m[1] : null;
}
const inScope = (id) => baseId(id) !== null;

// ── 정규화 본체 ─────────────────────────────────────────────────────────
function normalize(text) {
  if (typeof text !== "string") return text;
  let t = text.normalize("NFC");
  t = t.replace(TAG_RE, "");                 // 1) 프레젠테이션 태그 제거(한글 <…> 보존)
  t = t.replace(/ /g, " ");             // NBSP → space
  t = t.replace(SI_RE, (m, stem) =>          // 2) "X시" → "X 시" (보호어 제외)
    PROTECT_SPACING.has(stem + "시") ? m : `${stem} 시`);
  for (const [from, to] of SYNONYM) t = t.split(from).join(to); // 3) 동의어
  t = t.replace(/[ \t]+/g, " ");             // 다중 공백 → 1 (줄바꿈 보존)
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  return t.trim();
}

// ── 파일 순회 ───────────────────────────────────────────────────────────
const targetFiles = () =>
  readdirSync(GIFT_LANG)
    .filter((n) => /^KR_EGOgift_.*\.json$/.test(n))
    .map((n) => join(GIFT_LANG, n));

const files = targetFiles();
const changes = [];        // {rel, file, loc, before, after}
const usage = { tags: new Map(), tokens: new Map(), siConflicts: new Map() };
let filesChanged = 0;
let scopedRecords = 0;
const scopedBlob = []; // 인벤토리/커버리지 점검용: 스코프 레코드의 원본 텍스트만

function track(blob) {
  for (const m of blob.matchAll(/<[^>]+>/g)) usage.tags.set(m[0], (usage.tags.get(m[0]) || 0) + 1);
  for (const m of blob.matchAll(/\[[A-Za-z0-9_]+\]/g)) usage.tokens.set(m[0], (usage.tokens.get(m[0]) || 0) + 1);
}

for (const path of files) {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);
  const rel = relative(DATA, path);
  let changedHere = false;
  const out = structuredClone(data);

  const list = out.dataList || [];
  for (const r of list) {
    if (!inScope(r.id)) continue; // 9xxx 기반(강화 포함)만 대상
    scopedRecords++;
    const apply = (val, loc) => {
      if (typeof val !== "string") return val;
      track(val);
      scopedBlob.push(val); // 인벤토리는 스코프 원본 텍스트 기준
      const norm = normalize(val);
      if (norm !== val) {
        changes.push({ rel, file: rel, loc, before: val, after: norm });
        changedHere = true;
      }
      return norm;
    };
    if (typeof r.desc === "string") r.desc = apply(r.desc, `${r.id} desc`);
    if (Array.isArray(r.simpleDesc)) {
      r.simpleDesc.forEach((s, i) => {
        if (typeof s.simpleDesc === "string")
          s.simpleDesc = apply(s.simpleDesc, `${r.id} simpleDesc[${i}] ability${s.abilityID ?? "?"}`);
      });
    }
  }

  if (changedHere) filesChanged++;
  if (WRITE) {
    out.dataList = (out.dataList || []).filter((r) => inScope(r.id)); // 스코프(9xxx 기반) 레코드만
    if (out.dataList.length > 0) {
      const o = join(OUTPUT_DIR, rel);
      mkdirSync(dirname(o), { recursive: true });
      writeFileSync(o, JSON.stringify(out, null, 2) + "\n", "utf-8");
    }
  }
}

// ── change-set 출력(검수용). 변경 있을 때만 갱신(멱등 재실행 시 빈값 덮어쓰기 방지) ──
if (changes.length > 0) {
  const byRel = new Map();
  for (const f of files) byRel.set(relative(DATA, f), []);
  for (const c of changes) byRel.get(c.rel).push({ loc: c.loc, before: c.before, after: c.after });
  for (const [rel, arr] of byRel) {
    const out = join(CHANGESET_DIR, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(arr, null, 2) + "\n", "utf-8");
  }
}

// ── 리포트 ──────────────────────────────────────────────────────────────
const L = [];
L.push(`# 기프트 desc 정규화 리포트  (${WRITE ? "WRITE 적용됨" : "DRY-RUN"})`);
L.push("");
L.push("== 요약 ==");
L.push(`스코프: base 9xxx + 강화(19xxx/29xxx)만`);
L.push(`대상 파일: ${files.length} / 스코프 레코드: ${scopedRecords} / 변경 파일: ${filesChanged} / 정규화된 필드: ${changes.length}`);
L.push("");

L.push("== 마크업 태그 인벤토리 (STRIP_TAGS 점검: 한글 <…>는 보존돼야 함) ==");
for (const [t, c] of [...usage.tags.entries()].sort((a, b) => b[1] - a[1]))
  L.push(`  ${String(c).padStart(5)}  ${t}${/[가-힣]/.test(t) ? "   ← 한글: 보존 대상" : ""}`);
L.push("");

L.push(`== [Token] 키워드 (보존, distinct ${usage.tokens.size}) ==`);
for (const [t, c] of [...usage.tokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30))
  L.push(`  ${String(c).padStart(5)}  ${t}`);
L.push("");

// 정규화 후에도 남은 "X시" 붙임형(커버리지 점검) — 스코프 원본 텍스트 기준
const leftover = new Map();
{
  const blob = scopedBlob.join("\n").normalize("NFC");
  for (const m of blob.matchAll(/([가-힣]{1,4})시(?=[\s,.)\n\]]|$)/g)) {
    const stem = m[1];
    if (!SI_STEMS.includes(stem) && !PROTECT_SPACING.has(stem + "시"))
      leftover.set(stem, (leftover.get(stem) || 0) + 1);
  }
}
L.push("== 미커버 '…시' 붙임형 (SI_STEMS 후보 / 또는 보호어) ==");
for (const [s, c] of [...leftover.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30))
  L.push(`  ${String(c).padStart(4)}  ${s}시`);
L.push("");

L.push("== 상세 변경 (before → after) ==");
let cur = "";
for (const c of changes) {
  if (c.file !== cur) { cur = c.file; L.push(""); L.push(`### ${cur}`); }
  L.push(`  [${c.loc}]`);
  L.push(`    - ${JSON.stringify(c.before)}`);
  L.push(`    + ${JSON.stringify(c.after)}`);
}

writeFileSync(REPORT_PATH, L.join("\n"), "utf-8");

// stdout 은 숫자 요약만 (한글 콘솔 깨짐 방지)
console.log(`mode: ${WRITE ? "WRITE" : "DRY-RUN"}`);
console.log(`target files: ${files.length}, changed files: ${filesChanged}, normalized fields: ${changes.length}`);
console.log(`report: ${REPORT_PATH}`);
console.log(changes.length > 0 ? `change-set: ${CHANGESET_DIR}/` : `change-set: (변경 0 → 갱신 안 함)`);
console.log(WRITE ? `output: ${OUTPUT_DIR}/` : `output: (dry-run → 산출물 미기록)`);
