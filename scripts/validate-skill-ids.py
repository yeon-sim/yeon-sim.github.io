import os
import json

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'personality')
INFO_DIR  = os.path.join(BASE, 'info')
SKILL_DIR = os.path.join(BASE, 'skill')

# skill 파일에서 모든 id 수집
skill_ids = set()
for fname in os.listdir(SKILL_DIR):
    if not fname.endswith('.json'):
        continue
    with open(os.path.join(SKILL_DIR, fname), encoding='utf-8') as f:
        data = json.load(f)
    for skill in data.get('list', []):
        skill_ids.add(skill['id'])

print(f"skill 파일 총 id 수: {len(skill_ids)}")

# info 파일에서 attributeList의 skillId 검증
missing = []  # (info_file, personality_id, skillId)

for fname in sorted(os.listdir(INFO_DIR)):
    if not fname.endswith('.json'):
        continue
    with open(os.path.join(INFO_DIR, fname), encoding='utf-8') as f:
        data = json.load(f)
    for personality in data.get('list', []):
        pid = personality.get('id')
        for attr in personality.get('attributeList', []):
            sid = attr.get('skillId')
            if sid not in skill_ids:
                missing.append((fname, pid, sid))

if not missing:
    print("\n검증 통과: 모든 skillId가 skill 파일에 존재합니다.")
else:
    print(f"\n누락된 skillId {len(missing)}건:")
    for fname, pid, sid in missing:
        print(f"  [{fname}] 인격 id={pid} → skillId={sid} 없음")
