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

**파일 단위 플래그**는 컨테이너 없이 그 키만 적습니다. 대상에 `dataList`가 있어도 최상위에 병합됩니다.

```jsonc
// data_override/lang/kr/parsingdata/KR_SkillTag.json
{ "skillTag": true }
```

단 패치에 `id`가 있으면 레코드 패치 오작성으로 보고 shape 오류로 남깁니다.

## lang 파일 오버라이드 (중요)

`data/lang/kr/`는 `scripts/sync-lang.mjs`가 게임 클라이언트 원본으로 **통째 덮어씁니다.**
그래서 lang에 대한 수동 수정은 **반드시 여기에 등록**해야 합니다 — 안 그러면 다음 동기화에서 사라집니다.
(`sync-lang`이 복사 전에 미등록 수동 수정을 검출해 경고하고 `--write`를 거부하지만, 그 검사는
"사이트에만 있는 레코드/최상위 키"만 잡습니다. **기존 레코드의 필드를 고친 편집은 탐지되지 않습니다.**)
