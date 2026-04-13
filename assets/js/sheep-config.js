// ── sheep 바운스 amplitude 가중치 테이블 ──
// value  : amplitude (px)
// weight : 상대 가중치 (합계가 1.0일 필요 없음, 자동 정규화)
const SHEEP_AMPLITUDE_TABLE = [
  { value:   0, weight: 0.70 },
  { value:  30, weight: 0.10 },
  { value:  50, weight: 0.10 },
  { value:  70, weight: 0.09 },
  { value: 250, weight: 0.01 },
];
