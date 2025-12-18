(() => {
  const ARM_MS = 30000;
  const ORIGIN = "+VelogImg";

  let armedUntil = 0;
  let active = null; // { cm, url, originalText, previousText, align, size, borderOn, borderW }
  let outsideClickHandler = null;

  const autoUiConsumed = new Set(); // 자동 UI는 url당 1회만

  /* ---------- utils ---------- */

  function findCMInstance() {
    const host =
      document.querySelector('[data-testid="codemirror"] .CodeMirror') ||
      document.querySelector(".CodeMirror");
    if (!host) return null;
    if (host.CodeMirror) return host.CodeMirror;
    for (const el of host.querySelectorAll("*")) {
      if (el.CodeMirror) return el.CodeMirror;
    }
    return null;
  }

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findLastVelcdn(value) {
    const re = /!\[[^\]]*\]\((https:\/\/velog\.velcdn\.com\/[^\s)]+)\)/g;
    let m,
      last = null;
    while ((m = re.exec(value)) !== null) {
      last = { url: m[1], index: m.index, length: m[0].length };
    }
    return last;
  }

  function findImageRange(value, url) {
    const esc = escRe(url);

    // <p align=center><img ...></p>
    const pImgRe = new RegExp(
      `<p\\s+[^>]*align\\s*=\\s*["']?center["']?[^>]*>\\s*` +
        `<img\\s+[^>]*src\\s*=\\s*["']?${esc}["']?[^>]*>\\s*<\\/p>`,
      "i"
    );

    // <img ...>  (+ optional <br clear="all">)
    const imgRe = new RegExp(
      `<img\\s+[^>]*src\\s*=\\s*["']?${esc}["']?[^>]*>` +
        `(?:\\s*\\n?\\s*<br\\s+clear\\s*=\\s*["']?all["']?\\s*\\/?>)?`,
      "i"
    );

    // ![](...)
    const mdRe = new RegExp(`!\\[[^\\]]*\\]\\(${esc}\\)`);

    let m = pImgRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    m = imgRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    m = mdRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    return null;
  }

  function normalizePercent(size) {
    if (!size) return "";
    return size.endsWith("%") ? size : `${size}%`;
  }

  function buildBorderStyle(borderOn, borderW) {
    if (!borderOn) return "";
    const w = Number(borderW);
    const safe = Number.isFinite(w) && w > 0 ? Math.min(w, 999) : 1;
    return `border:${safe}px solid black;`;
  }

  function buildImgTag(url, align, size, borderOn, borderW) {
    const sizeAttr = size ? ` width=${normalizePercent(size)}` : "";
    const borderStyle = buildBorderStyle(borderOn, borderW);
    const styleAttr = borderStyle ? ` style="${borderStyle}"` : "";

    if (align === "center") {
      return `<p align=center><img src=${url}${sizeAttr}${styleAttr}></p>`;
    }

    // left/right는 clear를 반드시 1개만 붙인다
    return `<img src=${url} align=${align}${sizeAttr}${styleAttr}>\n<br clear="all">`;
  }

  function getCurrentSnippetForUrl(cm, url) {
    const value = cm.getDoc().getValue();
    const range = findImageRange(value, url);
    if (!range) return null;
    return value.slice(range.index, range.index + range.length);
  }

  function parseStateFromSnippet(snippet) {
    const state = { align: "center", size: "", borderOn: false, borderW: 1 };
    if (!snippet) return state;

    // align
    if (/align\s*=\s*right/i.test(snippet)) state.align = "right";
    else if (/align\s*=\s*left/i.test(snippet)) state.align = "left";
    else state.align = "center";

    if (/<p[^>]*align\s*=\s*["']?center["']?/i.test(snippet)) {
      state.align = "center";
    }

    // size
    const m = snippet.match(/width\s*=\s*["']?([\d]+%?)["']?/i);
    if (m) state.size = m[1];

    // border (style 기반)
    const styleMatch = snippet.match(/style\s*=\s*["']([^"']*)["']/i);
    if (styleMatch) {
      const styleStr = styleMatch[1] || "";
      const b = styleStr.match(/border\s*:\s*(\d+)px/i);
      if (b) {
        state.borderOn = true;
        state.borderW = Math.min(Number(b[1]) || 1, 999);
      }
    }

    // 혹시 border="1" 같은 옛 형태가 있으면 방어
    const borderAttr = snippet.match(/border\s*=\s*["']?(\d+)["']?/i);
    if (!state.borderOn && borderAttr) {
      state.borderOn = true;
      state.borderW = Math.min(Number(borderAttr[1]) || 1, 999);
    }

    return state;
  }

  /* ---------- UI lifecycle ---------- */

  function detachOutsideCloser() {
    if (!outsideClickHandler) return;
    document.removeEventListener("mousedown", outsideClickHandler, true);
    document.removeEventListener("touchstart", outsideClickHandler, true);
    outsideClickHandler = null;
  }

  function removeUI({ keepState = true } = {}) {
    if (!keepState) rollbackToPrevious();

    const ui = document.getElementById("__velogimg_ui");
    if (ui) ui.remove();

    detachOutsideCloser();
    active = null;
  }

  function attachOutsideCloser() {
    detachOutsideCloser();
    outsideClickHandler = (e) => {
      const ui = document.getElementById("__velogimg_ui");
      if (ui && !ui.contains(e.target)) {
        //  UI 밖 클릭 = 취소(롤백)
        removeUI({ keepState: false });
      }
    };
    document.addEventListener("mousedown", outsideClickHandler, true);
    document.addEventListener("touchstart", outsideClickHandler, true);
  }

  /* ---------- apply / rollback ---------- */

  function applyPreview() {
    if (!active) return;
    const { cm, url, align, size, borderOn, borderW } = active;
    const value = cm.getDoc().getValue();
    const range = findImageRange(value, url);
    if (!range) return;

    cm.getDoc().replaceRange(
      buildImgTag(url, align, size, borderOn, borderW),
      cm.getDoc().posFromIndex(range.index),
      cm.getDoc().posFromIndex(range.index + range.length),
      ORIGIN
    );
  }

  function rollbackToPrevious() {
    if (!active) return;
    const { cm, url, previousText, originalText } = active;
    const value = cm.getDoc().getValue();
    const range = findImageRange(value, url);
    if (!range) return;

    const back =
      previousText && previousText.trim() ? previousText : originalText;

    cm.getDoc().replaceRange(
      back,
      cm.getDoc().posFromIndex(range.index),
      cm.getDoc().posFromIndex(range.index + range.length),
      ORIGIN
    );
  }

  /* ---------- editor click ---------- */

  function findImageInLine(lineText) {
    let m = lineText.match(
      /!\[[^\]]*\]\((https:\/\/velog\.velcdn\.com\/[^\s)]+)\)/
    );
    if (m) return { url: m[1] };

    m = lineText.match(
      /<img\s+[^>]*src\s*=\s*["']?(https:\/\/velog\.velcdn\.com\/[^"'\s>]+)["']?[^>]*>/i
    );
    if (m) return { url: m[1] };

    return null;
  }

  function openUIFromEditorClick(cm, evt) {
    if (!cm.getWrapperElement().contains(evt.target)) return false;

    const pos = cm.coordsChar(
      { left: evt.clientX, top: evt.clientY },
      "window"
    );
    const lineText = cm.getDoc().getLine(pos.line) || "";
    const hit = findImageInLine(lineText);
    if (!hit) return false;

    const range = findImageRange(cm.getDoc().getValue(), hit.url);
    if (!range) return false;

    createUI(cm, range, hit.url);
    return true;
  }

  /* ---------- create UI ---------- */

  function createUI(cm, range, url) {
    if (active && active.url === url) return;
    removeUI({ keepState: true });

    const pos = cm.getDoc().posFromIndex(range.index);
    const coords = cm.charCoords(pos, "page");

    const prevSnippet = getCurrentSnippetForUrl(cm, url);
    const parsed = parseStateFromSnippet(prevSnippet);

    active = {
      cm,
      url,
      originalText: `![](${url})`,
      previousText: prevSnippet,
      align: parsed.align,
      size: parsed.size,
      borderOn: parsed.borderOn,
      borderW: parsed.borderW,
    };

    const ui = document.createElement("div");
    ui.id = "__velogimg_ui";
    ui.style.cssText = `
      position:absolute;
      top:${coords.top - 60}px;
      left:${coords.left}px;
      z-index:9999;
      padding:10px 12px;
      background:#fff;
      border:1px solid #d0d7de;
      border-radius:10px;
      box-shadow:0 8px 22px rgba(0,0,0,.16);
      display:flex;
      gap:10px;
      align-items:center;
      white-space:nowrap;
      max-width:90vw;
    `;

    ui.innerHTML = `
      <div class="align">
        <button data-align="left">⬅</button>
        <button data-align="center">⬍</button>
        <button data-align="right">➡</button>
      </div>

      <div class="divider"></div>

      <div class="sizeRow">
        <button data-size="25">25</button>
        <button data-size="50">50</button>
        <button data-size="75">75</button>
        <button data-size="100">100</button>
        <div class="inputWrap">
          <input data-input type="text" inputmode="numeric" placeholder="1~100" />
          <span class="percent">%</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="borderRow">
        <button data-border="toggle" title="border on/off">Border</button>
        <div class="borderInputWrap" data-border-wrap>
          <input data-border-input type="text" inputmode="numeric" placeholder="1" />
          <span class="px">px</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="actions">
        <button data-action="confirm">✓</button>
        <button data-action="cancel">✕</button>
      </div>
    `;

    // --- 버튼 base (hover는 아래에서 "active 기준 복원" 방식으로 제어) ---
    ui.querySelectorAll("button").forEach((b) => {
      b.style.cssText = `
        height:26px;
        border:1px solid #d0d7de;
        background:#fff;
        border-radius:8px;
        padding:0 8px;
        cursor:pointer;
        transition: background .12s ease, border-color .12s ease;
      `;
    });

    // ✅ "눌림" 상태 계산 + 배경 적용 (hover 후에도 정확히 복원)
    function getAlignActive(btn) {
      return btn.dataset.align && btn.dataset.align === active.align;
    }
    function getSizeActive(btn) {
      if (!btn.dataset.size) return false;
      const s = active.size || "";
      const n = s.endsWith("%") ? s.slice(0, -1) : s;
      return btn.dataset.size === n;
    }
    function getBorderActive(btn) {
      return !!btn.dataset.border && !!active.borderOn;
    }

    function computeIsActive(btn) {
      if (btn.dataset.align) return getAlignActive(btn);
      if (btn.dataset.size) return getSizeActive(btn);
      if (btn.dataset.border) return getBorderActive(btn);
      return false; // confirm/cancel은 "눌림" 개념 없음
    }

    function applyButtonBg(btn) {
      const isActive = computeIsActive(btn);
      btn.style.background = isActive ? "#eaecef" : "#fff";
    }

    // ✅ hover는 "잠깐만" 바꾸고, mouseleave에서 active 여부로 정확히 복원
    ui.querySelectorAll("button").forEach((b) => {
      b.addEventListener("mouseenter", () => {
        b.style.background = "#f6f8fa";
      });
      b.addEventListener("mouseleave", () => {
        // 핵심: 무조건 흰색으로 돌리지 말고, active면 active색 유지
        applyButtonBg(b);
      });
    });

    // 가운데 정렬 아이콘만(작고 정렬 맞추기)
    const centerBtn = ui.querySelector('[data-align="center"]');
    if (centerBtn) {
      centerBtn.style.fontSize = "23px";
      centerBtn.style.transform = "translateY(4.5px)";
    }

    ui.querySelectorAll(".divider").forEach((d) => {
      d.style.cssText = "width:1px;height:18px;background:#e5e7eb";
    });

    const sizeRow = ui.querySelector(".sizeRow");
    sizeRow.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:4px;
    `;

    const inputWrap = ui.querySelector(".inputWrap");
    inputWrap.style.cssText = `
      display:inline-flex;
      align-items:center;
      height:26px;
      gap:3px;
      padding:0 6px;
      border:1px solid #d0d7de;
      border-radius:8px;
    `;

    const percent = ui.querySelector(".percent");
    percent.style.cssText = `
      color:#9aa4b2;
      font-size:12px;
    `;

    const input = ui.querySelector("[data-input]");
    input.style.cssText = `
      width:45px; 
      height:24px;
      border:none;
      outline:none;
      padding:0;
      text-align:right;
      font-variant-numeric: tabular-nums;
      color:#111827;
    `;

    const borderRow = ui.querySelector(".borderRow");
    borderRow.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:4px;
    `;

    const borderWrap = ui.querySelector("[data-border-wrap]");
    borderWrap.style.cssText = `
      display:none;
      align-items:center;
      height:26px;
      gap:3px;
      padding:0 6px;
      border:1px solid #d0d7de;
      border-radius:8px;
    `;

    const borderInput = ui.querySelector("[data-border-input]");
    borderInput.style.cssText = `
      width:15px;
      height:24px;
      border:none;
      outline:none;
      padding:0;
      text-align:right;
      font-variant-numeric: tabular-nums;
      color:#111827;
    `;

    const px = ui.querySelector(".px");
    px.style.cssText = `
      color:#9aa4b2;
      font-size:12px;
    `;

    // placeholder 더 옅게
    const style = document.createElement("style");
    style.textContent = `
      #__velogimg_ui input::placeholder { color: #b6c0cc; }
    `;
    ui.appendChild(style);

    // --- active 표시 + border wrap show/hide ---
    function paintActiveAlign() {
      ui.querySelectorAll("[data-align]").forEach(applyButtonBg);
    }

    function paintActiveSize() {
      ui.querySelectorAll("[data-size]").forEach(applyButtonBg);
    }

    function paintActiveBorder() {
      const toggle = ui.querySelector('[data-border="toggle"]');
      const wrap = ui.querySelector("[data-border-wrap]");
      const inp = ui.querySelector("[data-border-input]");

      if (toggle) applyButtonBg(toggle);
      if (!wrap || !inp) return;

      if (active.borderOn) {
        wrap.style.display = "inline-flex";
        inp.value = String(active.borderW || 1);
      } else {
        wrap.style.display = "none";
        inp.value = "";
      }
    }

    // 초기 페인트 (여기서 "눌림"이 정확히 반영됨)
    paintActiveAlign();
    if (active.size) {
      const n = active.size.endsWith("%")
        ? active.size.slice(0, -1)
        : active.size;
      input.value = n;
    }
    paintActiveSize();
    paintActiveBorder();

    let timer = null;
    function debounce() {
      clearTimeout(timer);
      timer = setTimeout(applyPreview, 100);
    }

    ui.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // align
      if (btn.dataset.align) {
        active.align = btn.dataset.align;
        paintActiveAlign();
        paintActiveSize();
        paintActiveBorder();
        applyPreview();
        return;
      }

      // size quick
      if (btn.dataset.size) {
        input.value = btn.dataset.size;
        active.size = `${btn.dataset.size}%`;
        paintActiveSize();
        paintActiveBorder();
        applyPreview();
        return;
      }

      // border toggle
      if (btn.dataset.border) {
        active.borderOn = !active.borderOn;

        // ON 되는 순간: 기본 1px로 세팅 + input 열기
        if (active.borderOn) {
          active.borderW = 1;
        }

        paintActiveBorder();
        paintActiveAlign();
        paintActiveSize();
        applyPreview();

        if (active.borderOn) {
          const inp = ui.querySelector("[data-border-input]");
          if (inp) inp.focus();
        }
        return;
      }

      // actions
      if (btn.dataset.action === "confirm") removeUI({ keepState: true });
      if (btn.dataset.action === "cancel") removeUI({ keepState: false });
    });

    // input 1~100만 "들어가게" (100 초과는 입력 자체를 잘라냄)
    input.addEventListener("input", () => {
      let raw = input.value.replace(/[^\d]/g, "");
      if (raw.length > 3) raw = raw.slice(0, 3);

      // 0/000 같은 케이스 정리
      // (입력 중엔 사용자가 "0" 치는 걸 막으면 불편하니 일단 보존)
      // 다만 100 초과는 잘라내기
      if (raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 100) {
          raw = "100";
        }
      }

      input.value = raw;

      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 100) return;

      active.size = `${n}%`;
      paintActiveSize();
      debounce();
    });

    // ✅ border px 입력 (원하는 만큼, 1~999)
    borderInput.addEventListener("input", () => {
      let raw = borderInput.value.replace(/[^\d]/g, "");
      if (raw.length > 3) raw = raw.slice(0, 3);

      borderInput.value = raw;

      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) return;

      active.borderOn = true;
      active.borderW = Math.min(n, 999);
      paintActiveBorder();
      applyPreview();
    });

    document.body.appendChild(ui);
    attachOutsideCloser();
  }

  /* ---------- global events ---------- */

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active) {
      removeUI({ keepState: false });
    }
  });

  document.addEventListener(
    "paste",
    (e) => {
      if (Array.from(e.clipboardData?.types || []).includes("Files")) {
        armedUntil = Date.now() + ARM_MS;
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest("#__velogimg_ui")) return;

      const cm = findCMInstance();
      if (!cm) return;

      if (openUIFromEditorClick(cm, e)) return;

      const img = e.target.closest("img");
      if (!img || !img.src.includes("velog.velcdn.com")) return;

      const range = findImageRange(cm.getDoc().getValue(), img.src);
      if (!range) return;

      createUI(cm, range, img.src);
    },
    true
  );

  function attach(cm) {
    if (cm.__velogImgAttached) return;
    cm.__velogImgAttached = true;

    cm.on("change", (instance, change) => {
      if (change?.origin === ORIGIN) return;
      if (Date.now() > armedUntil) return;
      if (active) return;

      const found = findLastVelcdn(instance.getDoc().getValue());
      if (!found) return;
      if (autoUiConsumed.has(found.url)) return;

      autoUiConsumed.add(found.url);
      createUI(instance, found, found.url);
    });
  }

  (function boot() {
    const t = setInterval(() => {
      const cm = findCMInstance();
      if (cm) {
        attach(cm);
        clearInterval(t);
      }
    }, 250);
  })();
})();
