import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC_DIR  = path.resolve('temp/character_illust');
const DEST_DIR = path.resolve('static/images/personality');

const files = fs.readdirSync(SRC_DIR)
  .filter(f => f.match(/support_personality\.png$/i));

console.log(`변환 대상: ${files.length}개`);

let ok = 0, skip = 0;

for (const file of files) {
  const id = file.substring(0, 5);           // e.g. "10814"
  const prisonerDir = id.substring(1, 3);    // e.g. "08"
  const destFolder = path.join(DEST_DIR, prisonerDir);
  const destFile = path.join(destFolder, file.replace(/\.png$/i, '.webp'));

  if (!fs.existsSync(destFolder)) {
    console.warn(`  건너뜀 (디렉토리 없음): ${prisonerDir} ← ${file}`);
    skip++;
    continue;
  }

  await sharp(path.join(SRC_DIR, file))
    .webp({ lossless: true })
    .toFile(destFile);

  ok++;
}

console.log(`완료: ${ok}개 변환, ${skip}개 건너뜀`);
