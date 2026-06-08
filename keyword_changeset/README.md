# keyword_changeset — 키워드 파싱 검수 자료 (생성물)

`scripts/parse-keywords.mjs` 가 출력하는 **검수용 change-set** 입니다.

- `data/lang/kr/` 의 대상 파일을 미러링한 경로에, 각 desc의 **`{loc, before, after}`** 를 담습니다.
  - 예) `keyword_changeset/lang/kr/skill/KR_Skills_personality-01.json`
- **용도**: 게임 업데이트마다 이 디렉터리의 **git diff** 를 보면, 키워드 파싱이 **새로 바꾼 것(델타)** 만 확인할 수 있습니다.
- **생성물이므로 손으로 고치지 마세요.** 오탐 수정은 `scripts/parse-keywords.mjs` 상단 상수(`ID_OVERRIDES`/`EXCLUDE_NAMES`/`SKIP_IDS`/`PROTECT_WORDS`) 또는 게임의 `<noparse>` 로.
- 변경이 0이면 갱신하지 않습니다(이미 토큰화된 `data/` 에 재실행해도 비워지지 않음).

자세한 워크플로는 프로젝트 `.claude/CLAUDE.md` "키워드 파싱 전처리" 참고.
