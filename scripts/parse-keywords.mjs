// 키워드 파싱 전처리 스크립트
//
// 게임 발매 초기 인격·EGO의 출력 텍스트(스킬/패시브 desc)는 키워드 파싱이
// 적용되지 않아, 평문 키워드 이름("침잠")이 그대로 들어 있다. 이 스크립트는
// 그런 평문 이름을 parsingdata 의 id 토큰("[Sinking]")으로 감싸, 런타임
// formatPassiveDesc 가 키워드(아이콘·툴팁)로 렌더하도록 만든다.
//
//   "[OnSucceedAttackHead] 침잠 1 부여"  →  "[OnSucceedAttackHead] [Sinking] 1 부여"
//
// 실행 위치: yeon-sim.github.io/  (단, 경로는 스크립트 위치 기준으로 해석하므로 무관)
//   node scripts/parse-keywords.mjs            # dry-run: 리포트만 생성, 파일 미수정
//   node scripts/parse-keywords.mjs --write    # 실제로 파일 수정

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const LANG = join(ROOT, "data", "lang", "kr");
const PARSE_DIR = join(LANG, "parsingdata");
const REPORT_PATH = join(SCRIPT_DIR, "keyword-parse-report.txt");

const WRITE = process.argv.includes("--write");

// ── 설정 ───────────────────────────────────────────────────────────────
// 이름→id 모호성 강제 지정 (dry-run 리포트 검토 후 채워 넣는다)
const ID_OVERRIDES = {
  "출혈": "Laceration", // 최신 데이터가 Laceration 으로 통일되어 있음 (Bleeding 아님)
  "화상": "Combustion", // 최신 데이터가 Combustion 으로 통일되어 있음 (Burn 아님)
};
// 절대 치환하지 않을 이름 (평범한 한국어 단어와 겹치는 오탐 등)
const EXCLUDE_NAMES = new Set([
  "관", // [Coffin] — "관통"(penetrate) 안의 "관" 오탐
  "우울", // sin 속성명 (모랄 상태 키워드 아님)
  "분노", // sin 속성명 (모랄 상태 키워드 아님)
  "나비", // [SinkingWhite] — "산나비/죽은나비" 복합어 깨짐
  "증오", // EGO 고유명사 "사랑과 증오의 이름으로"의 일부 (키워드 아님)
  "버림", // 제외 요청 (소수점 버림 등 평문 유지)
]);
// 모호 시 우선 채택할 parsingdata 파일 순위 (낮을수록 우선)
const FILE_PRIORITY = { "KR_BattleKeywords.json": 0, "KR_Bufs.json": 1 };
const fileRank = (f) => (f in FILE_PRIORITY ? FILE_PRIORITY[f] : 2);
// ───────────────────────────────────────────────────────────────────────

const hasHangul = (s) => /[가-힣]/.test(s);
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── 1. 이름→id 맵 구축 (모든 parsingdata, 우선순위 적용) ────────────────
function buildNameMap() {
  const files = readdirSync(PARSE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => fileRank(a) - fileRank(b) || a.localeCompare(b));

  // name → { id, fr, idx, candidates:Set<id> }
  const map = new Map();
  for (const f of files) {
    const fr = fileRank(f);
    const data = JSON.parse(readFileSync(join(PARSE_DIR, f), "utf-8"));
    const list = data.dataList || [];
    for (let idx = 0; idx < list.length; idx++) {
      const e = list[idx];
      const name = (e.name || "").trim();
      const id = e.id;
      if (!name || !id) continue;
      if (name.includes("[") || name.includes("]")) continue;
      if (!hasHangul(name)) continue; // 한글 미포함 이름 제외
      if (EXCLUDE_NAMES.has(name)) continue;

      const cur = map.get(name);
      if (!cur) {
        map.set(name, { id, fr, idx, candidates: new Set([id]) });
      } else {
        cur.candidates.add(id);
        // 더 높은 우선순위(낮은 fr, 같으면 낮은 idx)면 교체
        if (fr < cur.fr || (fr === cur.fr && idx < cur.idx)) {
          cur.id = id;
          cur.fr = fr;
          cur.idx = idx;
        }
      }
    }
  }
  // ID_OVERRIDES 적용
  for (const [name, id] of Object.entries(ID_OVERRIDES)) {
    const cur = map.get(name) || { candidates: new Set() };
    cur.id = id;
    cur.candidates.add(id);
    cur.overridden = true;
    map.set(name, cur);
  }
  return map;
}

// ── 2. 치환 엔진 ────────────────────────────────────────────────────────
function buildReplacer(nameMap) {
  // 긴 이름 우선: 정규식 alternation 은 먼저 매칭되는 분기를 택하므로
  // 길이 내림차순으로 정렬해 더 긴 키워드가 우선되게 한다.
  const names = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  const kwRE = new RegExp(names.map(escapeRE).join("|"), "g");
  const tokenRE = /\[[^\[\]]*\]/g; // 이미 파싱된 [...] 토큰

  // 한 문자열 치환. usage: name→count 누적. 반환 {text, changed}
  function replace(text, usage) {
    let changed = false;
    // 기존 [...] 구간을 보존하고 평문 구간에서만 치환
    let out = "";
    let last = 0;
    let m;
    tokenRE.lastIndex = 0;
    const segs = [];
    while ((m = tokenRE.exec(text)) !== null) {
      segs.push(["plain", text.slice(last, m.index)]);
      segs.push(["tok", m[0]]);
      last = m.index + m[0].length;
    }
    segs.push(["plain", text.slice(last)]);

    for (const [kind, seg] of segs) {
      if (kind === "tok") {
        out += seg;
        continue;
      }
      out += seg.replace(kwRE, (name) => {
        const entry = nameMap.get(name);
        if (!entry) return name;
        changed = true;
        if (usage) usage.set(name, (usage.get(name) || 0) + 1);
        return `[${entry.id}]`;
      });
    }
    return { text: out, changed };
  }
  return replace;
}

// ── 3. 대상 파일 수집 ───────────────────────────────────────────────────
function listJson(dir, pred) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && pred(f))
    .map((f) => join(dir, f));
}
function targetFiles() {
  return [
    ...listJson(join(LANG, "skill"), () => true),
    ...listJson(join(LANG, "passive"), () => true),
    ...listJson(join(LANG, "egoskill"), (f) => f.startsWith("KR_Skills_Ego")),
    join(LANG, "egoskill", "KR_Passive_Ego.json"),
  ];
}

// ── 4. 파일 처리 ────────────────────────────────────────────────────────
// dataList 항목을 형태(스킬형/패시브형)에 상관없이 순회하며 desc 를 치환.
// 변경된 원본 desc → 새 desc 쌍과 위치를 수집한다.
function processFile(path, replace, usage, changes) {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);
  const list = data.dataList || [];
  const edits = new Map(); // 원본 desc 문자열 → 새 desc 문자열 (파일 내 유일 치환)

  const handleDesc = (desc, loc) => {
    if (typeof desc !== "string" || !desc) return;
    const { text, changed } = replace(desc, usage);
    if (!changed) return;
    edits.set(desc, text);
    changes.push({ file: basename(path), loc, before: desc, after: text });
  };

  for (const item of list) {
    const id = item.id;
    if (typeof item.desc === "string") handleDesc(item.desc, `${id}`);
    if (Array.isArray(item.levelList)) {
      for (const lv of item.levelList) {
        handleDesc(lv.desc, `${id} Lv${lv.level} desc`);
        if (Array.isArray(lv.coinlist)) {
          lv.coinlist.forEach((c, ci) => {
            (c.coindescs || []).forEach((cd, di) => {
              handleDesc(cd.desc, `${id} Lv${lv.level} coin${ci + 1}.${di + 1}`);
            });
          });
        }
      }
    }
  }

  if (edits.size === 0) return false;

  if (WRITE) {
    // 최소 diff: 원본 텍스트에서 desc 의 JSON 인코딩 문자열만 교체.
    let next = raw;
    for (const [oldDesc, newDesc] of edits) {
      const oldEnc = JSON.stringify(oldDesc);
      const newEnc = JSON.stringify(newDesc);
      if (!next.includes(oldEnc)) {
        throw new Error(`인코딩 불일치로 교체 실패: ${path} :: ${oldEnc.slice(0, 60)}`);
      }
      next = next.split(oldEnc).join(newEnc);
    }
    writeFileSync(path, next);
  }
  return true;
}

// ── 5. 실행 ─────────────────────────────────────────────────────────────
const nameMap = buildNameMap();
const replace = buildReplacer(nameMap);

const usage = new Map();
const changes = [];
let filesChanged = 0;
const files = targetFiles();
for (const f of files) {
  if (processFile(f, replace, usage, changes)) filesChanged++;
}

// ── 6. 리포트 ───────────────────────────────────────────────────────────
const ambiguous = [];
for (const name of usage.keys()) {
  const e = nameMap.get(name);
  if (e && e.candidates.size > 1) {
    ambiguous.push({ name, chosen: e.id, others: [...e.candidates].filter((x) => x !== e.id) });
  }
}

const lines = [];
lines.push(`# 키워드 파싱 전처리 리포트  (${WRITE ? "WRITE 적용됨" : "DRY-RUN"})`);
lines.push("");
lines.push("== 요약 ==");
lines.push(`대상 파일: ${files.length}`);
lines.push(`변경 파일: ${filesChanged}`);
lines.push(`총 치환 수: ${changes.reduce((n, c) => n, 0) || changes.length}`);
lines.push(`사용된 키워드 종류: ${usage.size}`);
lines.push("");

lines.push("== 모호 이름 해소 내역 (검토 필요: 잘못 골랐으면 ID_OVERRIDES 에 지정) ==");
if (ambiguous.length === 0) lines.push("(없음)");
for (const a of ambiguous.sort((x, y) => x.name.localeCompare(y.name))) {
  lines.push(`  ${a.name} → [${a.chosen}]   (다른 후보: ${a.others.join(", ")})`);
}
lines.push("");

lines.push("== 키워드 사용 빈도 (오탐 의심 이름은 EXCLUDE_NAMES 에 추가) ==");
lines.push("   [len1] = 한 글자 이름 (오탐 위험 높음)");
for (const [name, cnt] of [...usage.entries()].sort((a, b) => b[1] - a[1])) {
  const flag = name.length === 1 ? " [len1]" : "";
  lines.push(`  ${String(cnt).padStart(4)}  ${name} → [${nameMap.get(name).id}]${flag}`);
}
lines.push("");

lines.push("== 상세 변경 목록 ==");
let curFile = "";
for (const c of changes) {
  if (c.file !== curFile) {
    curFile = c.file;
    lines.push("");
    lines.push(`### ${curFile}`);
  }
  lines.push(`  [${c.loc}]`);
  lines.push(`    - ${c.before}`);
  lines.push(`    + ${c.after}`);
}

writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");

// stdout 은 한글 콘솔 깨짐 방지를 위해 숫자 요약만 출력
console.log(`mode: ${WRITE ? "WRITE" : "DRY-RUN"}`);
console.log(`target files: ${files.length}, changed files: ${filesChanged}`);
console.log(`replacements: ${changes.length}, distinct keywords: ${usage.size}, ambiguous: ${ambiguous.length}`);
console.log(`report: ${REPORT_PATH}`);
