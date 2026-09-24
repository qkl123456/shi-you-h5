(() => {
  "use strict";

  const HOT_PREFERRED = [
    "黄鹤楼", "枫桥", "鹳雀楼", "武威", "乌衣巷", "秦淮河",
    "交河", "玉门关", "扬州", "苏州", "洛阳", "白帝城", "永济", "西安", "南京", "武汉",
    "奉节", "敦煌", "绍兴", "成都"
  ];

  const state = {
    poems: [],
    poemsById: {},
    places: [],
    placesByName: {},
    ancientBlocklist: new Set(),
    query: "",
    view: "home", // home | detail
    detailId: null,
    cardTab: "front", // front | back
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  async function loadData() {
    const [poemsRes, placesRes] = await Promise.all([
      fetch("data/poems.json"),
      fetch("data/places-index.json"),
    ]);
    if (!poemsRes.ok || !placesRes.ok) {
      throw new Error("无法加载本地数据，请用 http.server 打开，勿直接 file:// 若被拦截");
    }
    const poemsData = await poemsRes.json();
    const placesData = await placesRes.json();
    state.poems = poemsData.poems || [];
    state.poemsById = Object.fromEntries(state.poems.map((p) => [p.id, p]));
    state.places = placesData.places || [];
    state.placesByName = Object.fromEntries(state.places.map((p) => [p.name, p]));
    const bl = (placesData.meta && placesData.meta.ancient_blocklist) || [];
    state.ancientBlocklist = new Set(bl);
  }

  function pickHotPlaces(n = 10) {
    const byName = Object.fromEntries(state.places.map((p) => [p.name, p]));
    const picked = [];
    const seen = new Set();
    for (const name of HOT_PREFERRED) {
      if (byName[name] && !seen.has(name)) {
        picked.push(byName[name]);
        seen.add(name);
      }
      if (picked.length >= n) break;
    }
    if (picked.length < n) {
      const rest = [...state.places].sort((a, b) => {
        const ac = a.poem_ids.filter((id) => state.poemsById[id]?.has_card).length;
        const bc = b.poem_ids.filter((id) => state.poemsById[id]?.has_card).length;
        if (bc !== ac) return bc - ac;
        return b.poem_ids.length - a.poem_ids.length;
      });
      for (const p of rest) {
        if (!seen.has(p.name)) {
          picked.push(p);
          seen.add(p.name);
        }
        if (picked.length >= n) break;
      }
    }
    return picked;
  }

  function matchPlace(place, q) {
    // Search modern name + modern aliases only — never ancient_names
    const names = [place.name, ...(place.aliases || [])];
    return names.some((n) => n.includes(q) || q.includes(n));
  }

  function isAncientQuery(q) {
    return state.ancientBlocklist.has(q);
  }

  const TRAD_PLACE = { "陽": "阳", "樓": "楼", "東": "东", "門": "门", "橋": "桥", "關": "关", "鳥": "鸟", "鶴": "鹤" };
  function normalizeQuery(q) {
    return [...(q || "")].map((ch) => TRAD_PLACE[ch] || ch).join("");
  }

  function searchPoems(q) {
    q = normalizeQuery((q || "").trim());
    if (!q) return null; // null = show hot / idle

    // Pure ancient admin/poetic names are not searchable keys
    if (isAncientQuery(q)) return [];

    const poemScores = new Map(); // id -> score

    for (const place of state.places) {
      if (!matchPlace(place, q)) continue;
      const boost = place.name === q || (place.aliases || []).includes(q) ? 100 : 50;
      for (const pid of place.poem_ids) {
        poemScores.set(pid, Math.max(poemScores.get(pid) || 0, boost + place.poem_ids.length));
      }
    }

    // also match title / author / modern places on poem
    for (const p of state.poems) {
      let s = poemScores.get(p.id) || 0;
      if (p.title.includes(q)) s = Math.max(s, 80);
      if (p.author.includes(q)) s = Math.max(s, 40);
      if ((p.places || []).some((pl) => pl.includes(q) || q.includes(pl))) s = Math.max(s, 60);
      if (s > 0) poemScores.set(p.id, s);
    }

    const results = [...poemScores.entries()]
      .map(([id, score]) => ({ poem: state.poemsById[id], score }))
      .filter((x) => x.poem)
      .sort((a, b) => {
        if (b.poem.has_card !== a.poem.has_card) return b.poem.has_card ? 1 : -1;
        if (b.score !== a.score) return b.score - a.score;
        return (a.poem.order || 0) - (b.poem.order || 0);
      });

    return results.map((r) => r.poem);
  }

  function excerpt(poem) {
    const lines = poem.text || [];
    return lines.slice(0, 2).join("　") || "";
  }

  function relatedPlaces(poem) {
    return (poem.places || []).slice(0, 4);
  }

  function renderHome() {
    const home = $("#view-home");
    const detail = $("#view-detail");
    home.classList.add("active");
    detail.classList.remove("active");

    const q = state.query.trim();
    const resultsEl = $("#results");
    const hotWrap = $("#hot-section");
    const label = $("#results-label");

    $("#clear-btn").classList.toggle("show", !!q);

    if (!q) {
      hotWrap.hidden = false;
      label.textContent = "成片精选";
      const featured = state.poems.filter((p) => p.has_card);
      resultsEl.innerHTML = featured.map(renderResultCard).join("") || emptyHtml("暂无成片");
      return;
    }

    hotWrap.hidden = false; // keep chips for quick switch
    const hits = searchPoems(q);
    label.textContent = `「${q}」· ${hits.length} 首`;
    if (!hits.length) {
      resultsEl.innerHTML = emptyHtml(
        `未找到与「${q}」相关的诗作`,
        "试试 黄鹤楼、苏州、武威、西安、枫桥"
      );
      return;
    }
    resultsEl.innerHTML = hits.map(renderResultCard).join("");
  }

  function emptyHtml(msg, tip) {
    return `<div class="empty"><div>${escapeHtml(msg)}</div>${
      tip ? `<div class="seal-hint">${escapeHtml(tip)}</div>` : ""
    }<div style="margin-top:14px"><button type="button" class="chip" data-clear>清除搜索 · 看热门</button></div></div>`;
  }

  function renderResultCard(p) {
    const places = relatedPlaces(p)
      .map((n) => `<span class="place-tag">#${escapeHtml(n)}</span>`)
      .join("");
    return `<button type="button" class="result-card" data-id="${escapeAttr(p.id)}">
      <div class="result-top">
        <div>
          <h3 class="result-title">${escapeHtml(p.title)}</h3>
          <p class="result-author">${escapeHtml(p.author)}${p.form ? " · " + escapeHtml(p.form) : ""}</p>
        </div>
        ${p.has_card ? '<span class="badge">有插画</span>' : ""}
      </div>
      <div class="result-meta">${places || '<span class="place-tag">#地名待考</span>'}</div>
      <div class="result-excerpt">${escapeHtml(excerpt(p))}</div>
    </button>`;
  }

  function renderHotChips() {
    const hot = pickHotPlaces(12);
    $("#chips").innerHTML = hot
      .map((p) => {
        const hasCard = p.poem_ids.some((id) => state.poemsById[id]?.has_card);
        return `<button type="button" class="chip" data-place="${escapeAttr(p.name)}">${
          hasCard ? '<span class="dot"></span>' : ""
        }${escapeHtml(p.name)}</button>`;
      })
      .join("");
  }

  function showDetail(id) {
    const poem = state.poemsById[id];
    if (!poem) return;
    state.view = "detail";
    state.detailId = id;
    state.cardTab = "front";

    $("#view-home").classList.remove("active");
    $("#view-detail").classList.add("active");
    $("#detail-title").textContent = poem.title;

    const body = $("#detail-body");
    if (poem.has_card && poem.front && poem.back) {
      body.innerHTML = `
        <div class="tabs" role="tablist">
          <button type="button" class="tab active" data-tab="front">诗画</button>
          <button type="button" class="tab" data-tab="back">地景</button>
        </div>
        <div class="card-stage" id="card-stage">
          <img id="card-img" src="${escapeAttr(poem.front)}" alt="${escapeAttr(poem.title)} 正面" />
        </div>
        <p class="swipe-hint">左右滑动或点 Tab 切换 · 正面诗画 / 背面地景</p>
        <div class="poem-block" id="poem-text-block">
          <div class="meta">${escapeHtml(poem.author)}${poem.form ? " · " + escapeHtml(poem.form) : ""} · 唐诗三百首</div>
          <div class="poem-lines">${(poem.text || []).map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
        </div>
        <div id="back-info" hidden>
          ${infoBlock("诗人", poem.poet)}
          ${infoBlock("地景", poem.geo)}
          ${infoBlock("今日可访", poem.visit)}
          ${ancientNamesBlock(poem)}
          ${placesButtons(poem)}
        </div>
      `;
      bindCardGestures(poem);
    } else {
      body.innerHTML = `
        <div class="poem-block">
          <div class="meta">${escapeHtml(poem.author)}${poem.form ? " · " + escapeHtml(poem.form) : ""}</div>
          <div class="poem-lines">${(poem.text || []).map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
        </div>
        ${infoBlock("地景笔记", poem.geo_notes)}
        ${infoBlock("旅行提示", poem.travel_tip)}
        ${ancientNamesBlock(poem)}
        ${placesButtons(poem)}
      `;
    }
    window.scrollTo(0, 0);
  }

  function infoBlock(title, text) {
    if (!text) return "";
    return `<div class="info-block"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
  }


  function ancientNamesBlock(poem) {
    const parts = [];
    const seen = new Set();
    for (const c of poem.place_captions || []) {
      const anc = (c.ancient || []).join("、");
      if (!anc || seen.has(c.place)) continue;
      seen.add(c.place);
      parts.push(`${c.place}（${c.note || "古称" + anc}）`);
    }
    for (const n of poem.places || []) {
      if (seen.has(n)) continue;
      const pl = state.placesByName[n];
      const anc = (pl && pl.ancient_names) || [];
      if (!anc.length) continue;
      seen.add(n);
      parts.push(`${n}（古称：${anc.join("、")}）`);
    }
    if (!parts.length) return "";
    return infoBlock("地名今释", parts.join("；"));
  }

  function placesButtons(poem) {
    const ps = poem.places || [];
    if (!ps.length) return "";
    const capByPlace = Object.fromEntries(
      (poem.place_captions || []).map((c) => [c.place, c.ancient || []])
    );
    return `<div class="info-block"><h3>关联地名</h3><div class="place-list">${ps
      .map((n) => {
        const anc = (state.placesByName[n] && state.placesByName[n].ancient_names) || capByPlace[n] || [];
        const ancHtml = anc.length
          ? `<span class="place-ancient">古称：${escapeHtml(anc.join("、"))}</span>`
          : "";
        return `<button type="button" data-place="${escapeAttr(n)}"><span class="place-modern">${escapeHtml(n)}</span>${ancHtml}</button>`;
      })
      .join("")}</div></div>`;
  }

  function setCardTab(tab, poem) {
    state.cardTab = tab;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    const img = $("#card-img");
    const backInfo = $("#back-info");
    const poemBlock = $("#poem-text-block");
    if (!img) return;
    if (tab === "front") {
      img.src = poem.front;
      img.alt = poem.title + " 正面";
      if (backInfo) backInfo.hidden = true;
      if (poemBlock) poemBlock.hidden = false;
    } else {
      img.src = poem.back;
      img.alt = poem.title + " 背面";
      if (backInfo) backInfo.hidden = false;
      if (poemBlock) poemBlock.hidden = true;
    }
  }

  function bindCardGestures(poem) {
    const stage = $("#card-stage");
    if (!stage) return;
    let startX = 0;
    stage.addEventListener(
      "touchstart",
      (e) => {
        startX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    stage.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) setCardTab("back", poem);
        else setCardTab("front", poem);
      },
      { passive: true }
    );
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function goHome() {
    state.view = "home";
    state.detailId = null;
    renderHome();
    window.scrollTo(0, 0);
  }

  function setQuery(q, render = true) {
    state.query = q;
    $("#search").value = q;
    if (render) {
      if (state.view === "detail") goHome();
      else renderHome();
    }
  }

  function bindEvents() {
    const input = $("#search");
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => setQuery(input.value), 180);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(timer);
        setQuery(input.value);
        input.blur();
      }
    });

    $("#clear-btn").addEventListener("click", () => setQuery(""));

    document.addEventListener("click", (e) => {
      const clear = e.target.closest("[data-clear]");
      if (clear) {
        setQuery("");
        return;
      }
      const placeBtn = e.target.closest("[data-place]");
      if (placeBtn) {
        setQuery(placeBtn.dataset.place);
        return;
      }
      const card = e.target.closest(".result-card[data-id]");
      if (card) {
        showDetail(card.dataset.id);
        return;
      }
      const tab = e.target.closest(".tab[data-tab]");
      if (tab && state.detailId) {
        setCardTab(tab.dataset.tab, state.poemsById[state.detailId]);
        return;
      }
      if (e.target.closest("#btn-back")) {
        goHome();
      }
    });
  }

  async function main() {
    const loading = $("#loading");
    try {
      await loadData();
      renderHotChips();
      bindEvents();
      loading.hidden = true;
      $("#app-main").hidden = false;
      renderHome();
    } catch (err) {
      loading.innerHTML = `<div class="empty"><div>加载失败</div><div class="seal-hint">${escapeHtml(
        err.message || String(err)
      )}</div></div>`;
    }
  }

  main();
})();
