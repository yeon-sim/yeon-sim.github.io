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

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const DATA = join(ROOT, "data");
const LANG = join(DATA, "lang", "kr");
const PARSE_DIR = join(LANG, "parsingdata");
const REPORT_PATH = join(SCRIPT_DIR, "keyword-parse-report.txt");
// 검수용 change-set 출력 디렉터리 (data_override/ 밖 → apply-overrides 가 머지하지 않음)
const CHANGESET_DIR = join(ROOT, "keyword_changeset");

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
  // ↓ 키워드명이지만 평문/스킬명으로만 등장 → 아이콘화 부적절 (authored [...] 토큰은 영향 없음)
  "최대 체력 증가", // [MaxHpMultiplier] — 평범한 서술 문구
  "강화 상태", // [EnhanceRose] — 기프트 전용 키워드, "강화 상태인 경우" 평문
  "열화침식", // [LCEFireFly_LowMorale] — EGO 침식 고유명사
  "경혈", // [BloodArmorPersonalityFirst] — 스킬명 "산초/돈키호테류 경혈"
  "앙갚음", // [AaCePbBe] — 스킬명 "정의로운 앙갚음"
  "파탄", // [WanderingFootsteps_LowMorale] — 스킬명 "…파탄하라"
]);
// 키워드가 더 긴 단어의 일부로 들어간 복합어 (해당 문자열 안은 통째로 보호 → 부분 매칭 방지)
//   ex. "보호막"은 키워드 아님인데 "보호"(Protection)가 잡혀 "[Protection]막"이 되는 것을 막음
const PROTECT_WORDS = new Set([
  "보호막", // "보호"(Protection) 오탐 방지 (보호막은 별도 키워드 아님)
  "광신도", // "광신"(Assemble) 오탐 방지 ("N사 광신도")
  // "취약" 이 'Vulnerable 디버프'가 아니라 '속성 내성 레벨'(약점/취약)을 뜻하는 문맥만 보호.
  //   디버프 부여("취약 1 부여")는 그대로 [Vulnerable] 로 토큰화됨.
  "취약 속성", // 예: "상대의 취약 속성(내성 1.5 초과)으로 공격"
  "취약인 속성", // 예: "약점, 취약인 속성으로 공격"
  "취약으로", // 예: "관통 속성 내성을 취약으로 변경"
  // 복합 고유명사 "특수 X" (출혈/침잠 등과 구별되는 별도 자원) → X 키워드 오탐 방지
  "특수 출혈", "특수 침잠", "특수 화상", "특수 진동", "특수 탄환", "특수 원호 방어",
  // 측정 명사 "…증가량" : "피해량 증가"(AttackDmgUp)·"공격 위력 증가"(Enhancement) 가 "증가량" 앞부분만 잡힘
  "증가량",
  // "증가시키다" 동사 안의 "가시"(Thorn) 오탐 ("증가시킴/증가시키는")
  "증가시",
  "<피주머니>", // [BloodPocket] — <혈귀>처럼 상태 참조, 평문 유지
  "오혈읍루", // "오혈"(CondensedBlood) — 스킬명
  "마지막 탄환", // "탄환"(Bullet) — 스킬명 ("탄환"은 다른 곳에서 정상 토큰화됨)
  "못한", "못했", // "못하다"(실패) 안의 "못"(NailPersonality) 오탐. "못 N 부여"·"못이" 는 정상 토큰화
  "소수점 버림", // "버림"(Discard) 오탐 — 소수점 내림. ("…개를 버림"·"순으로 버림" 은 [Discard] 로 토큰화)
  // 'X 속성의 Y' = 공명 속성 레벨 참조 (Y 디버프/버프 키워드 아님). 긴 복합형 우선.
  "속성의 피해량 증가와 위력 증가", "속성의 취약과 위력 감소",
  "속성의 피해량 증가", "속성의 취약",
]);
// 레코드 통째로 파싱 제외 (고유명사가 밀집해 개별 보정보다 스킵이 단순한 id).
//   해당 id 의 desc/levelList 전부 토큰화하지 않음. (대부분 이미 authored [...] 토큰이라 손실 없음)
const SKIP_IDS = new Set([
  "2110811", "2110821", // 로보토미 E.G.O:: 마탄
  "1070721", "1070731", // 관통 피해량 증가 (서술 문구)
  "999905", // '붉은시선', '관측 불가'
  "1011002", // 산나비/죽은나비
  "1051202", // 특수 탄환 등
  "1041502", // 거미집/소지 료슈
  "1041501", // 삼천대세계 E.G.O
  "1111513", // 오티스 검 단계
]);
// 사이트 미사용 공용·시스템 레코드 (소유 인격/EGO 가 없어 컷오프가 걸리지 않는 것들).
//   어떤 인격의 battlePassiveList/supporterPassiveList·attributeList/defenseSkillIDList 에서도
//   참조되지 않아 화면에 렌더되지 않는다(lang 맵의 죽은 키로만 남음) → 전처리할 이유가 없다.
//   ⚠️ 여기에 없는 새 no-owner 레코드는 계속 처리된다(= changeset diff 로 드러나는 트립와이어).
const UNUSED_IDS = new Set([
  "0", "1", "2",                                    // 기본 수비 스킬 (방어/회피/반격)
  "1000101", "1000102", "1000103", "1000104",       // 기본 스킬 + E.G.O 침식 (info.panicSkillOnErosion, 템플릿 미사용)
  // 죄악 속성 공명 패시브 (7속성 × 2변형) — 전 수감자 공용, 인격 패시브 목록에 미포함
  "1000121", "1000201", "1000221", "1000301", "1000321", "1000401", "1000421",
  "1000501", "1000521", "1000601", "1000621", "1000701", "1000721",
  // 붉은시선 계열 스킬·패시브 (999905 는 SKIP_IDS 에 이미 등록됨)
  "999901", "999902", "999903", "999904", "999906", "999907", "999908", "999909",
]);
// 출시일 컷오프: 이 날짜(포함) 이후 출시된 인격·EGO 의 레코드는 전처리하지 않는다.
//   전처리는 '발매 초기 평문 데이터'용이므로, 게임이 키워드를 직접 authoring 하기
//   시작한 뒤의 콘텐츠에는 이득이 없고 오탐만 남는다.
//   실측 오탐 발생 지점은 2026-06-11(인격 10815, [TabExplain] 관례 + 평범한 단어를
//   이름으로 갖는 신규 키워드 정오=DawnFaust / 새벽 사무소=DawnTeam) 이지만,
//   안전 마진을 두어 2025-11-01 로 앞당겨 설정한다.
//   이 컷오프로 EXCLUDE_NAMES/PROTECT_WORDS 가 닫힌 레거시 집합만 다루게 되어
//   신규 콘텐츠 때문에 상수가 계속 자라는 일이 없어진다.
const CUTOFF_DATE = "20251101";
// 모호 시 우선 채택할 parsingdata 파일 순위 (낮을수록 우선)
const FILE_PRIORITY = { "KR_BattleKeywords.json": 0 };
const fileRank = (f) => (f in FILE_PRIORITY ? FILE_PRIORITY[f] : 2);
// ───────────────────────────────────────────────────────────────────────

const hasHangul = (s) => /[가-힣]/.test(s);
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 키워드 뒤에 붙어도 정상인 조사·접미 첫 음절 (복합어 의심 리포트 노이즈 제거용 휴리스틱)
const PARTICLE_SYL = new Set([..."을를이가은는와과도만의에로라나든께랑당으자면함보일시질한"]);

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
  // 보호 구간: <noparse>…</noparse>(게임이 직접 파싱 금지 표시) + 이미 파싱된 [...] 토큰
  //   + PROTECT_WORDS(복합어). 모두 통째로 보존(부분 매칭 차단).
  const protectAlt = ["<noparse>[\\s\\S]*?</noparse>", "\\[[^\\[\\]]*\\]"].concat(
    [...PROTECT_WORDS].sort((a, b) => b.length - a.length).map(escapeRE)
  );
  const protectRE = new RegExp(protectAlt.join("|"), "g");

  // 한 문자열 치환. usage: name→count, suspects: 복합어 의심 누적. 반환 {text, changed}
  function replace(text, usage, suspects) {
    let changed = false;
    let out = "";
    let last = 0;
    let m;
    protectRE.lastIndex = 0;
    const segs = [];
    while ((m = protectRE.exec(text)) !== null) {
      segs.push(["plain", text.slice(last, m.index)]);
      segs.push(["prot", m[0]]);
      last = m.index + m[0].length;
    }
    segs.push(["plain", text.slice(last)]);

    for (let i = 0; i < segs.length; i++) {
      const [kind, seg] = segs[i];
      if (kind === "prot") {
        out += seg;
        continue;
      }
      // [TabExplain] 은 "바로 앞의 평문 구절"에 툴팁을 다는 게임 관례
      //   (보호[TabExplain] · 새벽 사무소[TabExplain] · 라만차랜드[TabExplain] · 행동 불가[TabExplain])
      // 그 구절을 토큰화하면 항상 오탐 → 평문 세그먼트 끝에서 끝나는 매치만 건너뛴다.
      // (문장 앞쪽의 정상 키워드는 영향 없음)
      const next = segs[i + 1];
      const beforeTab = !!next && next[0] === "prot" && next[1].startsWith("[TabExplain");
      out += seg.replace(kwRE, (name, offset, full) => {
        if (beforeTab && offset + name.length === full.length) return name;
        const entry = nameMap.get(name);
        if (!entry) return name;
        changed = true;
        if (usage) usage.set(name, (usage.get(name) || 0) + 1);
        if (suspects) {
          // 키워드 바로 뒤의 한글 연속 → 복합어 의심 (조사로 시작하면 제외)
          let j = offset + name.length, run = "";
          while (j < full.length && /[가-힣]/.test(full[j])) run += full[j++];
          if (run && !PARTICLE_SYL.has(run[0])) suspects.set(name + run, (suspects.get(name + run) || 0) + 1);
        }
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
// 소유자(인격/EGO) 출시일 맵. 레코드 id 앞 5자리 = 소유자 id.
//   스킬 1021603→10216 · 패시브 1111513→11115 · EGO 스킬 201091→20109 · EGO 패시브 2010111→20101
function buildOwnerDates() {
  const m = new Map();
  const rows = (p) => {
    const d = JSON.parse(readFileSync(p, "utf-8"));
    return d.list || d.dataList || [];
  };
  for (const f of listJson(join(DATA, "personality", "info"), () => true)) {
    for (const r of rows(f)) {
      if (r.id != null && r.updatedDate != null) m.set(String(r.id), String(r.updatedDate));
    }
  }
  // EGO 장비 레코드(characterId 보유)만. ego-skill-*.json 은 스킬 레코드라 제외.
  for (const f of listJson(join(DATA, "egoskill"), (x) => !x.startsWith("ego-skill"))) {
    for (const r of rows(f)) {
      if (r.characterId != null && r.updatedDate != null) m.set(String(r.id), String(r.updatedDate));
    }
  }
  return m;
}
const OWNER_DATES = buildOwnerDates();
let cutoffSkipped = 0;
let unusedSkipped = 0;
// 소유자를 못 찾으면(공용·시스템 레코드) 컷오프 미적용 = 기존 동작 유지(보수적).
const isPostCutoff = (id) => {
  const d = OWNER_DATES.get(String(id).slice(0, 5));
  return !!d && d >= CUTOFF_DATE;
};

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
function processFile(path, replace, usage, changes, suspects) {
  const raw = readFileSync(path, "utf-8");
  const rel = relative(DATA, path); // change-set 미러 경로
  const data = JSON.parse(raw);
  const list = data.dataList || [];
  const edits = new Map(); // 원본 desc 문자열 → 새 desc 문자열 (파일 내 유일 치환)

  const handleDesc = (desc, loc) => {
    if (typeof desc !== "string" || !desc) return;
    const { text, changed } = replace(desc, usage, suspects);
    if (!changed) return;
    edits.set(desc, text);
    changes.push({ file: basename(path), rel, loc, before: desc, after: text });
  };

  for (const item of list) {
    const id = item.id;
    if (SKIP_IDS.has(String(id))) continue; // 레코드 통째 파싱 제외
    if (UNUSED_IDS.has(String(id))) { unusedSkipped++; continue; } // 사이트 미사용 공용·시스템 레코드
    if (isPostCutoff(id)) { cutoffSkipped++; continue; } // 컷오프 이후 출시 → 이미 authoring 됨
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
const suspects = new Map();
let filesChanged = 0;
const files = targetFiles();
for (const f of files) {
  if (processFile(f, replace, usage, changes, suspects)) filesChanged++;
}

// ── change-set 출력 (검수용): keyword_changeset/ 에 대상 파일별 [{loc, before, after}] ──
// 변경이 있을 때만 갱신 → 이미 토큰화된 data/ 에 재실행해도 기존 산출물을 빈 값으로 덮지 않음.
if (changes.length > 0) {
  const byRel = new Map();
  for (const f of files) byRel.set(relative(DATA, f), []); // 변경 없는 파일도 [] 로 기록(스테일 제거)
  for (const c of changes) byRel.get(c.rel).push({ loc: c.loc, before: c.before, after: c.after });
  for (const [rel, arr] of byRel) {
    const out = join(CHANGESET_DIR, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(arr, null, 2) + "\n", "utf-8");
  }
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
lines.push(`- 컷오프 ${CUTOFF_DATE} 이후 출시 → 스킵한 레코드: ${cutoffSkipped}건`);
lines.push(`- 사이트 미사용(UNUSED_IDS) → 스킵한 레코드: ${unusedSkipped}건`);
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

lines.push("== 복합어 의심 (키워드가 더 긴 단어 안에 들어감 → PROTECT_WORDS 후보) ==");
lines.push("   조사로 시작하는 경우는 제외한 휴리스틱. 진짜 복합어면 PROTECT_WORDS 에 추가.");
const sus = [...suspects.entries()].sort((a, b) => b[1] - a[1]);
if (sus.length === 0) lines.push("(없음)");
for (const [w, cnt] of sus) lines.push(`  ${String(cnt).padStart(4)}  ${w}`);
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
console.log(changes.length > 0 ? `change-set: ${CHANGESET_DIR}/ (검수용 git diff)` : `change-set: (변경 0 → 갱신 안 함)`);
