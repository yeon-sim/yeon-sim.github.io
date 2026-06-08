# data_override — 데이터 오버라이드

게임 데이터 재추출 시 **수동 수정이 롤백되는 것을 방지**하기 위한 디렉터리입니다.

- 여기 파일은 `data/`의 **같은 상대경로·파일명**을 패치합니다.
  예) `data_override/personality/info/personality-07.json` → `data/personality/info/personality-07.json`
- 이 디렉터리는 Hugo가 읽지 않으며, 재추출도 건드리지 않습니다.
- 적용: `node scripts/apply-overrides.mjs --write`

## 패치 파일 형식

원본과 같은 컨테이너(`dataList`/`list` 등)에, **바꿀 레코드의 `id` + 바꿀 필드만**(최소 패치) 적습니다.

```jsonc
// 원본 data/.../Skill.json
{ "dataList": [ { "id": "2234", "value": "100", "desc": "World" } ] }

// data_override/.../Skill.json (최소 패치)
{ "dataList": [ { "id": "2234", "summary": "Foobar" } ] }

// 적용 결과 (id로 매칭, 필드만 deep-merge)
{ "dataList": [ { "id": "2234", "value": "100", "desc": "World", "summary": "Foobar" } ] }
```

규칙: `id` 매칭 · deep-merge(배열은 교체) · 없는 `id`는 신규 추가 · 멱등.
