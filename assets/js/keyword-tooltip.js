function kwTooltipMixin() {
  return {
    kwTooltip: null,

    openKwTooltip(kwId, clientX, clientY) {
      const b = kwMap?.[kwId];
      if (!b) return;
      const descHtml = (b.desc || '')
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\[([^\[\]]+)\]/g, (match, kw) => {
          const inner = kwMap?.[kw];
          if (!inner) return match;
          const icFallback = inner.iconId
            ? `this.src='/images/buff/${inner.iconId}.png';this.onerror=null;`
            : `this.style.display='none';`;
          const ic = `<img class="buff-keyword-icon" src="/images/buff/${kw}.png" onerror="${icFallback}" alt="">`;
          return `<span class="buff-keyword no-click">${ic}${(inner.name || '').replace(/^"|"$/g, '')}</span>`;
        })
        .replace(/\n/g, '<br>');
      this.kwTooltip = { id: kwId, name: (b.name || '').replace(/^"|"$/g, ''), iconId: b.iconId, descHtml, anchorTop: -9999, anchorLeft: -9999 };
      setTimeout(() => {
        const box = document.querySelector('.buff-tooltip-box');
        if (!box) return;
        const th = box.offsetHeight;
        const tw = box.offsetWidth;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = clientX;
        if (left + tw > vw - 8) left = Math.max(8, vw - tw - 8);
        let top = clientY - th - 8;
        if (top < 8) top = clientY + 8;
        if (top + th > vh - 8) top = Math.max(8, vh - th - 8);
        this.kwTooltip = { ...this.kwTooltip, anchorTop: top, anchorLeft: left };
      }, 0);
    },

    closeKwTooltip() {
      this.kwTooltip = null;
    },

    handleKwClick(event) {
      const kw = event.target.closest('.buff-keyword:not(.no-click)');
      if (!kw) { this.kwTooltip = null; return; }
      event.stopPropagation();
      this.openKwTooltip(kw.dataset.buffId, event.clientX, event.clientY);
    },
  };
}
