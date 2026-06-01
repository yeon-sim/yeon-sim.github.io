import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/*
  PNG → 가로·세로 절반(floor) → webp(quality 85) 변환기.
  personality / egoskill / skill icon 세 종류를 다룬다.

  사용법:
    node scripts/add-image.mjs <png경로...>
        지정한 PNG(또는 폴더 내 PNG)를 파일명으로 종류·대상폴더를 판별해
        static의 올바른 위치에 변환한다. (Assetripper 원본을 바로 가리켜도 됨, 덮어씀)

    node scripts/add-image.mjs
        static의 세 대상 폴더(skill_icon · personality · egoskill)에 놓여 있으나
        아직 webp로 변환되지 않은 .png를 찾아 같은 자리에 변환한다.

  ※ yeon-sim.github.io 디렉토리에서 실행한다.
*/

const DEST_ROOT = path.resolve('static/images');
const QUALITY   = 85;

// 스캔 대상(= 변환 결과가 놓이는) 폴더
const SCAN_DIRS = [
  path.join(DEST_ROOT, 'skill', 'skill_icon'),
  path.join(DEST_ROOT, 'personality'),
  path.join(DEST_ROOT, 'egoskill'),
];

// arg 모드: 파일명 → 대상 webp 절대경로. 판별 불가 시 null.
function destFor(name) {
  if (/^\d+$/.test(name)) {
    // 언더스코어 없는 숫자 = 스킬 아이콘
    return path.join(DEST_ROOT, 'skill', 'skill_icon', `${name}.webp`);
  }
  const m = name.match(/^([12])(\d{2})\d{2}_/);
  if (m) {
    // 1xxxx_ = personality, 2xxxx_ = egoskill, 캐릭터 폴더 = 2·3번째 자리
    const category = m[1] === '1' ? 'personality' : 'egoskill';
    return path.join(DEST_ROOT, category, m[2], `${name}.webp`);
  }
  return null;
}

async function convert(srcPath, destPath) {
  const meta = await sharp(srcPath).metadata();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await sharp(srcPath)
    .resize(meta.width >> 1, meta.height >> 1)   // 절반(floor)
    .webp({ quality: QUALITY })
    .toFile(destPath);
}

// 디렉토리 내 .png 재귀 수집
function collectPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectPngs(full));
    else if (/\.png$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function runArgs(args) {
  const pngs = args.flatMap(a => {
    if (!fs.existsSync(a)) { console.warn(`  경고: 경로 없음 ${a}`); return []; }
    return fs.statSync(a).isDirectory() ? collectPngs(a) : [a];
  });

  let ok = 0, skipUnknown = 0;
  for (const src of pngs) {
    const name = path.basename(src, '.png');
    const dest = destFor(name);
    if (!dest) { skipUnknown++; console.warn(`  판별 불가(건너뜀): ${name}`); continue; }
    await convert(src, dest);
    console.log(`  변환: ${name}.png → ${path.relative(DEST_ROOT, dest)}`);
    ok++;
  }
  console.log(`\n완료: ${ok}개 변환` + (skipUnknown ? `, ${skipUnknown}개 판별 불가` : ''));
}

async function runScan() {
  let ok = 0, skipExists = 0;
  for (const src of SCAN_DIRS.flatMap(collectPngs)) {
    const dest = src.replace(/\.png$/i, '.webp');
    if (fs.existsSync(dest)) { skipExists++; continue; }   // 이미 변환됨
    await convert(src, dest);
    console.log(`  변환: ${path.relative(DEST_ROOT, src)} → ${path.basename(dest)}`);
    ok++;
  }
  console.log(`\n완료: ${ok}개 변환, ${skipExists}개 기존 유지`);
}

const args = process.argv.slice(2);
(args.length ? runArgs(args) : runScan());
