// 헤더·푸터만 있는 단순 페이지(사이트 소개·개인정보처리방침·전체 목록)용 Alpine 스코프.
//
// site-header.html 이 ui() 를, sponsor-modal.html 이 sponsorModal 을 쓰므로 이 컴포넌트가 필요하다.
// UI_KR(정적 UI 문구 kr 카탈로그)은 각 레이아웃이 빌드타임에 인라인으로 선언한다
// (classic script 의 최상위 const 라 window 에 붙지 않아 typeof 로 확인).
//
// ⚠️ 기프트·수감자 페이지는 각자의 큰 컴포넌트 안에 같은 로직을 갖고 있다.
//    그쪽은 loadUI 에 폰트 맞춤 호출 등이 얽혀 있어 이 mixin 으로 합치지 않았다.
function simplePage() {
  return {
    sponsorModal: false,
    lang: 'kr',
    uiL: null,
    ui(key) {
      const kr = (typeof UI_KR !== 'undefined') ? UI_KR : {};
      return (this.uiL && this.uiL[key]) || kr[key] || key;
    },
    loadUI() {   // baseof 의 UI_ALL 에서 동기 조회 (예전엔 /lang/ui-{lc}.json fetch)
      this.uiL = (this.lang === 'kr' || typeof UI_ALL === 'undefined') ? null : (UI_ALL[this.lang] || null);
    },
    // 헤더의 언어 토글. 기프트·수감자 페이지의 setLang 과 동작을 맞춘다
    // (localStorage 공통 키 저장 + 루트 밖 스코프에 이벤트 통지).
    setLang(lc) {
      if (lc === this.lang) return;
      this.lang = lc;
      localStorage.setItem('giftLang', lc);
      this.loadUI();
      window.dispatchEvent(new CustomEvent('yeonsim:lang', { detail: lc }));
    },
    init() {
      this.lang = window.yeonsimLang();   // 사이트 공통 언어(선택값 > 브라우저 언어 > kr)
      this.loadUI();
    },
  };
}
