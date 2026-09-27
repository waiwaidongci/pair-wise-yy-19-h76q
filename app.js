const storageKey = "wxyy-2-thin-section-index";
const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[]}');
if (!Array.isArray(state.samples)) state.samples = [];
if (!Array.isArray(state.compare)) state.compare = [];
if (!Array.isArray(state.minerals)) {
  // 首次启用名册时预置常见造岩矿物，现场写法可继续登记为同义词
  state.minerals = [
    { id: crypto.randomUUID(), name: "石英", synonyms: ["Qz", "石英颗粒"], mergedInto: null },
    { id: crypto.randomUUID(), name: "斜长石", synonyms: ["Pl"], mergedInto: null },
    { id: crypto.randomUUID(), name: "钾长石", synonyms: ["Kfs"], mergedInto: null },
    { id: crypto.randomUUID(), name: "黑云母", synonyms: ["Bt"], mergedInto: null },
    { id: crypto.randomUUID(), name: "白云母", synonyms: ["Ms"], mergedInto: null },
    { id: crypto.randomUUID(), name: "角闪石", synonyms: ["Amp"], mergedInto: null },
    { id: crypto.randomUUID(), name: "辉石", synonyms: ["Px"], mergedInto: null },
    { id: crypto.randomUUID(), name: "方解石", synonyms: ["Cal"], mergedInto: null }
  ];
  save();
}

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");
const mineralSelect = document.querySelector("#mineralSelect");
const mineralList = document.querySelector("#mineralList");
const newMineralName = document.querySelector("#newMineralName");
const addMineralBtn = document.querySelector("#addMineralBtn");
const synonymTarget = document.querySelector("#synonymTarget");
const newSynonym = document.querySelector("#newSynonym");
const addSynonymBtn = document.querySelector("#addSynonymBtn");
const mergeSource = document.querySelector("#mergeSource");
const mergeTarget = document.querySelector("#mergeTarget");
const mergeBtn = document.querySelector("#mergeBtn");

let pendingPhoto = "";
const selectedMinerals = new Set();

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function mineralById(id) {
  return state.minerals.find((mineral) => mineral.id === id) || null;
}

// 沿 mergedInto 链解析到最终标准名，带环与悬空引用保护
function canonicalMineral(entry) {
  let current = entry;
  const seen = new Set([entry.id]);
  while (current && current.mergedInto && !seen.has(current.mergedInto)) {
    seen.add(current.mergedInto);
    current = mineralById(current.mergedInto) || current;
  }
  return current || entry;
}

function canonicalMinerals() {
  return state.minerals.filter((mineral) => canonicalMineral(mineral).id === mineral.id);
}

function canonicalNameById(id) {
  const entry = mineralById(id);
  return entry ? canonicalMineral(entry).name : null;
}

function findMineralEntry(token) {
  const key = (token || "").trim().toLowerCase();
  if (!key) return null;
  return state.minerals.find((mineral) =>
    mineral.name.trim().toLowerCase() === key ||
    (mineral.synonyms || []).some((synonym) => synonym.trim().toLowerCase() === key)
  ) || null;
}

// 样本归入的标准名集合：新样本走 mineralRefs，旧样本把原写法切词后查名册
function sampleMineralNames(sample) {
  const names = new Set();
  if (Array.isArray(sample.mineralRefs) && sample.mineralRefs.length) {
    sample.mineralRefs.forEach((id) => {
      const name = canonicalNameById(id);
      if (name) names.add(name);
    });
    return names;
  }
  (sample.minerals || "").split(/[、,，;；/\s]+/).filter(Boolean).forEach((token) => {
    const entry = findMineralEntry(token);
    if (entry) names.add(canonicalMineral(entry).name);
  });
  return names;
}

function filteredSamples() {
  const polarization = polarFilter.value;
  const wanted = [...selectedMinerals].map(canonicalNameById).filter(Boolean);
  return state.samples.filter((sample) => {
    if (polarization && sample.polarization !== polarization) return false;
    if (!wanted.length) return true;
    const have = sampleMineralNames(sample);
    return wanted.every((name) => have.has(name));
  });
}

function renderMineralOptions() {
  const entries = canonicalMinerals();
  // 重新渲染时保留录入表单里已选的矿物；若刚被合并则跟随到目标名
  const keep = new Set([...mineralSelect.selectedOptions].map((option) => {
    const entry = mineralById(option.value);
    return entry ? canonicalMineral(entry).id : option.value;
  }));
  mineralSelect.innerHTML = entries.map((mineral) =>
    `<option value="${mineral.id}" ${keep.has(mineral.id) ? "selected" : ""}>${mineral.name}</option>`
  ).join("");
  const options = entries.map((mineral) => `<option value="${mineral.id}">${mineral.name}</option>`).join("");
  synonymTarget.innerHTML = options;
  mergeSource.innerHTML = options;
  mergeTarget.innerHTML = options;
}

function renderMineralFilter() {
  const entries = canonicalMinerals();
  const valid = new Set(entries.map((mineral) => mineral.id));
  [...selectedMinerals].forEach((id) => {
    const entry = mineralById(id);
    const canonicalId = entry ? canonicalMineral(entry).id : null;
    selectedMinerals.delete(id);
    if (canonicalId && valid.has(canonicalId)) selectedMinerals.add(canonicalId);
  });
  mineralFilter.innerHTML = entries.length ? entries.map((mineral) => `
    <button type="button" class="chip ${selectedMinerals.has(mineral.id) ? "active" : ""}" data-mineral="${mineral.id}">${mineral.name}</button>
  `).join("") : '<span class="hint">名册为空，先在左侧添加标准名</span>';
}

function renderMineralList() {
  const entries = canonicalMinerals();
  mineralList.innerHTML = entries.length ? entries.map((entry) => {
    const merged = state.minerals.filter((mineral) =>
      mineral.id !== entry.id && canonicalMineral(mineral).id === entry.id
    );
    const synonyms = (entry.synonyms || []).map((synonym) => `<span class="tag">${synonym}</span>`).join("");
    return `<div class="mineral-row">
      <h3>${entry.name}</h3>
      <p>${synonyms ? `同义词：${synonyms}` : "暂无同义词"}</p>
      ${merged.length ? `<p>已并入：${merged.map((mineral) => mineral.name).join("、")}</p>` : ""}
    </div>`;
  }).join("") : "<p>名册为空，先添加一个标准名。</p>";
}

function render() {
  renderMineralOptions();
  renderMineralFilter();
  renderMineralList();

  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => {
    const canonical = [...sampleMineralNames(sample)].join("、");
    const mergedNote = canonical && canonical !== sample.minerals
      ? `<span class="canonical">（标准名：${canonical}）</span>` : "";
    return `
    <article class="sample-card">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}${mergedNote}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <button type="button" data-delete="${sample.id}">删除</button>
        </div>
      </div>
    </article>`;
  }).join("") : "<p>还没有样本，先从左侧录入一张薄片照片。</p>";

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}对比图">` : ""}
      <h3>${sample.code}</h3>
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
    </article>
  `).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";
}

photoInput.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const mineralRefs = [...mineralSelect.selectedOptions].map((option) => option.value);
  state.samples.unshift({
    id: crypto.randomUUID(),
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    minerals: mineralRefs.map(canonicalNameById).filter(Boolean).join("、"),
    mineralRefs,
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    createdAt: new Date().toISOString()
  });
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  render();
});

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

mineralFilter.addEventListener("click", (event) => {
  const id = event.target.dataset.mineral;
  if (!id) return;
  if (selectedMinerals.has(id)) {
    selectedMinerals.delete(id);
  } else {
    selectedMinerals.add(id);
  }
  render();
});

polarFilter.addEventListener("input", render);

addMineralBtn.addEventListener("click", () => {
  const name = newMineralName.value.trim();
  if (!name) return;
  const existing = findMineralEntry(name);
  if (existing) {
    alert(`“${name}” 已登记在「${canonicalMineral(existing).name}」下`);
    return;
  }
  state.minerals.push({ id: crypto.randomUUID(), name, synonyms: [], mergedInto: null });
  newMineralName.value = "";
  save();
  render();
});

addSynonymBtn.addEventListener("click", () => {
  const target = mineralById(synonymTarget.value);
  const word = newSynonym.value.trim();
  if (!target || !word) return;
  const existing = findMineralEntry(word);
  if (existing) {
    alert(`“${word}” 已登记在「${canonicalMineral(existing).name}」下`);
    return;
  }
  target.synonyms = [...(target.synonyms || []), word];
  newSynonym.value = "";
  save();
  render();
});

mergeBtn.addEventListener("click", () => {
  const source = mineralById(mergeSource.value);
  const target = mineralById(mergeTarget.value);
  if (!source || !target) return;
  const canonicalTarget = canonicalMineral(target);
  if (canonicalMineral(source).id === canonicalTarget.id) return;
  // 只改指向：样本引用即时跟随，state.compare 不动，对比卡片不丢
  source.mergedInto = canonicalTarget.id;
  save();
  render();
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: [...sampleMineralNames(sample)].join("、") || sample.minerals,
    原始写法: sample.minerals,
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

render();
