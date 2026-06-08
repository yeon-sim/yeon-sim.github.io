// 데이터 오버라이드 적용 스크립트
//
// data_override/ 의 패치 파일을 같은 상대경로의 data/ 파일에 id 단위로 deep-merge 한다.
// 게임 데이터 재추출로 data/ 가 덮여도, data_override/ 는 그대로 남아 재실행으로 수정사항을 복원한다.
//
//   node scripts/apply-overrides.mjs           # dry-run: 리포트만 생성, 파일 미수정
//   node scripts/apply-overrides.mjs --write    # data/ 에 실제 적용
//
// 규칙:
//  - 매칭 키: id (컨테이너 dataList / list / 최상위 배열 자동탐지)
//  - 병합: deep-merge, 배열은 교체
//  - 오버라이드에만 있는 새 id 는 append (리포트에 [신규] 표시)
//  - 컨테이너가 없는 최상위 객체(키 맵/단일 레코드)는 최상위 키 기준 deep-merge
//  - 멱등: 값 set 방식이라 재실행해도 결과 동일

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DATA_DIR = "data";
const OVERRIDE_DIR = "data_override";
const REPORT_PATH = "scripts/apply-overrides-report.txt";
const WRITE = process.argv.includes("--write");
const KEY = "id";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// deep-merge: src 가 이김, 배열/스칼라는 교체. target 의 키 순서 보존(새 키는 뒤에 추가).
function deepMerge(target, src) {
  const out = { ...target };
  for (const k of Object.keys(src)) {
    out[k] = isObj(out[k]) && isObj(src[k]) ? deepMerge(out[k], src[k]) : src[k];
  }
  return out;
}

// 패치 leaf 단위 비교 → 변경/중복 리포트용
function diffLeaves(targetRec, patch, prefix = "") {
  const leaves = [];
  for (const k of Object.keys(patch)) {
    if (k === KEY && !prefix) continue; // 최상위 매칭 키는 비교 제외
    const path = prefix ? `${prefix}.${k}` : k;
    const pv = patch[k];
    const tv = targetRec == null ? undefined : targetRec[k];
    if (isObj(pv) && isObj(tv)) leaves.push(...diffLeaves(tv, pv, path));
    else leaves.push({ path, old: tv, new: pv, same: JSON.stringify(tv) === JSON.stringify(pv) });
  }
  return leaves;
}

// 컨테이너(레코드 배열) 위치 탐지
function container(obj) {
  if (Array.isArray(obj)) return { key: null, arr: obj };
  if (Array.isArray(obj.dataList)) return { key: "dataList", arr: obj.dataList };
  if (Array.isArray(obj.list)) return { key: "list", arr: obj.list };
  return null;
}

function detectIndent(raw) {
  const m = raw.match(/\n([ \t]+)\S/);
  return m ? m[1] : "  ";
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

const fmtVal = (v) => (v === undefined ? "(없음)" : JSON.stringify(v));

const overrideFiles = walk(OVERRIDE_DIR);
const report = [];
let nApplied = 0, nNew = 0, nRedundant = 0, nOrphan = 0, nFiles = 0;

for (const ovPath of overrideFiles) {
  const rel = relative(OVERRIDE_DIR, ovPath);
  const targetPath = join(DATA_DIR, rel);

  if (!existsSync(targetPath)) {
    report.push(`[orphan] ${ovPath} → 대상 파일 없음: ${targetPath}`);
    nOrphan++;
    continue;
  }

  const targetRaw = readFileSync(targetPath, "utf-8");
  const indent = detectIndent(targetRaw);
  let target, override;
  try { target = JSON.parse(targetRaw); } catch { report.push(`[오류] 대상 JSON 파싱 실패: ${targetPath}`); continue; }
  try { override = JSON.parse(readFileSync(ovPath, "utf-8")); } catch { report.push(`[오류] 오버라이드 JSON 파싱 실패: ${ovPath}`); continue; }

  const fileLines = [];
  const tc = container(target);
  const oc = container(override);

  if (tc && oc) {
    // 배열 컨테이너 → id 매칭
    const byId = new Map(tc.arr.map((r, i) => [String(r[KEY]), i]));
    for (const orec of oc.arr) {
      const id = String(orec[KEY]);
      if (id === "undefined") { fileLines.push(`  [경고] ${KEY} 없는 오버라이드 레코드 건너뜀`); continue; }
      if (byId.has(id)) {
        const i = byId.get(id);
        const leaves = diffLeaves(tc.arr[i], orec);
        const changed = leaves.filter((l) => !l.same);
        if (changed.length === 0) {
          fileLines.push(`  [중복] ${KEY} ${id}: ${leaves.map((l) => l.path).join(", ")} (원본과 동일 → 삭제 후보)`);
          nRedundant++;
        } else {
          fileLines.push(`  [적용] ${KEY} ${id}`);
          for (const l of changed) fileLines.push(`     ${l.path}: ${fmtVal(l.old)} → ${fmtVal(l.new)}`);
          tc.arr[i] = deepMerge(tc.arr[i], orec);
          nApplied++;
        }
      } else {
        tc.arr.push(orec);
        fileLines.push(`  [신규] ${KEY} ${id} (원본에 없던 레코드 추가)`);
        nNew++;
      }
    }
  } else if (isObj(target) && isObj(override) && !tc && !oc) {
    // 최상위 키 맵 / 단일 레코드 → 최상위 키 기준 deep-merge
    const leaves = diffLeaves(target, override);
    const changed = leaves.filter((l) => !l.same);
    if (changed.length === 0) {
      fileLines.push(`  [중복] 최상위: ${leaves.map((l) => l.path).join(", ")} (원본과 동일 → 삭제 후보)`);
      nRedundant++;
    } else {
      for (const l of changed) fileLines.push(`  [적용] ${l.path}: ${fmtVal(l.old)} → ${fmtVal(l.new)}`);
      target = deepMerge(target, override);
      nApplied++;
    }
  } else {
    report.push(`[오류] shape 불일치(컨테이너 탐지 실패): ${ovPath}`);
    continue;
  }

  if (fileLines.length) {
    report.push(`\n### ${targetPath}`);
    report.push(...fileLines);
    nFiles++;
  }

  if (WRITE) writeFileSync(targetPath, JSON.stringify(target, null, indent) + "\n");
}

const header = [
  `== apply-overrides 리포트 (${WRITE ? "WRITE 적용됨" : "DRY-RUN"}) ==`,
  `오버라이드 파일: ${overrideFiles.length}개 | 변경 파일: ${nFiles}`,
  `적용 ${nApplied} · 신규 ${nNew} · 중복(삭제후보) ${nRedundant} · orphan ${nOrphan}`,
  "",
];
const text = header.concat(report).join("\n") + "\n";
writeFileSync(REPORT_PATH, text);

console.log(header.join("\n"));
console.log(WRITE ? `→ data/ 에 적용 완료.` : `→ dry-run. 적용하려면 --write. 리포트: ${REPORT_PATH}`);
