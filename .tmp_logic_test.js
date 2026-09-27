// 最小 DOM 桩，用于在 Node 中加载 app.js 并验证业务逻辑
const fs = require("fs");

const captured = { listeners: {}, saves: [], downloads: [] };

function makeEl(tag = "el") {
  const el = {
    tag,
    value: "",
    innerHTML: "",
    textContent: "",
    hidden: false,
    files: [],
    checked: false,
    dataset: {},
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
    dispatch(type, event = {}) {
      event.target = event.target || this;
      (this._listeners[type] || []).forEach((fn) => fn(event));
    },
    click(event) { this.dispatch("click", event); },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    reset() {},
    showModal() {},
    close() {},
    select() {},
    focus() {},
    removeEventListener() {}
  };
  return el;
}

const els = {};
const get = (sel) => (els[sel] ||= makeEl(sel));

global.document = {
  querySelector: (sel) => get(sel),
  addEventListener: () => {},
  createElement: () => makeEl("a")
};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = v; captured.saves.push(v); }
};
global.crypto = { randomUUID: () => "id-" + Math.random().toString(36).slice(2, 9) };
global.confirm = () => true;
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };

// 预置旧版数据：矿物全是自由文本，写法分散
localStorage.setItem("wxyy-2-thin-section-index", JSON.stringify({
  samples: [
    { id: "s1", code: "BX-01", polarization: "正交偏光", minerals: "石英颗粒、黑云母", mineralPicks: undefined },
    { id: "s2", code: "BX-02", polarization: "单偏光", minerals: "Qz、斜长石" },
    { id: "s3", code: "BX-03", polarization: "单偏光", minerals: "黑云母、Qz、钾长石" },
    { id: "s4", code: "BX-04", polarization: "反射光", minerals: "未知矿物X" }
  ],
  compare: ["s1", "s3"]
}));

(0, eval)(fs.readFileSync("app.js", "utf8"));

let state = JSON.parse(localStorage.getItem("wxyy-2-thin-section-index"));
const canon = (s) => [...new Set(s.mineralPicks.map(globalThis.canonicalOf))].sort();

// 1) 旧样本迁移：原写法保留，且解析到标准名
const s1 = state.samples.find((s) => s.id === "s1");
console.log("迁移后 s1 picks:", JSON.stringify(s1.mineralPicks));
console.log("迁移后 s1 minerals 原文保留:", s1.minerals);
console.log("s1 规范名:", canon(s1).join("、"));
console.log("s2 规范名 (Qz->石英):", canon(state.samples.find(s => s.id === "s2")).join("、"));

// 2) AND 多选筛选：石英 + 黑云母，只有 s1、s3 同时命中
function setFilter(keys) {
  const pop = get("#mineralFilterPop");
  pop.querySelectorAll = () => keys.map((value) => ({ value }));
  pop.dispatch("change");
}
setFilter(["id:m-quartz", "id:m-biotite"]);
let andHits = globalThis.filteredSamples().map((s) => s.code).sort();
console.log("AND筛选(石英+黑云母):", andHits.join(","), andHits.join() === "BX-01,BX-03" ? "PASS" : "FAIL");

setFilter(["id:m-quartz"]);
let oneHits = globalThis.filteredSamples().map((s) => s.code).sort();
console.log("筛选(石英):", oneHits.join(","), oneHits.join() === "BX-01,BX-02,BX-03" ? "PASS" : "FAIL");

setFilter(["raw:未知矿物X"]);
let rawHits = globalThis.filteredSamples().map((s) => s.code);
console.log("筛选(原写法 未知矿物X):", rawHits.join(","), rawHits.join() === "BX-04" ? "PASS" : "FAIL");

// 3) 登记新同义词后，旧样本即时归并
addSynonym(state.roster.find((e) => e.name === "石英").id, "石英粒");
state = JSON.parse(localStorage.getItem("wxyy-2-thin-section-index"));
state.samples.find((s) => s.id === "s4").mineralPicks.push({ mineralId: null, raw: "石英粒" });
console.log("新同义词即时解析:", globalThis.canonicalOf({ mineralId: null, raw: "石英粒" }) === "石英" ? "PASS" : "FAIL");

// 4) 合并标准名 黑云母 -> 石英（仅为验证机制）：样本引用即时跟随，对比卡片不丢
const bi = state.roster.find((e) => e.name === "黑云母").id;
const qz = state.roster.find((e) => e.name === "石英").id;
globalThis.mergeRosterEntry(bi, qz);
const after = JSON.parse(localStorage.getItem("wxyy-2-thin-section-index"));
console.log("合并后名册无黑云母:", !after.roster.some((e) => e.name === "黑云母") ? "PASS" : "FAIL");
console.log("黑云母成为石英同义词:", after.roster.find((e) => e.id === qz).synonyms.includes("黑云母") ? "PASS" : "FAIL");
console.log("s1 原写法仍保留:", after.samples.find(s => s.id === "s1").mineralPicks.some(p => p.raw === "黑云母") ? "PASS" : "FAIL");
console.log("s1 黑云母引用已改指石英:", after.samples.find(s => s.id === "s1").mineralPicks.every(p => p.mineralId !== bi) ? "PASS" : "FAIL");
console.log("对比卡片未丢失:", JSON.stringify(after.compare) === JSON.stringify(["s1", "s3"]) ? "PASS" : "FAIL");
console.log("样本数未减少:", after.samples.length === 4 ? "PASS" : "FAIL");
// Bt 同义词也并入
console.log("Bt 随合并迁移:", after.roster.find(e => e.id === qz).synonyms.includes("Bt") ? "PASS" : "FAIL");

// 5) 导出归并到标准名
const exported = state.samples.map((sample) => ({
  样本编号: sample.code,
  主要矿物: [...new Set(sample.mineralPicks.map(globalThis.canonicalOf).filter(Boolean))].join("、"),
  矿物原写法: sample.mineralPicks.map((p) => p.raw).join("、")
}));
const s1row = exported.find((r) => r.样本编号 === "BX-01");
console.log("导出 s1 标准名:", s1row["主要矿物"], "| 原写法:", s1row["矿物原写法"]);
console.log("导出归并校验:", s1row["主要矿物"] === "石英" && s1row["矿物原写法"] === "石英颗粒、黑云母" ? "PASS" : "FAIL");
