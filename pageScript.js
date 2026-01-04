(() => {
  const ARM_MS = 30000;
  const ORIGIN = "+VelogImg";

  let armedUntil = 0;
  let active = null;
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

  function normalizePercent(size) {
    if (!size) return "";
    return size.endsWith("%") ? size : `${size}%`;
  }

  function extractUrlsFromSnippet(snippet) {
    if (!snippet) return [];
    const re =
      /<img[^>]*src\s*=\s*["']?(https:\/\/velog\.velcdn\.com\/[^"'\s>]+)["']?[^>]*>/gi;
    const urls = [];
    let m;
    while ((m = re.exec(snippet)) !== null) urls.push(m[1]);
    return urls;
  }

  // ✅ table(또는 p+table) 범위 먼저 잡기
  function findTableRangeContainingUrl(value, url) {
    const esc = escRe(url);

    const pTableRe = new RegExp(
      `<p\\s+[^>]*align\\s*=\\s*["']?center["']?[^>]*>\\s*` +
        `(<table[\\s\\S]*?<\\/table>)\\s*<\\/p>`,
      "i"
    );

    const tableRe = new RegExp(`<table[\\s\\S]*?<\\/table>`, "gi");

    // 1) p+table
    {
      const m = pTableRe.exec(value);
      if (m && new RegExp(esc, "i").test(m[0])) {
        return { index: m.index, length: m[0].length };
      }
    }

    // 2) table blocks scan
    let m;
    while ((m = tableRe.exec(value)) !== null) {
      if (new RegExp(esc, "i").test(m[0])) {
        return { index: m.index, length: m[0].length };
      }
    }

    return null;
  }

  function findImageRange(value, url) {
    // ✅ table 범위 최우선
    const tableRange = findTableRangeContainingUrl(value, url);
    if (tableRange) return tableRange;

    const esc = escRe(url);

    // ✅ 뒤쪽 공백/줄바꿈도 같이 먹도록 tail 추가
    const tail = `(?:[ \\t]*\\n){0,3}`; // 필요하면 0,5 정도로 늘려도 됨

    // <p align=center><img ...></p>
    const pImgRe = new RegExp(
      `<p\\s+[^>]*align\\s*=\\s*["']?center["']?[^>]*>\\s*` +
        `<img\\s+[^>]*src\\s*=\\s*["']?${esc}["']?[^>]*>\\s*<\\/p>` +
        tail,
      "i"
    );

    // <img ...> (+ optional <br clear="all">)
    const imgRe = new RegExp(
      `<img\\s+[^>]*src\\s*=\\s*["']?${esc}["']?[^>]*>` +
        `(?:\\s*\\n?\\s*<br\\s+clear\\s*=\\s*["']?all["']?\\s*\\/?>)?` +
        tail,
      "i"
    );

    // ![](...)
    const mdRe = new RegExp(`!\\[[^\\]]*\\]\\(${esc}\\)` + tail);

    let m = pImgRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    m = imgRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    m = mdRe.exec(value);
    if (m) return { index: m.index, length: m[0].length };

    return null;
  }

  // ✅ 다음 이미지 1개 후보
  function findNextImageAfter(value, fromIndex) {
    const slice = value.slice(fromIndex);
    const candidates = [];

    // <p align=center><img ...></p>
    {
      const re =
        /<p\s+[^>]*align\s*=\s*["']?center["']?[^>]*>\s*<img[^>]*src\s*=\s*["']?(https:\/\/velog\.velcdn\.com\/[^"'\s>]+)["']?[^>]*>\s*<\/p>/i;
      const m = re.exec(slice);
      if (m) {
        candidates.push({
          url: m[1],
          index: fromIndex + m.index,
          length: m[0].length,
        });
      }
    }

    // <img ...> (+ optional <br clear="all">)
    {
      const re =
        /<img\s+[^>]*src\s*=\s*["']?(https:\/\/velog\.velcdn\.com\/[^"'\s>]+)["']?[^>]*>(?:\s*\n?\s*<br\s+clear\s*=\s*["']?all["']?\s*\/?>)?/i;
      const m = re.exec(slice);
      if (m) {
        candidates.push({
          url: m[1],
          index: fromIndex + m.index,
          length: m[0].length,
        });
      }
    }

    // ![](...)
    {
      const re = /!\[[^\]]*]\((https:\/\/velog\.velcdn\.com\/[^\s)]+)\)/;
      const m = re.exec(slice);
      if (m) {
        candidates.push({
          url: m[1],
          index: fromIndex + m.index,
          length: m[0].length,
        });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.index - b.index);
    return candidates[0];
  }

  // ✅ table 내부 이미지면 스킵해서 “다음 일반 이미지”를 찾는다
  function findNextNonTableImageAfter(value, fromIndex) {
    let cursor = fromIndex;

    while (true) {
      const nxt = findNextImageAfter(value, cursor);
      if (!nxt) return null;

      const tableRange = findTableRangeContainingUrl(value, nxt.url);
      if (
        tableRange &&
        nxt.index >= tableRange.index &&
        nxt.index < tableRange.index + tableRange.length
      ) {
        // table 내부 이미지 → table 끝으로 커서 점프 후 다시 탐색
        cursor = tableRange.index + tableRange.length;
        continue;
      }

      return nxt;
    }
  }

  // ✅ 우정렬 제거: align은 "left" | "center" 만
  function buildImgTag(url, align, size) {
    const sizeAttr = size ? ` width=${normalizePercent(size)}` : "";

    if (align === "center") {
      return `<p align=center><img src=${url}${sizeAttr}></p>`;
    }

    // left는 clear를 반드시 1개만 붙인다
    return `<img src=${url} align=left${sizeAttr}>\n<br clear="all">`;
  }

  // ✅ table 생성: 뒤에 반드시 \n\n 넣기
  function buildRowTable(urls, size) {
    const tableWidth = size ? normalizePercent(size) : "100%";

    const tds = urls
      .map((u) => `    <td><img src=${u} width="100%"></td>`)
      .join("\n");

    const table =
      `<table width="${tableWidth}">\n` +
      `  <tr>\n` +
      `${tds}\n` +
      `  </tr>\n` +
      `</table>`;

    return `${table}\n\n`;
  }

  // ✅ table → 이미지들로 복구 (마크다운)
  function buildImagesBlock(urls) {
    return urls.map((u) => `![](${u})`).join("\n\n");
  }

  function getCurrentSnippetForUrl(cm, url) {
    const value = cm.getDoc().getValue();
    const range = findImageRange(value, url);
    if (!range) return null;
    return value.slice(range.index, range.index + range.length);
  }

  // ✅ border/우정렬 파싱 제거 + table 레이아웃 상태 파싱 추가
  function parseStateFromSnippet(snippet) {
    const state = {
      align: "center",
      size: "",
      layoutOn: false,
      layoutN: null,
      layoutUrls: [],
    };
    if (!snippet) return state;

    // align (right 제거)
    if (/align\s*=\s*left/i.test(snippet)) state.align = "left";
    else state.align = "center";

    if (/<p[^>]*align\s*=\s*["']?center["']?/i.test(snippet)) {
      state.align = "center";
    }

    // size: table이면 table width, 아니면 img width
    const mTable = snippet.match(/<table[^>]*width\s*=\s*["']?([\d]+%?)["']?/i);
    if (mTable) state.size = mTable[1];
    else {
      const mImg = snippet.match(/width\s*=\s*["']?([\d]+%?)["']?/i);
      if (mImg) state.size = mImg[1];
    }

    // layout
    if (/<table/i.test(snippet)) {
      state.layoutOn = true;

      const tr = snippet.match(/<tr[\s\S]*?<\/tr>/i);
      if (tr) {
        const tdCount = (tr[0].match(/<td\b/gi) || []).length;
        state.layoutN = tdCount >= 2 ? tdCount : 2;
      }

      state.layoutUrls = extractUrlsFromSnippet(snippet);
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

  // ✅ UI 밖 클릭 = 적용(rollback 안함)
  function attachOutsideCloser() {
    detachOutsideCloser();
    outsideClickHandler = (e) => {
      const ui = document.getElementById("__velogimg_ui");
      if (ui && !ui.contains(e.target)) {
        removeUI({ keepState: true });
      }
    };
    document.addEventListener("mousedown", outsideClickHandler, true);
    document.addEventListener("touchstart", outsideClickHandler, true);
  }

  /* ---------- layout preview (toggle) ---------- */

  function collectNextUrls(value, startIndex, n, firstUrl) {
    const urls = [firstUrl];
    let cursor = startIndex;

    while (urls.length < n) {
      const nxt = findNextNonTableImageAfter(value, cursor);
      if (!nxt) break;
      urls.push(nxt.url);
      cursor = nxt.index + nxt.length;
    }
    return urls;
  }

  function findAppliedLayoutRange(docValue, layout) {
    if (!layout?.appliedText) return null;

    // 1) exact match
    const idx = docValue.indexOf(layout.appliedText);
    if (idx !== -1) return { index: idx, length: layout.appliedText.length };

    // 2) fallback: url 포함 table 범위
    const firstUrl = layout.urls?.[0];
    if (!firstUrl) return null;
    return findTableRangeContainingUrl(docValue, firstUrl);
  }

  // ✅ 현재 범위가 table이면 “복구” = table → 이미지들
  function convertCurrentTableToImagesIfPresent() {
    if (!active) return false;

    const { cm, url } = active;
    const doc = cm.getDoc();
    const value = doc.getValue();

    const range = findImageRange(value, url);
    if (!range) return false;

    const snippet = value.slice(range.index, range.index + range.length);
    if (!/<table/i.test(snippet)) return false;

    const urls = extractUrlsFromSnippet(snippet);
    if (urls.length < 2) return false;

    const imgBlock = buildImagesBlock(urls);

    doc.replaceRange(
      imgBlock,
      doc.posFromIndex(range.index),
      doc.posFromIndex(range.index + range.length),
      ORIGIN
    );

    // layout OFF로 정리
    active.layout.on = false;
    active.layout.urls = null;
    active.layout.originalText = null;
    active.layout.appliedText = null;

    return true;
  }

  function rollbackLayoutPreview() {
    if (!active?.layout?.on) return true;

    // table 상태면 “복구”
    if (convertCurrentTableToImagesIfPresent()) return true;

    const { cm } = active;
    const doc = cm.getDoc();
    const value = doc.getValue();
    const layout = active.layout;

    const range = findAppliedLayoutRange(value, layout);
    if (!range) return false;

    doc.replaceRange(
      layout.originalText,
      doc.posFromIndex(range.index),
      doc.posFromIndex(range.index + range.length),
      ORIGIN
    );

    active.layout.on = false;
    active.layout.urls = null;
    active.layout.originalText = null;
    active.layout.appliedText = null;

    return true;
  }

  function applyLayoutPreview(n) {
    if (!active) return false;

    // 현재가 table이면 새 table 만들지 말고 “복구”부터 (중첩 방지)
    if (convertCurrentTableToImagesIfPresent()) {
      // 복구 후 계속 진행
    }

    const { cm, url } = active;
    const doc = cm.getDoc();
    const value = doc.getValue();

    const first = findImageRange(value, url);
    if (!first) return false;

    const firstSnippet = value.slice(first.index, first.index + first.length);
    if (/<table/i.test(firstSnippet)) return false; // 안전

    const urls = collectNextUrls(value, first.index + first.length, n, url);
    if (urls.length < n) {
      alert(`해당 이미지 아래쪽에 이미지가 추가로 ${n - 1}장 필요합니다.`);
      return false;
    }

    const lastUrl = urls[urls.length - 1];
    const lastRange = findImageRange(value, lastUrl);
    if (!lastRange) return false;

    const startIndex = first.index;
    const endIndex = lastRange.index + lastRange.length;

    const originalText = value.slice(startIndex, endIndex);
    const tableText = buildRowTable(urls, active.size);

    doc.replaceRange(
      tableText,
      doc.posFromIndex(startIndex),
      doc.posFromIndex(endIndex),
      ORIGIN
    );

    active.layout.on = true;
    active.layout.n = n;
    active.layout.urls = urls;
    active.layout.originalText = originalText;
    active.layout.appliedText = tableText;

    return true;
  }

  function refreshLayoutPreviewIfOn() {
    if (!active?.layout?.on) return;

    const { cm, url } = active;
    const doc = cm.getDoc();
    const value = doc.getValue();
    const range = findImageRange(value, url);
    if (!range) return;

    const snippet = value.slice(range.index, range.index + range.length);
    if (/<table/i.test(snippet)) {
      const urls = extractUrlsFromSnippet(snippet);
      if (urls.length >= 2) active.layout.urls = urls.slice(0, active.layout.n);
      active.layout.appliedText = snippet;
    }

    if (!active.layout.urls || active.layout.urls.length < 2) return;

    const appliedRange = findAppliedLayoutRange(value, active.layout);
    if (!appliedRange) return;

    const nextText = buildRowTable(active.layout.urls, active.size);

    doc.replaceRange(
      nextText,
      doc.posFromIndex(appliedRange.index),
      doc.posFromIndex(appliedRange.index + appliedRange.length),
      ORIGIN
    );

    active.layout.appliedText = nextText;
  }

  /* ---------- apply / rollback ---------- */

  function applyPreview() {
    if (!active) return;

    // layout ON이면 table만 갱신
    if (active.layout?.on) {
      refreshLayoutPreviewIfOn();
      return;
    }

    const { cm, url, align, size } = active;
    const value = cm.getDoc().getValue();
    const range = findImageRange(value, url);
    if (!range) return;

    cm.getDoc().replaceRange(
      buildImgTag(url, align, size) + "\n\n",
      cm.getDoc().posFromIndex(range.index),
      cm.getDoc().posFromIndex(range.index + range.length),
      ORIGIN
    );
  }

  function rollbackToPrevious() {
    if (!active) return;

    if (active.layout?.on) {
      rollbackLayoutPreview();
      return;
    }

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
      align: parsed.align, // left | center
      size: parsed.size,
      layout: {
        on: parsed.layoutOn || false,
        n: parsed.layoutOn ? parsed.layoutN || 2 : null,
        urls:
          parsed.layoutUrls && parsed.layoutUrls.length
            ? parsed.layoutUrls
            : null,
        originalText: null,
        appliedText: parsed.layoutOn ? prevSnippet : null,
      },
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

    // ✅ 레이아웃: 2/3만
    ui.innerHTML = `
      <div class="align">
        <button data-align="left">⬅</button>
        <button data-align="center">⬍</button>
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

      <div class="layoutRow">
        <button data-action="layoutToggle" title="나란히 레이아웃 토글(테이블)">⇄</button>
        <button data-layout-n="2">2</button>
        <button data-layout-n="3">3</button>
      </div>

      <div class="divider"></div>

      <div class="actions">
        <button data-action="confirm">✓</button>
        <button data-action="cancel">✕</button>
      </div>
    `;

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

    const layoutToggleBtn = ui.querySelector('[data-action="layoutToggle"]');

    function getAlignActive(btn) {
      return btn.dataset.align && btn.dataset.align === active.align;
    }
    function getSizeActive(btn) {
      if (!btn.dataset.size) return false;
      const s = active.size || "";
      const n = s.endsWith("%") ? s.slice(0, -1) : s;
      return btn.dataset.size === n;
    }

    function getLayoutNActive(btn) {
      if (!btn.dataset.layoutN) return false;

      if (active.layout?.n == null) return false;

      return Number(btn.dataset.layoutN) === Number(active.layout.n);
    }

    function computeIsActive(btn) {
      if (btn.dataset.align) return getAlignActive(btn);
      if (btn.dataset.size) return getSizeActive(btn);
      if (btn.dataset.layoutN) return getLayoutNActive(btn);
      if (btn.dataset.action === "layoutToggle") return !!active.layout?.on;
      return false;
    }

    function applyButtonBg(btn) {
      const isActive = computeIsActive(btn);
      btn.style.background = isActive ? "#eaecef" : "#fff";
    }

    ui.querySelectorAll("button").forEach((b) => {
      b.addEventListener("mouseenter", () => {
        b.style.background = "#f6f8fa";
      });
      b.addEventListener("mouseleave", () => {
        applyButtonBg(b);
      });
    });

    const centerBtn = ui.querySelector('[data-align="center"]');
    if (centerBtn) {
      centerBtn.style.fontSize = "23px";
      centerBtn.style.transform = "translateY(4.5px)";
    }

    ui.querySelectorAll(".divider").forEach((d) => {
      d.style.cssText = "width:1px;height:18px;background:#e5e7eb";
    });

    const sizeRow = ui.querySelector(".sizeRow");
    sizeRow.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;

    const layoutRow = ui.querySelector(".layoutRow");
    layoutRow.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;

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
    percent.style.cssText = `color:#9aa4b2;font-size:12px;`;

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

    const style = document.createElement("style");
    style.textContent = `#__velogimg_ui input::placeholder { color: #b6c0cc; }`;
    ui.appendChild(style);

    function paintAll() {
      ui.querySelectorAll("[data-align]").forEach(applyButtonBg);
      ui.querySelectorAll("[data-size]").forEach(applyButtonBg);
      ui.querySelectorAll("[data-layout-n]").forEach(applyButtonBg);
      if (layoutToggleBtn) applyButtonBg(layoutToggleBtn);
    }

    paintAll();
    if (active.size) {
      const n = active.size.endsWith("%")
        ? active.size.slice(0, -1)
        : active.size;
      input.value = n;
    }

    let timer = null;
    function debounce() {
      clearTimeout(timer);
      timer = setTimeout(applyPreview, 100);
    }

    function toggleLayout() {
      // table이면 토글은 복구(OFF)
      if (convertCurrentTableToImagesIfPresent()) {
        paintAll();
        return;
      }

      if (active.layout?.on) {
        rollbackLayoutPreview();
        paintAll();
        return;
      }

      // 2/3 안 고른 상태면 막기
      if (active.layout?.n == null) {
        alert("레이아웃을 적용하려면 2개 또는 3개를 선택해주세요.");
        return;
      }

      //  default 2 제거
      const n = Number(active.layout.n);
      const ok = applyLayoutPreview(n);
      if (ok) paintAll();
    }

    function setLayoutN(n) {
      const prevN = Number(active.layout?.n || 2);
      active.layout.n = n;

      // OFF 상태면 값만 변경
      if (!active.layout?.on) {
        paintAll();
        return;
      }

      // ON 상태면: table이면 복구 → 새 N로 적용
      const wasTableRolled = convertCurrentTableToImagesIfPresent();
      if (!wasTableRolled) {
        const rolled = rollbackLayoutPreview();
        if (!rolled) {
          active.layout.n = prevN;
          paintAll();
          return;
        }
      }

      const ok = applyLayoutPreview(n);
      if (!ok) {
        active.layout.n = prevN;
        applyLayoutPreview(prevN);
      }
      paintAll();
    }

    ui.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // align
      if (btn.dataset.align) {
        active.align = btn.dataset.align; // left | center
        paintAll();
        applyPreview();
        return;
      }

      // size quick
      if (btn.dataset.size) {
        input.value = btn.dataset.size;
        active.size = `${btn.dataset.size}%`;
        paintAll();
        applyPreview();
        return;
      }

      // layout toggle
      if (btn.dataset.action === "layoutToggle") {
        toggleLayout();
        return;
      }

      // layout N chips
      if (btn.dataset.layoutN) {
        const n = Number(btn.dataset.layoutN);
        if (Number.isFinite(n) && n >= 2) setLayoutN(n);
        return;
      }

      // confirm/cancel
      if (btn.dataset.action === "confirm") {
        removeUI({ keepState: true });
        return;
      }

      if (btn.dataset.action === "cancel") {
        removeUI({ keepState: false });
      }
    });

    // input 1~100만
    input.addEventListener("input", () => {
      let raw = input.value.replace(/[^\d]/g, "");
      if (raw.length > 3) raw = raw.slice(0, 3);

      if (raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 100) raw = "100";
      }

      input.value = raw;

      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 100) return;

      active.size = `${n}%`;
      paintAll();
      debounce();
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
