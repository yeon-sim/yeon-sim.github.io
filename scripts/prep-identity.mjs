import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/*
  인격·EGO 추가/갱신의 "기계적 작업 + 감사"를 1회 실행으로 처리한다.
  목적: 갱신 때마다 대화로 반복하던 소스 탐색·복사·이미지 수집·누락 점검을
        결정용 요약 리포트 한 장으로 대체(속도·토큰 최소화).

  담당: step 0(preview 정리) · 1(데이터 .bytes→.json) · 2(illust-pivots)
        · 5(이미지 변환 + 버프 아이콘) + 감사(이름/season/누락 스킬아이콘/preview 충돌)
  비담당(검수 필요 → 리마인드만): apply-overrides · parse-keywords · hugo

  사용법 (yeon-sim.github.io 에서 실행):
    node scripts/prep-identity.mjs 10216 11216 20109 --from ../260709
        dry-run: 무엇을 할지 + 감사만 출력, 파일 미변경
    node scripts/prep-identity.mjs 10216 11216 20109 --from ../260709 --write
        실제 복사·변환·preview 정리 수행

  ※ 언어(KR_*)·parsingdata 는 사용자가 data/lang/kr 에 선배치. 감사는 그걸 읽는다.
*/

// ── 인자 파싱 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const fromIdx = argv.indexOf('--from');
const FROM = fromIdx >= 0 ? argv[fromIdx + 1] : null;
const ids = argv.filter(a => /^\d+$/.test(a));
if (!FROM || ids.length === 0) {
  console.error('사용법: node scripts/prep-identity.mjs <id...> --from <추출디렉토리> [--write]');
  process.exit(1);
}

const SD = path.resolve(FROM, 'Assets/Resources_moved/StaticData/static-data');
const SPR = path.resolve(FROM, 'Assets/Resources_moved/Sprite');
const BUF = path.resolve(FROM, 'Assets/Resources_moved/Buf');
const DATA = path.resolve('data');
const IMG = path.resolve('static/images');
const QUALITY = 85;

// 인격(1xxxx) / EGO(2xxxx) 분류. NN = 2·3번째 자리("02"), egoFileNum = 정수(1)
const persons = ids.filter(i => i[0] === '1').map(id => ({ id, nn: id.slice(1, 3) }));
const egos = ids.filter(i => i[0] === '2').map(id => ({ id, nn: id.slice(1, 3), fileNum: parseInt(id.slice(1, 3), 10) }));

const detail = [];   // 상세 리포트(파일)
const warn = [];     // 감사 경고(요약에도 노출)
const log = (s) => detail.push(s);

// ── 유틸 ─────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const listOf = (d) => Array.isArray(d) ? d : (d.list || d.dataList || []);
function copyBytes(src, dst) {                // .bytes→.json (확장자만, 내용은 이미 JSON)
  if (!fs.existsSync(src)) { warn.push(`소스 없음: ${path.relative(path.resolve(FROM), src)}`); return false; }
  if (WRITE) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
  log(`  ${WRITE ? '복사' : '복사예정'}: ${path.basename(src)} → ${path.relative(DATA, dst)}`);
  return true;
}
async function convert(src, dst) {            // PNG→webp(절반, q85)
  if (WRITE) {
    const m = await sharp(src).metadata();
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await sharp(src).resize(m.width >> 1, m.height >> 1).webp({ quality: QUALITY }).toFile(dst);
  }
}
function walkPng(dir) {                        // 재귀 .png 수집
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkPng(full));
    else if (/\.png$/i.test(e.name)) out.push(full);
  }
  return out;
}
function destForImg(name) {                    // add-image.mjs 와 동일 규칙
  if (/^\d+$/.test(name)) return path.join(IMG, 'skill', 'skill_icon', `${name}.webp`);
  const m = name.match(/^([12])(\d{2})\d{2}_/);
  if (m) return path.join(IMG, m[1] === '1' ? 'personality' : 'egoskill', m[2], `${name}.webp`);
  return null;
}

// ── 1. 데이터 복사 ────────────────────────────────────────────────────────
let dataN = 0;
log('## 데이터 (.bytes → .json)');
for (const { nn } of persons) {
  dataN += copyBytes(`${SD}/personality/personality-${nn}.bytes`, `${DATA}/personality/info/personality-${nn}.json`);
  dataN += copyBytes(`${SD}/skill/personality-skill-${nn}.bytes`, `${DATA}/personality/skill/personality-skill-${nn}.json`);
  dataN += copyBytes(`${SD}/personality-passive/personality-passive-${nn}.bytes`, `${DATA}/personality/passive/personality-passive-${nn}.json`);
}
if (persons.length) {  // 공유 패시브 정의(신규 패시브 추가분) — 인격 있을 때만
  dataN += copyBytes(`${SD}/passive/passive.bytes`, `${DATA}/personality/passive/passive.json`);
  dataN += copyBytes(`${SD}/passive/passive_check4.bytes`, `${DATA}/personality/passive/passive_check4.json`);
}
for (const { fileNum } of egos) {
  dataN += copyBytes(`${SD}/ego/ego-${fileNum}.bytes`, `${DATA}/egoskill/ego-${fileNum}.json`);
  dataN += copyBytes(`${SD}/skill/ego-skill-${fileNum}.bytes`, `${DATA}/egoskill/ego-skill-${fileNum}.json`);
}

// ── 2. illust-pivots (인격 있을 때) ────────────────────────────────────────
let pivot = false;
if (persons.length) {
  log('## illust-pivots');
  pivot = copyBytes(`${SD}/illust-pivots-unitinfo/illust-pivots-unitinfo.bytes`, `${DATA}/personality/illust-pivots-unitinfo.json`);
}

// ── 0. preview 정리 (충돌 id 제거) ─────────────────────────────────────────
log('## preview 정리');
const previewRemoved = [];
for (const [file, wantIds] of [
  [`${DATA}/preview/personality.json`, persons.map(p => +p.id)],
  [`${DATA}/preview/egoskill.json`, egos.map(e => +e.id)],
]) {
  if (!fs.existsSync(file)) continue;
  const d = readJson(file);
  const before = (d.list || []).length;
  const kept = (d.list || []).filter(r => !wantIds.includes(+r.id));
  const removed = before - kept.length;
  if (removed > 0) {
    previewRemoved.push(`${path.basename(file)}:${removed}`);
    if (WRITE) { d.list = kept; fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n'); }
    log(`  ${WRITE ? '제거' : '제거예정'}: ${path.basename(file)} 에서 ${removed}건`);
  }
}

// ── 5a. 이미지 (CG/info/profile/support/EGO CG + 스킬아이콘) ─────────────────
log('## 이미지');
let imgN = 0;
const idRe = (id) => new RegExp(`^${id}(_|$)`);
// 인격/EGO 유닛 이미지: Sprite/Unit + UserInfoSuppotPortrait 에서 id 매칭
const unitPngs = [...walkPng(`${SPR}/Unit`), ...walkPng(`${SPR}/UserInfoSuppotPortrait`)];
for (const { id } of [...persons, ...egos]) {
  for (const src of unitPngs) {
    const base = path.basename(src, '.png');
    if (!idRe(id).test(base)) continue;
    const dst = destForImg(base);
    if (!dst) continue;
    await convert(src, dst);
    log(`  img: ${base}.png → ${path.relative(IMG, dst)}`); imgN++;
  }
}
// 스킬 아이콘 + 누락 감사 (skillData.iconID ?? skillId, 비히든 스킬 기준)
for (const { nn } of persons) {
  const sf = `${SD}/skill/personality-skill-${nn}.bytes`;
  if (!fs.existsSync(sf)) continue;
  const skills = listOf(readJson(sf)).filter(r => String(r.id).startsWith('1' + nn));
  const iconIds = new Set();
  const neededByVisible = new Set();
  for (const r of skills) {
    const sds = r.skillData || [];
    const icons = sds.length ? sds.map(sd => sd.iconID || r.id) : [r.id];
    icons.forEach(i => iconIds.add(i));
    if (!r.isHiddenForUI) icons.forEach(i => neededByVisible.add(i));
  }
  for (const icon of iconIds) {
    const src = `${SPR}/SkillIcon/${icon}.png`;
    if (fs.existsSync(src)) { await convert(src, path.join(IMG, 'skill', 'skill_icon', `${icon}.webp`)); log(`  skillicon: ${icon}`); imgN++; }
  }
  for (const icon of neededByVisible) {
    const hasSrc = fs.existsSync(`${SPR}/SkillIcon/${icon}.png`);
    const hasWebp = fs.existsSync(path.join(IMG, 'skill', 'skill_icon', `${icon}.webp`));
    if (!hasSrc && !hasWebp) warn.push(`스킬아이콘 누락: ${icon} (인격 ${nn}, 표시 스킬이 참조하나 소스·기존 webp 모두 없음)`);
  }
}

// ── 5b. 버프/키워드 아이콘 (parsingdata 정의 ∩ Buf 존재 ∩ static 없음) ────────
log('## 버프 아이콘');
const buffDst = `${IMG}/buff`;
const pdDir = `${DATA}/lang/kr/parsingdata`;
let buffN = 0, buffNames = [];
if (!fs.existsSync(pdDir)) {
  warn.push('parsingdata 없음 → 버프 아이콘 누락 점검 불가 (사용자 lang 배치 확인)');
} else if (fs.existsSync(BUF)) {
  const pdText = fs.readdirSync(pdDir)
    .filter(f => f.endsWith('.json')).map(f => fs.readFileSync(path.join(pdDir, f), 'utf-8')).join('\n');
  for (const f of fs.readdirSync(BUF).filter(f => f.endsWith('.png'))) {
    const kw = path.basename(f, '.png');
    if (fs.existsSync(`${buffDst}/${f}`)) continue;          // 이미 있음
    if (!pdText.includes(`"${kw}"`)) continue;               // parsingdata 미정의 → 스킵
    if (WRITE) { fs.mkdirSync(buffDst, { recursive: true }); fs.copyFileSync(`${BUF}/${f}`, `${buffDst}/${f}`); }
    buffNames.push(kw); buffN++;
    log(`  buff: ${kw} (${WRITE ? '복사' : '복사예정'})`);
  }
}

// ── 감사: 이름(KR_*) · season(KR_Season) · preview 충돌 ─────────────────────
log('## 감사');
function findRecord(file, id) {
  if (!fs.existsSync(file)) return null;
  return listOf(readJson(file)).find(r => +r.id === +id) || null;
}
const krPers = `${DATA}/lang/kr/KR_Personalities.json`;
const krEgos = `${DATA}/lang/kr/egoskill/KR_Egos.json`;
const krSeason = `${DATA}/lang/kr/KR_Season.json`;
const seasonIds = fs.existsSync(krSeason) ? new Set(listOf(readJson(krSeason)).map(r => +r.id)) : null;
for (const { id, nn } of persons) {
  if (!findRecord(krPers, id)) warn.push(`이름 누락: KR_Personalities 에 ${id} 없음 (인격 이름 nil → 빌드/표시 문제)`);
  const info = findRecord(`${SD}/personality/personality-${nn}.bytes`, id);
  if (info && seasonIds && !seasonIds.has(+info.season)) warn.push(`season 누락: ${id} 의 season ${info.season} 이 KR_Season 에 없음 (빌드 실패 위험)`);
}
for (const { id, fileNum } of egos) {
  if (!findRecord(krEgos, id)) warn.push(`이름 누락: KR_Egos 에 ${id} 없음`);
  const info = findRecord(`${SD}/ego/ego-${fileNum}.bytes`, id);
  if (info && seasonIds && info.season != null && !seasonIds.has(+info.season)) warn.push(`season 누락: EGO ${id} season ${info.season} 이 KR_Season 에 없음`);
}
if (previewRemoved.length && !WRITE) warn.push(`preview 충돌: ${previewRemoved.join(', ')} (--write 시 정리됨)`);

// ── 리포트 출력 ────────────────────────────────────────────────────────────
const reportFile = 'scripts/prep-identity-report.txt';
fs.writeFileSync(reportFile, detail.join('\n') + '\n');
const tag = WRITE ? 'WRITE' : 'DRY-RUN';
const idTags = ids.map(i => `${i}(${i[0] === '1' ? 'p' : 'e'})`).join(' ');
console.log(`\nprep-identity (${tag})  ids: ${idTags}  from: ${FROM}\n`);
console.log(`DATA    ${dataN} files ${WRITE ? '복사' : '복사예정'}`);
console.log(`PIVOT   ${persons.length ? (pivot ? 'illust-pivots ok' : '실패') : '(인격 없음)'}`);
console.log(`PREVIEW ${previewRemoved.length ? previewRemoved.join(', ') + (WRITE ? ' 정리' : ' 정리예정') : '(충돌 없음)'}`);
console.log(`IMAGES  ${imgN}개 ${WRITE ? '변환' : '변환예정'}`);
console.log(`BUFF    ${buffN}개 신규${buffNames.length ? ' (' + buffNames.slice(0, 6).join(',') + (buffNames.length > 6 ? '…' : '') + ')' : ''}`);
console.log(`AUDIT   ${warn.length ? '⚠ ' + warn.length + '건' : '✓ 이상 없음'}`);
warn.forEach(w => console.log(`   ⚠ ${w}`));
console.log(`\nNEXT    apply-overrides --write · parse-keywords --write (검수) · hugo`);
console.log(`detail  ${reportFile}`);
