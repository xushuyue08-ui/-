(() => {
  "use strict";

  const STORAGE_KEYS = {
    history: "lvzuLingqian.history.v1",
    session: "lvzuLingqian.session.v1"
  };

  const categories = [
    "综合运势", "事业工作", "求职考试", "学业进修", "感情姻缘",
    "财运经营", "家庭家宅", "出行迁移", "健康平安", "其他"
  ];

  const categoryLabels = {
    career: "事业", study: "学业", exam: "考试",
    love: "感情", marriage: "婚姻", wealth: "财运",
    home: "家宅", health: "健康", travel: "出行",
    lawsuit: "诉讼", lost: "失物"
  };

  const appState = {
    currentView: "home", category: "", question: "",
    currentSign: null, currentTab: "original",
    history: [], signs: [], otherLibraries: [],
    dataNotice: "", otherNotice: "", lookupNumber: 1,
    librarySearch: "", libraryLevel: "全部",
    otherLibraryKey: "lvzu", otherNumber: "", otherKeyword: "",
    currentOtherSign: null, storageAvailable: true,
    aiReading: null, aiLoading: false, aiError: ""
  };

  var app = document.querySelector("#app");
  var toast = document.querySelector("#toast");
  var toastTimer = null;
  var holdTimer = null;
  var holdFrame = null;
  var holdStart = 0;
  var drawingLocked = false;

  function hasValue(v) { return v != null && v !== "" && v !== undefined; }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  function contentBlock(title, value, wide) {
    if (!hasValue(value)) return "";
    var cls = wide ? "content-block wide" : "content-block";
    return "<article class=\"" + cls + "\"><h3>" + escapeHtml(title) + "</h3><p>" + escapeHtml(value) + "</p></article>";
  }

  function normalizeCompact(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function parseNumberedSections(text) {
    if (!hasValue(text)) return [];
    var normalized = String(text).replace(/\r/g, "\n");
    var matches = normalized.match(/\d+、[\s\S]*?(?=\s*\d+、|$)/g) || [];
    return matches.map(function(part){
      var clean = part.replace(/^\s*\d+、\s*/, "").trim();
      var colon = clean.search(/[：:]/);
      if (colon < 0) return null;
      var title = clean.slice(0, colon).replace(/\s+/g, "");
      var value = clean.slice(colon + 1).trim().replace(/\s+/g, " ");
      if (!title || !value) return null;
      return [title, value];
    }).filter(Boolean);
  }

  function repeatsCategoryContent(explanation, categories) {
    if (!hasValue(explanation) || !categories.length) return false;
    var text = normalizeCompact(explanation);
    var exactRepeat = categories.some(function(e){
      var title = normalizeCompact(e[0]);
      var value = normalizeCompact(e[1]);
      return text === value || text === title + value || text === title + "：" + value || text === title + ":" + value;
    });
    if (exactRepeat) return true;
    var repeated = categories.filter(function(e){
      var title = normalizeCompact(e[0]);
      var value = normalizeCompact(e[1]);
      return (title && text.indexOf(title) >= 0) || (value.length > 14 && text.indexOf(value.slice(0, 14)) >= 0);
    }).length;
    return repeated >= Math.min(2, categories.length);
  }

  function buildSignOverview(sign, categories) {
    var text = normalizeCompact([sign.level, sign.explanation].concat(categories.map(function(e){ return e[1]; })).join(" "));
    var positive = (text.match(/大吉|上吉|吉|利|成|遂|亨|安|顺|旺|得|丰收|如愿|成功|喜/g) || []).length;
    var cautious = (text.match(/凶|防|慎|谨|阻|难|迟|待|守|不合|破|病|险|忧|退/g) || []).length;
    var tone = "吉凶参看";
    var levelText = normalizeCompact(sign.level);
    if (/下下|下签|凶/.test(levelText)) tone = "偏谨慎";
    else if (/中平|平安|平签/.test(levelText)) tone = "中平待时";
    else if (/上上|上吉|大吉/.test(levelText)) tone = "偏吉";
    else if (positive >= cautious + 2) tone = "偏吉";
    else if (cautious >= positive + 2) tone = "偏谨慎";
    else if (text.indexOf("待") >= 0 || text.indexOf("守") >= 0 || text.indexOf("迟") >= 0) tone = "中平待时";

    var advice = "宜先看清现实条件，再按部就班处理";
    if (tone === "偏吉") advice = "宜把握时机、顺势推进，但仍要守正行事";
    if (tone === "偏谨慎") advice = "宜谨慎守成、少作冒进，先避风险再求进展";
    if (tone === "中平待时") advice = "宜耐心等待、守住本分，等条件转明后再行动";

    var level = hasValue(sign.level) ? "签等为“" + sign.level + "”，" : "";
    return level + "本签整体可作“" + tone + "”之象看待，重点不在单一事项的断语，而在提醒求问者衡量时机与分寸。" + advice + "。";
  }

  function renderAiReading() {
    if (appState.aiLoading) {
      return "<p class=\"prototype-note\">正在生成 AI 问事解读，请稍候……</p>";
    }
    if (hasValue(appState.aiError)) {
      return "<p class=\"form-error\" role=\"alert\">" + escapeHtml(appState.aiError) + "</p>";
    }
    if (!appState.aiReading) {
      return "<p class=\"prototype-note\">AI 解签会结合签文、问事类型和你的具体问题，生成结构化参考解读。</p>";
    }
    var sections = Array.isArray(appState.aiReading.sections) ? appState.aiReading.sections : [];
    if (!sections.length && hasValue(appState.aiReading.raw)) {
      return "<div class=\"question-quote\">" + escapeHtml(appState.aiReading.raw) + "</div>";
    }
    return sections.map(function(section){
      return contentBlock(section.title, section.content, true);
    }).join("");
  }

  function readStorage(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e) { appState.storageAvailable = false; return fallback; }
  }

  function writeStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch(e) { appState.storageAvailable = false; }
  }

  function saveSession() {
    writeStorage(STORAGE_KEYS.session, {
      category: appState.category,
      question: appState.question,
      currentSignNumber: appState.currentSign ? appState.currentSign.number : null,
      currentTab: appState.currentTab
    });
  }

  function saveHistory() {
    writeStorage(STORAGE_KEYS.history, appState.history);
  }

  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(function(){ toast.classList.remove("show"); }, 2400);
  }

  function addHistory(sign, src) {
    var rec = { id: Date.now()+"-"+Math.random().toString(36).slice(2,8),
      signNumber: sign.number, timestamp: Date.now(),
      question: appState.question, source: src, favorite: false
    };
    appState.history.unshift(rec);
    saveHistory();
  }

  function finishDraw() {
    if (drawingLocked) return;
    var signs = appState.signs;
    if (!signs || !signs.length) return;
    drawingLocked = true;
    var sign = signs[Math.floor(Math.random() * signs.length)];
    appState.currentSign = sign;
    appState.currentTab = "original";
    addHistory(sign, "draw");
    saveSession();
    var area = document.getElementById("draw-area");
    var status = document.getElementById("hold-status");
    if (area) area.classList.add("complete");
    if (status) status.textContent = "签已出，请静候揭签。";
    if (navigator.vibrate) navigator.vibrate(35);
    setTimeout(function(){
      drawingLocked = false;
      location.hash = "#result";
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 900);
  }

  function startHold(event) {
    if (drawingLocked || holdTimer) return;
    event.preventDefault();
    var area = document.getElementById("draw-area");
    var fill = document.getElementById("progress-fill");
    var status = document.getElementById("hold-status");
    holdStart = performance.now();
    if (area) area.classList.add("holding");
    if (status) status.textContent = "保持静心，继续按住……";
    if (fill) fill.style.width = "0";
    function tick(now) {
      var progress = Math.min((now - holdStart) / 1500, 1);
      if (fill) fill.style.width = (progress * 100) + "%";
      if (progress < 1) holdFrame = requestAnimationFrame(tick);
    }
    holdFrame = requestAnimationFrame(tick);
    holdTimer = setTimeout(function(){
      cancelHold(false);
      finishDraw();
    }, 1500);
  }

  function cancelHold(cancelled) {
    clearTimeout(holdTimer);
    holdTimer = null;
    cancelAnimationFrame(holdFrame);
    holdFrame = null;
    var area = document.getElementById("draw-area");
    if (area) area.classList.remove("holding");
    if (cancelled && !drawingLocked) {
      var fill = document.getElementById("progress-fill");
      var status = document.getElementById("hold-status");
      if (fill) fill.style.width = "0";
      if (status) status.textContent = "按住时间不足，可以重新尝试。";
    }
  }

  async function loadData() {
    try {
      var [r1, r2] = await Promise.all([
        fetch("data/lvzu-signs.json", {cache:"no-store"}),
        fetch("data/other-signs.json", {cache:"no-store"}).catch(function(){ return null; })
      ]);
      var d1 = await r1.json();
      appState.signs = Array.isArray(d1.signs) ? d1.signs : [];
      appState.dataNotice = d1.notice || "";
      if (r2) {
        var d2 = await r2.json();
        appState.otherLibraries = Array.isArray(d2.libraries) ? d2.libraries : [];
        appState.otherNotice = d2.notice || "";
      }
    } catch(e) {
      appState.signs = [];
      app.innerHTML = "<p class=\"error\">数据加载失败，请确认通过本地服务器访问。</p>";
    }
  }

  function restoreState() {
    var sess = readStorage(STORAGE_KEYS.session, {});
    if (sess.category) appState.category = sess.category;
    if (sess.question) appState.question = sess.question;
    if (sess.currentTab) appState.currentTab = sess.currentTab;
    if (appState.currentTab === "categories") appState.currentTab = "original";
    if (sess.currentSignNumber) {
      appState.currentSign = appState.signs.find(function(s){ return s.number === sess.currentSignNumber; }) || null;
    }
  }

  async function init() {
    await loadData();
    appState.history = readStorage(STORAGE_KEYS.history, []);
    if (!appState.signs.length) return;
    restoreState();
    handleRoute();
  }

  function parseRoute() {
    var raw = location.hash.replace("#", "");
    var v = ["home","draw-category","draw-question","prepare","drawing","result","lookup","library","other","history"];
    if (v.indexOf(raw) >= 0) return {view:raw};
    var m = raw.match(/^sign\/(\d{1,3})/);
    if (m) return {view:"sign", signNumber:Number(m[1])};
    var m2 = raw.match(/^other\/([^\/]+)\/(\d{1,3})/);
    if (m2) return {view:"other-sign", libraryKey:m2[1], signNumber:Number(m2[2])};
    return {view:"home"};
  }

  function handleRoute() {
    var route = parseRoute();
    if (route.view === "sign") {
      var s = appState.signs.find(function(i){ return i.number === route.signNumber; });
      if (!s) { appState.currentView = "lookup"; appState.currentSign = null; }
      else { appState.currentSign = s; appState.currentView = "sign"; appState.currentTab = "original"; }
    } else if (route.view === "other-sign") {
      var lib = appState.otherLibraries.find(function(i){ return i.key === route.libraryKey; });
      var s2 = lib ? lib.signs.find(function(i){ return i.number === route.signNumber; }) : null;
      if (!lib || !s2) { appState.currentView = "other"; }
      else { appState.otherLibraryKey = lib.key; appState.currentOtherSign = s2; appState.currentView = "other-sign"; }
    } else if (route.view === "other") { appState.currentView = "library"; }
    else { appState.currentView = route.view; }
    render();
  }

  function render() {
    var views = {
      home: renderHome,
      "draw-category": renderCategories,
      "draw-question": renderQuestion,
      prepare: renderPrepare,
      drawing: renderDrawing,
      result: renderResult,
      sign: renderSignDetail,
      lookup: renderLookup,
      library: renderLibrary,
      other: renderLibrary,
      "other-sign": renderOtherSign,
      history: renderHistory
    };
    app.innerHTML = (views[appState.currentView] || renderHome)();
  }

  function renderHome() {
    return "" +
      "<section class=\"view\">" +
      "<div class=\"hero\">" +
      "<div class=\"hero-copy\">" +
      "<p class=\"eyebrow\">L" + String.fromCharCode(220) + "ZU SIGN STUDIO</p>" +
      "<h1>吕祖灵签</h1>" +
      "<p class=\"hero-subtitle\">心有所问，签有所应</p>" +
      "<p class=\"hero-description\">诚心默念所问之事，<br>求取一签，查看签文、典故、<br>传统解签与现代问事解读。</p>" +
      "</div>" +
      "<div class=\"hero-actions\" aria-label=\"首页功能入口\">" +
      "<p class=\"eyebrow\">问一事 · 求一签</p>" +
      "<button class=\"button\" type=\"button\" data-action=\"start-draw\">诚心求签</button>" +
      "<button class=\"button secondary\" type=\"button\" data-route=\"lookup\">已有签号，直接查签</button>" +
      "<button class=\"text-link\" type=\"button\" data-route=\"library\">其他灵签查询</button>" +
      "</div>" +
      "</div>" +
      "<p class=\"disclaimer\">传统文化内容仅供参考，请结合现实情况理性判断。</p>" +
      "</section>";
  }

  function renderCategories() {
    var cats = categories.map(function(c){ return "<button class=\"category-card\" data-category=\"" + escapeHtml(c) + "\">" + escapeHtml(c) + "</button>"; }).join("");
    return "<section class=\"view panel narrow\">" +
      "<div class=\"section-header\">" +
      "<button class=\"back-button\" data-route=\"home\">← 返回首页</button>" +
      "<h2>请选择你要问的事</h2>" +
      "</div>" +
      "<div class=\"category-grid\">" + cats + "</div>" +
      "</section>";
  }

  function renderQuestion() {
    return "<section class=\"view panel narrow\">" +
      "<button class=\"back-button\" data-route=\"draw-category\">← 返回选择类型</button>" +
      "<p class=\"eyebrow\">所问：" + escapeHtml(appState.category || "综合运势") + "</p>" +
      "<h1 class=\"page-title\">请写下你此刻最关心的一件事</h1>" +
      "<div class=\"section-rule\"></div>" +
      "<div class=\"form-group\">" +
      "<label for=\"q-input\">具体问题</label>" +
      "<textarea id=\"q-input\" maxlength=\"300\" placeholder=\"例如：我近期是否适合更换工作？&#10;我应该继续准备这次考试吗？&#10;这段关系目前应当如何处理？\">" + escapeHtml(appState.question) + "</textarea>" +
      "<p class=\"field-hint\">一事一问，问题越具体，解读越有针对性。</p>" +
      "<p class=\"counter\"><span id=\"q-count\">" + appState.question.length + "</span>/300</p>" +
      "</div>" +
      "<div class=\"button-row\">" +
      "<button class=\"button\" data-action=\"submit-q\">继续</button>" +
      "<button class=\"button ghost\" data-action=\"skip-q\">暂不填写，仅查看通用签义</button>" +
      "</div>" +
      "</section>";
  }

  function renderPrepare() {
    return "<section class=\"view panel narrow meditation\">" +
      "<div>" +
      "<div class=\"incense\" role=\"img\" aria-label=\"一炷香烟缓缓升起\">" +
      "<span class=\"smoke\"></span><span class=\"incense-stick\"></span>" +
      "</div>" +
      "<p class=\"eyebrow\">静心片刻</p>" +
      "<h1 class=\"page-title\">默念所问之事</h1>" +
      "<p class=\"lead\">心诚意定，再行求签</p>" +
      "<div class=\"section-rule\" style=\"margin-inline:auto\"></div>" +
      "<button class=\"button\" data-route=\"drawing\">我已静心</button><br>" +
      "<button class=\"text-link\" data-route=\"draw-question\">返回上一步</button>" +
      "</div>" +
      "</section>";
  }

  function renderDrawing() {
    return "<section class=\"view panel narrow draw-stage\">" +
      "<p class=\"eyebrow\">诚心求取</p>" +
      "<h1 class=\"page-title\">长按签筒，诚心求签</h1>" +
      "<p class=\"lead\">持续按住约 1.5 秒，松开过早可重新尝试。</p>" +
      "<div class=\"draw-area\" id=\"draw-area\">" +
      "<div class=\"sticks\" aria-hidden=\"true\">" +
      [-36,-24,-12,0,13,25,36].map(function(r, i){ return "<span class=\"stick" + (i === 3 ? " chosen" : "") + "\" style=\"--r:" + r + "deg;--x:" + ((i-3)*3) + "px\"></span>"; }).join("") +
      "</div>" +
      "<div class=\"tube\" aria-hidden=\"true\"></div>" +
      "<button class=\"hold-button\" type=\"button\" data-action=\"hold-draw\" aria-label=\"长按签筒一秒半开始求签\"></button>" +
      "<div class=\"progress-ring\" aria-hidden=\"true\"><div class=\"progress-fill\" id=\"progress-fill\"></div></div>" +
      "</div>" +
      "<p class=\"draw-note\" id=\"hold-status\">一事一签，请勿反复求问</p>" +
      "<button class=\"text-link\" data-route=\"prepare\">返回静心页面</button>" +
      "</section>";
  }

  function renderResult() {
    var sign = appState.currentSign;
    if (!sign) return "<p>尚未抽得签文</p>";
    var poem = sign.poem && sign.poem[0] ? escapeHtml(sign.poem[0]) : "";
    var allusion = hasValue(sign.allusion) ? "<span>古人：" + escapeHtml(sign.allusion) + "</span>" : "";
    var level = hasValue(sign.level) ? "<span>签等：" + escapeHtml(sign.level) + "</span>" : "";
    return "<section class=\"view\">" +
      "<div class=\"result-card\">" +
      "<div class=\"result-top\"><p class=\"eyebrow\">吕祖灵签</p><h1 class=\"result-number\">第" + sign.number + "签</h1><p>" + poem + "</p></div>" +
      "<div class=\"result-body\"><div class=\"result-meta\">" + allusion + level + "</div>" +
      "<button class=\"button\" data-route=\"sign/" + sign.number + "\">查看签文</button></div>" +
      "</div>" +
      (hasValue(appState.dataNotice) ? "<p class=\"disclaimer\">" + escapeHtml(appState.dataNotice) + "</p>" : "") +
      "</section>";
  }

  function renderSignDetail() {
    var sign = appState.currentSign;
    if (!sign) return "<p>未找到当前签文</p>";
    var tabs = [["original","原签"],["explanation","解签"],["story","典故"],["question","问事"]];
    var tabBtns = tabs.map(function(t){
      var a = t[0] === appState.currentTab;
      return "<button role=\"tab\" aria-selected=\"" + (a ? "true" : "false") + "\" data-tab=\"" + t[0] + "\" class=\"tab-button\">" + t[1] + "</button>";
    }).join("");
    var notice = hasValue(appState.dataNotice) ? "<p class=\"prototype-note\">" + escapeHtml(appState.dataNotice) + "</p>" : "";
    return "<section class=\"view\">" +
      "<button class=\"back-button\" data-route=\"library\">← 返回灵签签库</button>" +
      "<div class=\"detail-hero\"><p class=\"eyebrow\">吕祖灵签</p>" +
      "<h1>第" + sign.number + "签</h1>" +
      "<div class=\"detail-meta\">" +
        (hasValue(sign.allusion) ? "<span>古人：" + escapeHtml(sign.allusion) + "</span>" : "") +
        (hasValue(sign.level) ? "<span>签等：" + escapeHtml(sign.level) + "</span>" : "") +
      "</div></div>" + notice +
      "<div class=\"tabs\" role=\"tablist\">" + tabBtns + "</div>" +
      "<div class=\"tab-panel\" role=\"tabpanel\" tabindex=\"0\">" + renderDetailTab(sign) + "</div>" +
      "</section>";
  }

  function renderDetailTab(sign) {
    var tab = appState.currentTab;

    if (tab === "original") {
      var poem = (sign.poem || []).map(function(l){ return "<div>" + escapeHtml(l) + "</div>"; }).join("");
      var pt = hasValue(sign.poemTitle) ? "<h3>诗曰</h3><p>" + escapeHtml(sign.poemTitle) + "</p>" : "";
      var src = sign.sourceUrl ? "<p><a href=\"" + escapeHtml(sign.sourceUrl) + "\" target=\"_blank\">查看此签资料来源</a></p>" : "";
      return "<article class=\"paper-card\"><span class=\"paper-label\">传统原文</span><div class=\"poem\">" + poem + "</div>" + pt + src + "</article>";
    }

    if (tab === "explanation") {
      var sc = Object.entries(sign.sourceCategories || {}).filter(function(e){ return hasValue(e[1]); });
      var interp = hasValue(sign.interpretation) ? contentBlock("整体解签", sign.interpretation, true) : (hasValue(sign.summary) ? contentBlock("本签主旨", sign.summary, true) : "");
      var cats = sc.map(function(e){ return contentBlock(e[0], e[1]); }).join("");
      return "<div class=\"content-grid\">" + interp + cats + "</div>";
    }

    if (tab === "story") {
      var story = hasValue(sign.allusionStory) ? contentBlock("典故", sign.allusionStory, true) : (hasValue(sign.summary) ? contentBlock("典故所对应的签义", sign.summary, true) : "");
      var extra = hasValue(sign.story) ? contentBlock("典故补充", sign.story, true) : "";
      var sym = hasValue(sign.storySymbol) ? contentBlock("象征含义", sign.storySymbol) : "";
      var hint = hasValue(sign.misunderstanding) ? contentBlock("理解提示", sign.misunderstanding, true) : "";
      return "<div class=\"content-grid\">" + contentBlock("古人", sign.allusion, true) + story + extra + sym + hint + "</div>";
    }

    var category = hasValue(appState.category) ? escapeHtml(appState.category) : "未填写";
    var question = hasValue(appState.question) ? "<div class=\"question-quote\">" + escapeHtml(appState.question) + "</div>" : "<div class=\"question-quote\">暂未填写具体问题，仅查看通用签义。</div>";
    return "<div class=\"content-grid\">" +
      "<div class=\"content-block wide\"><h3>所问之事</h3><p>问事类型：" + category + "</p>" + question + "</div>" +
      "<div class=\"content-block wide ai-placeholder\">" +
      "<h3>AI 个性化解读</h3>" +
      renderAiReading() +
      "<button class=\"button secondary\" data-action=\"ai-demo\"" + (appState.aiLoading ? " disabled" : "") + ">生成 AI 问事解读</button>" +
      "</div></div>";
  }

  async function requestAiReading() {
    if (!appState.currentSign || appState.aiLoading) return;
    appState.aiLoading = true;
    appState.aiError = "";
    render();
    try {
      var sign = appState.currentSign;
      var response = await fetch("/api/ai-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sign: {
            number: sign.number,
            allusion: sign.allusion || "",
            poem: sign.poem || [],
            summary: sign.summary || sign.explanation || "",
            sourceCategories: sign.sourceCategories || {}
          },
          category: appState.category || "",
          question: appState.question || ""
        })
      });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok) throw new Error(data.error || "AI 接口请求失败。");
      appState.aiReading = data;
      appState.aiError = "";
    } catch (err) {
      appState.aiError = err && err.message ? err.message : "AI 解读生成失败，请稍后重试。";
      showToast(appState.aiError);
    } finally {
      appState.aiLoading = false;
      render();
    }
  }

  function renderLookup() {
    var n = appState.lookupNumber;
    var opts = appState.signs.map(function(s){
      return "<option value=\"" + s.number + "\"" + (s.number === n ? " selected" : "") + ">第" + s.number + "签</option>";
    }).join("");
    return "<section class=\"view panel narrow\">" +
      "<button class=\"back-button\" data-route=\"home\">← 返回首页</button>" +
      "<h2>查签</h2>" +
      "<label>签号（1—" + appState.signs.length + "）</label>" +
      "<div class=\"lookup-control\">" +
      "<button data-action=\"lookup-minus\">&minus;</button>" +
      "<input id=\"lookup-num\" type=\"number\" min=\"1\" max=\"" + appState.signs.length + "\" value=\"" + n + "\">" +
      "<button data-action=\"lookup-plus\">&plus;</button>" +
      "</div>" +
      "<select id=\"lookup-select\">" + opts + "</select>" +
      "<button class=\"button\" data-action=\"lookup-go\">查看此签</button>" +
      "</section>";
  }

  function renderLibrary() {
    var libs = getAllLibraries();
    var lib = libs.find(function(l){ return l.key === appState.otherLibraryKey; }) || libs[0];
    var kw = appState.librarySearch.toLowerCase();
    var filtered = lib.signs.filter(function(s){
      if (!kw) return true;
      var text = [s.number, s.allusion, s.level].concat(s.poem || []).concat([s.explanation]).concat(Object.keys(s.sourceCategories || {})).concat(Object.values(s.sourceCategories || {})).join(" ").toLowerCase();
      return text.indexOf(kw) >= 0;
    });
    var rNote = lib.maxNumber < 100
      ? "当前资料收录第 " + lib.minNumber + " 至第 " + lib.maxNumber + " 签，未收录的签号不作补写。"
      : "当前资料收录第 " + lib.minNumber + " 至第 " + lib.maxNumber + " 签。";
    var sel = libs.map(function(l){
      return "<option value=\"" + l.key + "\"" + (l.key === lib.key ? " selected" : "") + ">" + escapeHtml(l.name) + "（" + l.signCount + "签）</option>";
    }).join("");
    var cards = filtered.map(function(s){ return renderUnifiedSignCard(lib, s); }).join("");
    return "<section class=\"view\">" +
      "<div class=\"detail-hero\">" +
      "<div><p class=\"eyebrow\">七套签文资料</p><h1 class=\"page-title\">灵签签库</h1></div>" +
      "<p class=\"lead\">可按灵签类型、签号或签诗关键词查询。</p>" +
      "</div>" +
      (hasValue(appState.dataNotice) ? "<p class=\"prototype-note\">" + escapeHtml(appState.dataNotice) + "</p>" : "") +
      "<div class=\"panel other-search-panel\">" +
      "<div class=\"other-form\">" +
      "<div><label class=\"field-label\" for=\"lib-select\">灵签类型</label><select id=\"lib-select\">" + sel + "</select></div>" +
      "<div><label class=\"field-label\" for=\"lib-search\">签号或关键词</label><input id=\"lib-search\" type=\"search\" placeholder=\"例如：1、功名、平安、秋风\" value=\"" + escapeHtml(appState.librarySearch) + "\"></div>" +
      "<div class=\"other-action-row\"><button class=\"button ghost\" data-action=\"clear-library-filter\">清除筛选</button></div>" +
      "</div>" +
      "</div>" +
      "<div class=\"library-summary\"><div><p class=\"eyebrow\">当前签库</p><h2>" + escapeHtml(lib.name) + "</h2></div><p>" + rNote + " 当前显示 " + filtered.length + " 支。</p></div>" +
      (cards ? "<div class=\"library-grid other-library-grid\">" + cards + "</div>" : "<div class=\"empty-state\"><h2>无匹配结果</h2><p>请换一个更短的关键词或签号。</p></div>") +
      "</section>";
  }

  function getAllLibraries() {
    var lvzuLib = {
      key: "lvzu", name: "吕祖灵签", signCount: appState.signs.length,
      minNumber: Math.min.apply(null, appState.signs.map(function(s){ return s.number; })),
      maxNumber: Math.max.apply(null, appState.signs.map(function(s){ return s.number; })),
      signs: appState.signs
    };
    return [lvzuLib].concat(appState.otherLibraries || []);
  }

  function renderUnifiedSignCard(lib, sign) {
    var title = hasValue(sign.allusion) ? sign.allusion : (sign.poem ? sign.poem[0] : "传统签文");
    var route = lib.key === "lvzu" ? "sign/" + sign.number : "other/" + lib.key + "/" + sign.number;
    var lv = hasValue(sign.level) ? "<span class=\"level-badge\">" + escapeHtml(sign.level) + "</span>" : "";
    return "<article class=\"sign-card\">" +
      "<span class=\"card-number\">" + escapeHtml(lib.name) + " · 第" + sign.number + "签</span>" +
      "<h3>" + escapeHtml(title) + "</h3>" +
      lv +
      (sign.poem ? "<p>" + escapeHtml(sign.poem[0] || "") + "</p>" : "") +
      "<button class=\"button secondary\" data-route=\"" + route + "\">查看此签</button>" +
      "</article>";
  }

  function renderOtherSign() {
    var lib = appState.otherLibraries.find(function(l){ return l.key === appState.otherLibraryKey; });
    var sign = appState.currentOtherSign;
    if (!lib || !sign) return "<p>未找到当前灵签资料</p>";
    var poem = (sign.poem || []).map(function(l){ return "<div>" + escapeHtml(l) + "</div>"; }).join("");
    var reading = renderOtherSignReading(sign);
    return "<section class=\"view\">" +
      "<button class=\"back-button\" data-route=\"library\">← 返回</button>" +
      "<div class=\"detail-hero\"><p class=\"eyebrow\">" + escapeHtml(lib.name) + "</p><h1>第" + sign.number + "签</h1></div>" +
      (hasValue(sign.sourceNote) ? "<p class=\"prototype-note\">" + escapeHtml(sign.sourceNote) + "</p>" : "") +
      "<article class=\"paper-card\"><span class=\"paper-label\">传统签文</span><div class=\"poem\">" + poem + "</div>" +
      (sign.sourceUrl ? "<p><a href=\"" + escapeHtml(sign.sourceUrl) + "\" target=\"_blank\">查看此签来源文章</a></p>" : "") +
      "</article>" + reading + "</section>";
  }

  function renderOtherSignReading(sign) {
    var parsedSections = parseNumberedSections(sign.explanation);
    var sourceSections = Object.entries(sign.sourceCategories || {}).filter(function(e){ return hasValue(e[1]); });
    var sc = sourceSections.length ? sourceSections : parsedSections;
    var explanationIsCategoryList = (sc.length > 0 && !hasValue(sign.explanation)) || parsedSections.length >= 2 || repeatsCategoryContent(sign.explanation, sc);
    var summaryText = explanationIsCategoryList ? buildSignOverview(sign, sc) : sign.explanation;
    var summary = hasValue(summaryText) ? contentBlock("签义说明", summaryText, true) : "";
    var categories = sc.length
      ? "<h2 class=\"detail-section-title\">分类解读</h2><div class=\"category-list source-category-list\">" +
        sc.map(function(e){ return contentBlock(e[0], e[1]); }).join("") +
        "</div>"
      : "";
    if (!summary && !categories) return "";
    return "<section class=\"other-reading\"><h2 class=\"detail-section-title\">此签解读</h2><div class=\"content-grid\">" + summary + "</div>" + categories + "</section>";
  }

  function renderHistory() {
    var clearBtn = appState.history.length ? "<button class=\"button ghost\" data-action=\"clear-history\">清空全部记录</button>" : "";
    var items = appState.history.length ? appState.history.map(function(r){ return renderHistoryCard(r); }).join("") : "<div class=\"empty\"><h2>签册尚空</h2><p>求签或查询后，记录会保存。</p></div>";
    var note = appState.storageAvailable ? "" : "<p>浏览器未允许 localStorage，记录可能无法保留。</p>";
    return "<section class=\"view\">" + note +
      "<div class=\"detail-hero\"><p class=\"eyebrow\">本地保存</p><h1>我的签册</h1></div>" + clearBtn +
      "<div class=\"history-list\">" + items + "</div></section>";
  }

  function renderHistoryCard(rec) {
    var sign = appState.signs.find(function(s){ return s.number === rec.signNumber; });
    var name = sign ? escapeHtml(sign.allusion) : "";
    var srcBadge = rec.source === "draw" ? "在线求签" : "签号查询";
    var favLabel = rec.favorite ? "取消收藏" : "收藏";
    return "<article class=\"history-card\">" +
      "<div class=\"history-head\"><span>" + formatDate(rec.timestamp) + "</span><span class=\"level-badge\">" + srcBadge + "</span></div>" +
      "<h3>吕祖灵签 第" + rec.signNumber + "签" + (name ? " · " + name : "") + "</h3>" +
      (rec.question ? "<p>" + escapeHtml(rec.question) + "</p>" : "") +
      "<div class=\"history-actions\">" +
      "<button class=\"small-button\" data-h-view=\"" + rec.id + "\">查看记录</button>" +
      "<button class=\"small-button\" data-h-fav=\"" + rec.id + "\">" + favLabel + "</button>" +
      "<button class=\"small-button\" data-h-del=\"" + rec.id + "\">删除</button>" +
      "</div></article>";
  }

  document.addEventListener("click", function(e) {
    var btn = e.target.closest("[data-route]");
    if (btn) {
      var r = btn.getAttribute("data-route");
      var hash = r.startsWith("#") ? r : "#" + r;
      if (location.hash !== hash) location.hash = hash;
      else handleRoute();
      return;
    }

    var tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      var tab = tabBtn.getAttribute("data-tab");
      if (tab && tab !== appState.currentTab) {
        appState.currentTab = tab;
        var view = appState.currentView;
        if (view === "sign" || view === "result") {
          saveSession();
          render();
        }
      }
      return;
    }

    var catBtn = e.target.closest("[data-category]");
    if (catBtn) {
      appState.category = catBtn.getAttribute("data-category");
      saveSession();
      location.hash = "#draw-question";
      return;
    }

    var action = e.target.closest("[data-action]");
    if (!action) return;
    var act = action.getAttribute("data-action");

    if (act === "start-draw") {
      appState.category = ""; appState.question = "";
      location.hash = "#draw-category";
    } else if (act === "submit-q") {
      var inp = document.getElementById("q-input");
      if (inp) appState.question = inp.value.trim();
      saveSession(); location.hash = "#prepare";
    } else if (act === "skip-q") {
      appState.question = ""; saveSession(); location.hash = "#prepare";
    } else if (act === "do-draw") {
      finishDraw();
    } else if (act === "lookup-minus") {
      var v = appState.lookupNumber - 1;
      if (v >= 1) appState.lookupNumber = v;
      render();
    } else if (act === "lookup-plus") {
      var v = appState.lookupNumber + 1;
      if (v <= appState.signs.length) appState.lookupNumber = v;
      render();
    } else if (act === "lookup-go") {
      var s2 = appState.signs.find(function(x){ return x.number === appState.lookupNumber; });
      if (s2) {
        appState.currentSign = s2;
        appState.currentTab = "original";
        addHistory(s2, "lookup");
        saveSession();
        location.hash = "#sign/" + s2.number;
      }
    } else if (act === "clear-history") {
      appState.history = []; saveHistory(); render();
    } else if (act === "clear-library-filter") {
      appState.librarySearch = "";
      render();
    } else if (act === "ai-demo") {
      requestAiReading();
    }
  });

  document.addEventListener("change", function(e) {
    if (e.target.id === "lookup-num") {
      var v = Number(e.target.value);
      if (v >= 1 && v <= appState.signs.length) appState.lookupNumber = v;
    }
    if (e.target.id === "lookup-select") {
      appState.lookupNumber = Number(e.target.value);
      render();
    }
    if (e.target.id === "lib-select") {
      appState.otherLibraryKey = e.target.value;
      appState.librarySearch = "";
      render();
    }
    if (e.target.id === "lib-search") {
      appState.librarySearch = e.target.value;
      render();
      var inp = document.getElementById("lib-search");
      if (inp) inp.focus();
    }
  });

  document.addEventListener("input", function(e) {
    if (e.target.id === "q-input") {
      appState.question = e.target.value;
      var count = document.getElementById("q-count");
      if (count) count.textContent = e.target.value.length;
    }
    if (e.target.id === "lib-search") {
      appState.librarySearch = e.target.value;
      render();
      var libInput = document.getElementById("lib-search");
      if (libInput) libInput.focus();
    }
  });

  document.addEventListener("pointerdown", function(e) {
    if (e.target.closest("[data-action=\"hold-draw\"]")) startHold(e);
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach(function(type) {
    document.addEventListener(type, function(e) {
      if (holdTimer && e.target.closest && e.target.closest("[data-action=\"hold-draw\"]")) cancelHold(true);
    });
  });

  document.addEventListener("keydown", function(e) {
    if (e.target.id === "q-input" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      appState.question = e.target.value.trim();
      saveSession(); location.hash = "#prepare";
    }
    if (e.target.id === "lookup-num" && e.key === "Enter") {
      var v = Number(e.target.value);
      if (v >= 1 && v <= appState.signs.length) {
        appState.lookupNumber = v;
        var s = appState.signs.find(function(x){ return x.number === v; });
        if (s) {
          appState.currentSign = s;
          appState.currentTab = "original";
          addHistory(s, "lookup");
          saveSession();
          location.hash = "#sign/" + v;
        }
      }
    }
    if (e.target.matches && e.target.matches("[data-action=\"hold-draw\"]") && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      finishDraw();
    }
  });

  document.addEventListener("click", function(e) {
    var hView = e.target.closest("[data-h-view]");
    if (hView) {
      var id = hView.getAttribute("data-h-view");
      var rec = appState.history.find(function(r){ return r.id === id; });
      if (rec) {
        var s = appState.signs.find(function(x){ return x.number === rec.signNumber; });
        if (s) {
          appState.currentSign = s;
          appState.currentTab = "original";
          saveSession();
          location.hash = "#sign/" + s.number;
        }
      }
      return;
    }

    var hFav = e.target.closest("[data-h-fav]");
    if (hFav) {
      var id2 = hFav.getAttribute("data-h-fav");
      var rec2 = appState.history.find(function(r){ return r.id === id2; });
      if (rec2) { rec2.favorite = !rec2.favorite; saveHistory(); render(); }
      return;
    }

    var hDel = e.target.closest("[data-h-del]");
    if (hDel) {
      var id3 = hDel.getAttribute("data-h-del");
      appState.history = appState.history.filter(function(r){ return r.id !== id3; });
      saveHistory(); render();
      return;
    }
  });

  var dialog = document.querySelector("#confirm-dialog");
  if (dialog) {
    dialog.addEventListener("close", function() {
      if (dialog.returnValue === "confirm") {
        // handle confirm
      }
    });
  }

  window.addEventListener("hashchange", handleRoute);

  async function init() {
    await loadData();
    appState.history = readStorage(STORAGE_KEYS.history, []);
    if (!appState.signs.length) return;
    restoreState();
    handleRoute();
  }

  init();
})();
