const storageKey = "wxyy-2-thin-section-index";

const seedRoster = [
  { id: "m-quartz", name: "石英", synonyms: ["Qz", "石英颗粒"] },
  { id: "m-plagioclase", name: "斜长石", synonyms: ["Pl", "斜长石颗粒"] },
  { id: "m-kfeldspar", name: "钾长石", synonyms: ["Kfs", "正长石", "钾长石颗粒"] },
  { id: "m-biotite", name: "黑云母", synonyms: ["Bt"] },
  { id: "m-muscovite", name: "白云母", synonyms: ["Ms"] },
  { id: "m-hornblende", name: "角闪石", synonyms: ["Hbl", "普通角闪石"] },
  { id: "m-pyroxene", name: "辉石", synonyms: ["Px"] },
  { id: "m-olivine", name: "橄榄石", synonyms: ["Ol"] },
  { id: "m-calcite", name: "方解石", synonyms: ["Cal"] },
  { id: "m-dolomite", name: "白云石", synonyms: ["Dol"] },
  { id: "m-clay", name: "黏土矿物", synonyms: ["黏土", "泥质"] },
  { id: "m-garnet", name: "石榴子石", synonyms: ["Grt"] },
  { id: "m-opaque", name: "不透明矿物", synonyms: ["金属矿物", "磁铁矿"] }
];

const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[]}');
let stateDirty = false;
if (!Array.isArray(state.roster)) {
  state.roster = seedRoster;
  stateDirty = true;
}
if (!Array.isArray(state.filterMinerals)) state.filterMinerals = [];

const splitTokens = (text) => text.split(/[、,，;；/／\s]+/).map((t) => t.trim()).filter(Boolean);
const norm = (text) => text.trim().toUpperCase();

// 旧样本迁移：把自由文本拆成词，尽量对到名册，对不上的保留原写法
function resolveTokenToPick(token) {
  const hit = state.roster.find((entry) =>
    norm(entry.name) === norm(token) || entry.synonyms.some((syn) => norm(syn) === norm(token))
  );
  return { mineralId: hit ? hit.id : null, raw: token };
}

state.samples.forEach((sample) => {
  if (!Array.isArray(sample.mineralPicks) && typeof sample.minerals === "string") {
    sample.mineralPicks = splitTokens(sample.minerals).map(resolveTokenToPick);
    stateDirty = true;
  }
  if (!Array.isArray(sample.mineralPicks)) sample.mineralPicks = [];
});

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const polarFilter = document.querySelector("#polarFilter");
const mineralPicker = document.querySelector("#mineralPicker");
const mineralChips = document.querySelector("#mineralChips");
const mineralInput = document.querySelector("#mineralInput");
const mineralSuggest = document.querySelector("#mineralSuggest");
const mineralFilterBtn = document.querySelector("#mineralFilterBtn");
const mineralFilterPop = document.querySelector("#mineralFilterPop");
const rosterDialog = document.querySelector("#rosterDialog");

let pendingPhoto = "";
let entryPicks = [];

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

/* ---------- 名册与规范名解析 ---------- */

const rosterEntry = (id) => state.roster.find((entry) => entry.id === id) || null;

// 一个矿物引用最终归到的标准名：有 id 用条目名；否则按同义词反查；都没有就用原写法
function canonicalOf(pick) {
  if (!pick) return "";
  if (pick.mineralId) {
    const entry = rosterEntry(pick.mineralId);
    if (entry) return entry.name;
  }
  const bySynonym = state.roster.find((entry) =>
    norm(entry.name) === norm(pick.raw) || entry.synonyms.some((syn) => norm(syn) === norm(pick.raw))
  );
  return bySynonym ? bySynonym.name : pick.raw;
}

const sampleRawText = (sample) =>
  sample.mineralPicks.length ? sample.mineralPicks.map((pick) => pick.raw).join("、") : (sample.minerals || "");

const sampleCanonicalSet = (sample) => [...new Set(sample.mineralPicks.map(canonicalOf).filter(Boolean))];

/* ---------- 录入：矿物选择器 ---------- */

function pickExists(pick) {
  return entryPicks.some((item) =>
    pick.mineralId
      ? item.mineralId === pick.mineralId
      : !item.mineralId && norm(item.raw) === norm(pick.raw)
  );
}

function addPick(pick) {
  if (!pick.raw.trim() || pickExists(pick)) return;
  entryPicks.push({ mineralId: pick.mineralId || null, raw: pick.raw.trim() });
  mineralInput.value = "";
  renderEntryChips();
  renderSuggest("");
}

function renderEntryChips() {
  mineralChips.innerHTML = entryPicks.map((pick, index) => {
    const canonical = canonicalOf(pick);
    const titled = canonical && canonical !== pick.raw ? ` title="标准名：${esc(canonical)}"` : "";
    return `<span class="chip"${titled}>${esc(pick.raw)}<button type="button" class="chip-x" data-pick-remove="${index}" aria-label="移除">×</button></span>`;
  }).join("");
}

function standardOptions(selectedName) {
  return state.roster
    .map((entry) => `<option value="${esc(entry.id)}"${entry.name === selectedName ? " selected" : ""}>${esc(entry.name)}</option>`)
    .join("");
}

function renderSuggest(query) {
  const q = query.trim();
  const key = norm(q);
  const matches = state.roster
    .map((entry) => {
      const names = [entry.name, ...entry.synonyms];
      const hitIndex = names.findIndex((name) => norm(name).includes(key));
      return { entry, hitIndex };
    })
    .filter((item) => !key || item.hitIndex !== -1)
    .sort((a, b) => a.hitIndex - b.hitIndex)
    .slice(0, key ? 8 : 6);

  let html = matches.map(({ entry }) => {
    const syn = entry.synonyms.length ? `<span class="suggest-syn">＝${esc(entry.synonyms.join("、"))}</span>` : "";
    return `<button type="button" class="suggest-item" data-pick-id="${esc(entry.id)}">
      <span class="suggest-name">${esc(entry.name)}</span>${syn}
    </button>`;
  }).join("");

  if (q) {
    const exactStandard = state.roster.some((entry) =>
      norm(entry.name) === key || entry.synonyms.some((syn) => norm(syn) === key)
    );
    if (!exactStandard) {
      html += `
        <div class="suggest-actions">
          <span>“${esc(q)}”不在名册中：</span>
          <div class="suggest-register">
            <select id="synTarget" aria-label="选择标准名">${standardOptions()}</select>
            <button type="button" class="btn-secondary" data-register-syn="${esc(q)}">登记为同义词</button>
          </div>
          <button type="button" class="btn-secondary" data-pick-raw="${esc(q)}">先按原写法保留</button>
        </div>`;
    }
  }

  mineralSuggest.innerHTML = html || "<p class=\"suggest-empty\">名册里还没有匹配项，可回车保留原写法，或打开矿物名册维护。</p>";
  mineralSuggest.hidden = false;
}

mineralInput.addEventListener("focus", () => renderSuggest(mineralInput.value));
mineralInput.addEventListener("input", () => renderSuggest(mineralInput.value));
mineralInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = mineralSuggest.querySelector("[data-pick-id]");
    const q = mineralInput.value.trim();
    if (first) {
      addPick({ mineralId: first.dataset.pickId, raw: rosterEntry(first.dataset.pickId).name });
    } else if (q) {
      addPick(resolveTokenToPick(q));
    }
  } else if (event.key === "Backspace" && !mineralInput.value && entryPicks.length) {
    entryPicks.pop();
    renderEntryChips();
    renderSuggest("");
  }
});

mineralSuggest.addEventListener("click", (event) => {
  const pickId = event.target.closest("[data-pick-id]")?.dataset.pickId;
  const rawValue = event.target.closest("[data-pick-raw]")?.dataset.pickRaw;
  const registerValue = event.target.closest("[data-register-syn]")?.dataset.registerSyn;
  if (pickId) {
    const entry = rosterEntry(pickId);
    if (entry) addPick({ mineralId: entry.id, raw: entry.name });
    mineralInput.focus();
  } else if (rawValue) {
    addPick({ mineralId: null, raw: rawValue });
    mineralInput.focus();
  } else if (registerValue) {
    const targetId = mineralSuggest.querySelector("#synTarget").value;
    addSynonym(targetId, registerValue);
    const entry = rosterEntry(targetId);
    addPick({ mineralId: targetId, raw: registerValue });
    mineralInput.focus();
  }
});

mineralChips.addEventListener("click", (event) => {
  const index = event.target.dataset.pickRemove;
  if (index === undefined) return;
  entryPicks.splice(Number(index), 1);
  renderEntryChips();
});

document.addEventListener("click", (event) => {
  if (!mineralPicker.contains(event.target)) mineralSuggest.hidden = true;
  if (!document.querySelector("#mineralFilter").contains(event.target)) mineralFilterPop.hidden = true;
});

/* ---------- 样本保存 / 卡片 / 对比 ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  state.samples.unshift({
    id: crypto.randomUUID(),
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    mineralPicks: entryPicks.map((pick) => ({ ...pick })),
    minerals: entryPicks.map((pick) => pick.raw).join("、"),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    createdAt: new Date().toISOString()
  });
  entryPicks = [];
  pendingPhoto = "";
  photoInput.value = "";
  mineralInput.value = "";
  form.reset();
  mineralSuggest.hidden = true;
  renderEntryChips();
  save();
  render();
});

function sampleMineralChips(sample) {
  if (!sample.mineralPicks.length) return "未记录";
  return sample.mineralPicks.map((pick) => {
    const canonical = canonicalOf(pick);
    const titled = canonical && canonical !== pick.raw ? ` title="标准名：${esc(canonical)}"` : "";
    return `<span class="chip chip-readonly"${titled}>${esc(pick.raw)}</span>`;
  }).join("");
}

function filteredSamples() {
  const wanted = state.filterMinerals;
  const polarization = polarFilter.value;
  return state.samples.filter((sample) => {
    // 多选矿物为“全部命中”：每个所选标准名（或未登记原写法）都在该样本的规范名集合里
    const mineralMatch = wanted.every((key) => {
      if (key.startsWith("id:")) {
        const entry = rosterEntry(key.slice(3));
        return entry ? sampleCanonicalSet(sample).includes(entry.name) : false;
      }
      return sampleCanonicalSet(sample).includes(key.slice(4));
    });
    const polarMatch = !polarization || sample.polarization === polarization;
    return mineralMatch && polarMatch;
  });
}

function render() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => `
    <article class="sample-card">
      ${sample.photo ? `<img src="${sample.photo}" alt="${esc(sample.code)}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <h3>${esc(sample.code)}</h3>
        <p>${esc(sample.location || "未记录地点")} · ${esc(sample.magnification || "未记录倍数")} · ${esc(sample.polarization)}</p>
        <p class="mineral-line">矿物：${sampleMineralChips(sample)}</p>
        <p>结构：${esc(sample.texture || "未记录")}</p>
        <p>${esc(sample.comment || "未填写批注")}</p>
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${esc(sample.id)}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <button type="button" data-delete="${esc(sample.id)}">删除</button>
        </div>
      </div>
    </article>
  `).join("") : "<p>还没有样本，先从左侧录入一张薄片照片。</p>";

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${esc(sample.code)}对比图">` : ""}
      <h3>${esc(sample.code)}</h3>
      <p>${esc(sample.polarization)} · ${esc(sampleRawText(sample) || "未记录矿物")}</p>
      <p>${esc(sample.texture || "未记录结构")}</p>
    </article>
  `).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";

  renderFilterButton();
}

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    save();
    render();
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  if (event.target.checked) {
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  render();
});

/* ---------- 多选筛选（AND） ---------- */

const filterKeyOfPick = (pick) =>
  pick.mineralId && rosterEntry(pick.mineralId) ? `id:${pick.mineralId}` : `raw:${pick.raw}`;

function filterLabel(key) {
  if (key.startsWith("id:")) return rosterEntry(key.slice(3))?.name || key.slice(4);
  return key.slice(4);
}

function renderFilterButton() {
  const count = state.filterMinerals.length;
  mineralFilterBtn.textContent = count
    ? `矿物：${state.filterMinerals.slice(0, 2).map(filterLabel).join("、")}${count > 2 ? ` 等${count}项` : ""}（全部命中）`
    : "按矿物筛选（全部命中）";
}

function renderFilterPop() {
  const usedKeys = new Set();
  state.samples.forEach((sample) => sample.mineralPicks.forEach((pick) => {
    if (pick.raw) usedKeys.add(filterKeyOfPick(pick));
  }));
  state.roster.forEach((entry) => usedKeys.add(`id:${entry.id}`));

  const rows = [...usedKeys]
    .map((key) => ({ key, label: filterLabel(key), isId: key.startsWith("id:") }))
    .sort((a, b) => Number(b.isId) - Number(a.isId) || a.label.localeCompare(b.label, "zh-Hans-CN"));

  mineralFilterPop.innerHTML = rows.map(({ key, label, isId }) => `
    <label class="check-row">
      <input type="checkbox" value="${esc(key)}" ${state.filterMinerals.includes(key) ? "checked" : ""}>
      <span>${esc(label)}</span>${isId ? "" : '<em class="raw-tag">原写法</em>'}
    </label>
  `).join("") || "<p class=\"suggest-empty\">名册里还没有矿物，先打开矿物名册维护。</p>";
}

mineralFilterBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  renderFilterPop();
  mineralFilterPop.hidden = !mineralFilterPop.hidden;
});

mineralFilterPop.addEventListener("click", (event) => event.stopPropagation());
mineralFilterPop.addEventListener("change", () => {
  state.filterMinerals = [...mineralFilterPop.querySelectorAll("input:checked")].map((input) => input.value);
  save();
  render();
});
polarFilter.addEventListener("input", render);

/* ---------- 矿物名册维护 ---------- */

const rosterList = document.querySelector("#rosterList");
const rosterAddForm = document.querySelector("#rosterAddForm");
const rosterAddInput = document.querySelector("#rosterAddInput");

document.querySelector("#rosterBtn").addEventListener("click", () => {
  renderRoster();
  rosterDialog.showModal();
});
document.querySelector("#rosterCloseBtn").addEventListener("click", () => rosterDialog.close());

function addSynonym(entryId, syn) {
  const entry = rosterEntry(entryId);
  const value = syn.trim();
  if (!entry || !value) return false;
  const used = state.roster.some((item) =>
    norm(item.name) === norm(value) || item.synonyms.some((s) => norm(s) === norm(value))
  );
  if (used || entry.synonyms.some((s) => norm(s) === norm(value))) return false;
  entry.synonyms.push(value);
  save();
  renderRoster();
  return true;
}

// 把标准名 fromId 合并到 toId：名字与同义词全部并入，样本引用即时改指；样本与对比选择不删除
function mergeRosterEntry(fromId, toId) {
  if (fromId === toId) return;
  const from = rosterEntry(fromId);
  const to = rosterEntry(toId);
  if (!from || !to) return;
  const known = new Set([norm(to.name), ...to.synonyms.map(norm)]);
  [from.name, ...from.synonyms].forEach((word) => {
    if (!known.has(norm(word))) {
      to.synonyms.push(word);
      known.add(norm(word));
    }
  });
  state.samples.forEach((sample) => sample.mineralPicks.forEach((pick) => {
    if (pick.mineralId === fromId) pick.mineralId = toId;
  }));
  state.roster = state.roster.filter((entry) => entry.id !== fromId);
  state.filterMinerals = state.filterMinerals.filter((key) => key !== `id:${fromId}`);
  save();
  renderRoster();
  renderEntryChips();
  render();
}

function renderRoster() {
  const options = state.roster
    .map((entry) => `<option value="${esc(entry.id)}">${esc(entry.name)}</option>`)
    .join("");
  rosterList.innerHTML = state.roster.map((entry) => {
    const sampleCount = state.samples.filter((sample) =>
      sample.mineralPicks.some((pick) => canonicalOf(pick) === entry.name)
    ).length;
    const chips = entry.synonyms.map((syn) => `
      <span class="chip" title="标准名：${esc(entry.name)}">${esc(syn)}
        <button type="button" class="chip-x" data-syn-remove="${esc(entry.id)}|${esc(syn)}" aria-label="删除同义词">×</button>
      </span>`).join("");
    const others = state.roster.filter((item) => item.id !== entry.id);
    return `
      <article class="roster-item">
        <div class="roster-item-head">
          <strong>${esc(entry.name)}</strong>
          <span class="roster-count">${sampleCount} 个样本</span>
        </div>
        <div class="roster-syns">${chips || "<span class=\"roster-nosyn\">暂无同义词</span>"}</div>
        <form class="roster-syn-add" data-syn-add="${esc(entry.id)}">
          <input placeholder="登记现场写法，如 Qz" aria-label="同义词">
          <button type="submit" class="btn-secondary">登记</button>
        </form>
        ${others.length ? `
        <form class="roster-merge" data-merge="${esc(entry.id)}">
          <select name="target">${others.map((item) =>
            `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select>
          <button type="submit" class="btn-danger">合并到此标准名</button>
        </form>` : ""}
      </article>`;
  }).join("");
}

rosterAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = rosterAddInput.value.trim();
  if (!name) return;
  const exists = state.roster.some((entry) =>
    norm(entry.name) === norm(name) || entry.synonyms.some((syn) => norm(syn) === norm(name))
  );
  if (exists) {
    rosterAddInput.select();
    return;
  }
  state.roster.push({ id: `m-${crypto.randomUUID()}`, name, synonyms: [] });
  rosterAddInput.value = "";
  save();
  renderRoster();
  renderSuggest(mineralInput.value);
});

rosterList.addEventListener("submit", (event) => {
  const synAddId = event.target.dataset.synAdd;
  const mergeId = event.target.dataset.merge;
  if (synAddId) {
    event.preventDefault();
    const input = event.target.querySelector("input");
    addSynonym(synAddId, input.value);
    input.value = "";
    render();
  } else if (mergeId) {
    event.preventDefault();
    const targetId = new FormData(event.target).get("target");
    const from = rosterEntry(mergeId);
    const to = rosterEntry(targetId);
    if (from && to && confirm(`确认把标准名“${from.name}”合并到“${to.name}”？\n${from.name}及其同义词会作为“${to.name}”的现场写法保留，现有样本即时跟随，原写法不变。`)) {
      mergeRosterEntry(mergeId, targetId);
    }
  }
});

rosterList.addEventListener("click", (event) => {
  const marker = event.target.closest("[data-syn-remove]")?.dataset.synRemove;
  if (!marker) return;
  const [id, syn] = marker.split("|");
  const entry = rosterEntry(id);
  if (!entry) return;
  entry.synonyms = entry.synonyms.filter((item) => item !== syn);
  save();
  renderRoster();
  render();
});

/* ---------- 导出：矿物归到标准名，同时附原写法 ---------- */

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: sampleCanonicalSet(sample).join("、"),
    矿物原写法: sampleRawText(sample),
    颗粒结构: sample.texture,
    老师批注: sample.comment
  }));
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

renderEntryChips();
render();
if (stateDirty) save();
