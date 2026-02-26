/* Township Planner - Offline (LocalStorage) */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const LS_KEY = "township_planner_v1";
const DASHBOARD_SETTINGS_KEY = "township_dashboard_settings_v1";

function uid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(3); }
function nowMs(){ return Date.now(); }
function minsToMs(m){ return Math.max(0, Number(m||0)) * 60 * 1000; }
function normalizeItemKey(itemName){ return String(itemName || "").trim().toLowerCase(); }
function fmtMins(m){
  m = Math.max(0, Math.floor(m));
  return formatDurationSeconds(m * 60);
}
function clampFactorySpeedBonusPct(v){
  return Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));
}
function getFactorySpeedBonusPct(factory){
  return clampFactorySpeedBonusPct(factory?.speedBonusPct ?? 0);
}
const DEFAULT_BOOSTER_DURATION_MS = 48 * 60 * 60 * 1000;
const BOOSTER_KEYS = ["superHarvest","advancedFarming","highSpeedProduction","efficientSmelting","favorableVoyage","richFields","extraPairOfHands"];
const BOOSTER_EXPIRY_FIELD_BY_KEY = {
  superHarvest: "superHarvestEndsAtMs",
  advancedFarming: "advancedFarmingEndsAtMs",
  highSpeedProduction: "highSpeedProductionEndsAtMs",
  efficientSmelting: "efficientSmeltingEndsAtMs",
  favorableVoyage: "favorableVoyageEndsAtMs",
  richFields: "richFieldsEndsAtMs",
  extraPairOfHands: "extraPairOfHandsEndsAtMs",
};
const BOOSTER_DURATION_MS_BY_KEY = {
  richFields: 24 * 60 * 60 * 1000,
  extraPairOfHands: 2 * 60 * 60 * 1000,
};
function defaultBoosters(){
  return {
    superHarvest:         { enabled: false },
    advancedFarming:      { enabled: false },
    highSpeedProduction:  { enabled: false },
    efficientSmelting:    { enabled: false },
    favorableVoyage:      { enabled: false },
    richFields:           { enabled: false },
    extraPairOfHands:     { enabled: false },
  };
}
function defaultBoosterExpiry(){
  return {
    superHarvestEndsAtMs: null,
    advancedFarmingEndsAtMs: null,
    highSpeedProductionEndsAtMs: null,
    efficientSmeltingEndsAtMs: null,
    favorableVoyageEndsAtMs: null,
    richFieldsEndsAtMs: null,
    extraPairOfHandsEndsAtMs: null,
  };
}
function normalizeBoosterExpiry(boosterExpiry){
  const base = defaultBoosterExpiry();
  const src = (boosterExpiry && typeof boosterExpiry === "object") ? boosterExpiry : {};
  const out = {};
  Object.keys(base).forEach(key => {
    const n = Number(src[key]);
    out[key] = Number.isFinite(n) && n > 0 ? n : null;
  });
  return out;
}
function normalizeBoosters(boosters){
  const base = defaultBoosters();
  const src = (boosters && typeof boosters === "object") ? boosters : {};
  const out = {};
  Object.keys(base).forEach(key => {
    const node = (src[key] && typeof src[key] === "object") ? src[key] : {};
    out[key] = { enabled: node.enabled === true };
  });
  return out;
}
function getBoosterExpiryField(key){
  return BOOSTER_EXPIRY_FIELD_BY_KEY[key] || "";
}
function getBoosterDurationMs(key){
  return Number(BOOSTER_DURATION_MS_BY_KEY[key] || DEFAULT_BOOSTER_DURATION_MS);
}
function getFactoryRunningSlots(settings=null){
  const s = settings ? normalizeSettings(settings) : normalizeSettings(state?.settings);
  const boosters = s.boosters || defaultBoosters();
  return boosters.extraPairOfHands?.enabled ? 2 : 1;
}
function getFactoryRunningSlotsByFactory(factory, settings=null){
  if(isFoundryFactory(factory)) return 1;
  return getFactoryRunningSlots(settings);
}
function getFactoryRunningSlotsByName(factoryName, settings=null){
  const match = (state?.factories || []).find(f=>String(f?.name || "")===String(factoryName || ""));
  return getFactoryRunningSlotsByFactory(match, settings);
}
function getAdjustedCropDurationSeconds(baseDurationMin, settings=null){
  const baseSeconds = Math.max(0, Math.round(Number(baseDurationMin || 0) * 60));
  const s = settings ? normalizeSettings(settings) : normalizeSettings(state?.settings);
  const boosters = s.boosters || defaultBoosters();
  const multiplier = boosters.richFields?.enabled ? 0.6 : 1;
  return Math.max(1, Math.round(baseSeconds * multiplier));
}
function getFarmEffectiveOutputPerAnimal(building, settings=null){
  const s = settings ? normalizeSettings(settings) : normalizeSettings(state?.settings);
  const boosters = s.boosters || defaultBoosters();
  return boosters.advancedFarming?.enabled ? 2 : 1;
}
function isFeedMillFactory(factory){
  const name = String(factory?.name || "").trim().toLowerCase();
  return name === "feed mill";
}
function getProductOutputQty(factory, product){
  if(isFeedMillFactory(factory)) return 3;
  return Math.max(1, Math.floor(Number(product?.outputQty || 1)));
}
function getBoosterEndsAtMs(settings, key){
  const field = getBoosterExpiryField(key);
  if(!field) return null;
  const expiry = normalizeBoosterExpiry(settings?.boosterExpiry);
  return expiry[field];
}
function formatBoosterEndsIn(endsAtMs){
  const leftMs = Number(endsAtMs || 0) - nowMs();
  if(!Number.isFinite(leftMs) || leftMs <= 0) return "Ends in <1m";
  const totalMin = Math.ceil(leftMs / 60000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if(days > 0) return `Ends in ${days}d ${hours}h`;
  if(hours > 0) return `Ends in ${hours}h ${mins}m`;
  return `Ends in ${Math.max(1, mins)}m`;
}
function getBoosterEndsInLabel(key, settings=null){
  const s = settings ? normalizeSettings(settings) : normalizeSettings(state?.settings);
  const boosters = s.boosters || defaultBoosters();
  if(!boosters[key]?.enabled) return "";
  const endsAtMs = getBoosterEndsAtMs(s, key);
  if(!endsAtMs) return "";
  return formatBoosterEndsIn(endsAtMs);
}
function ensureBoosterExpiryState(persist=true){
  const current = normalizeSettings(state.settings);
  const boosters = normalizeBoosters(current.boosters);
  const boosterExpiry = normalizeBoosterExpiry(current.boosterExpiry);
  const now = nowMs();
  let changed = false;
  BOOSTER_KEYS.forEach(key=>{
    const field = getBoosterExpiryField(key);
    if(!field) return;
    const enabled = boosters[key]?.enabled === true;
    const endsAt = boosterExpiry[field];
    if(enabled && !endsAt){
      boosterExpiry[field] = now + getBoosterDurationMs(key);
      changed = true;
      return;
    }
    if(!enabled && endsAt){
      boosterExpiry[field] = null;
      changed = true;
      return;
    }
    if(enabled && endsAt && now >= endsAt){
      boosters[key].enabled = false;
      boosterExpiry[field] = null;
      changed = true;
    }
  });
  if(!changed) return false;
  state.settings = normalizeSettings({
    ...current,
    boosters,
    boosterExpiry,
  });
  if(persist) save();
  return true;
}
function isFoundryFactory(factory){
  const name = String(factory?.name || "").trim().toLowerCase();
  if(name.includes("foundry") || name.includes("smelter")) return true;
  const products = Array.isArray(factory?.products) ? factory.products : [];
  return products.some(p=>{
    const prodName = String(p?.name || "").trim().toLowerCase();
    const prodCategory = String(p?.category || "").trim().toLowerCase();
    return prodName.includes("ingot") || prodCategory.includes("ingot");
  });
}
function setBoosterEnabled(key, enabled){
  const current = normalizeSettings(state.settings);
  const boosters = normalizeBoosters(current.boosters);
  const boosterExpiry = normalizeBoosterExpiry(current.boosterExpiry);
  if(!boosters[key]) return;
  const field = getBoosterExpiryField(key);
  const isOn = !!enabled;
  boosters[key].enabled = isOn;
  if(field){
    boosterExpiry[field] = isOn ? (nowMs() + getBoosterDurationMs(key)) : null;
  }
  state.settings = normalizeSettings({
    ...current,
    boosters,
    boosterExpiry,
  });
  save();
}
function getAdjustedFactoryDurationSeconds(baseDurationMin, factory){
  const baseSeconds = Math.max(0, Number(baseDurationMin || 0) * 60);
  const speedBonusPct = getFactorySpeedBonusPct(factory);
  let multiplier = (1 - (speedBonusPct / 100));
  const boosters = normalizeSettings(state?.settings).boosters || defaultBoosters();
  if(boosters.highSpeedProduction?.enabled) multiplier *= 0.7;
  if(boosters.efficientSmelting?.enabled && isFoundryFactory(factory)) multiplier *= 0.5;
  return Math.max(0, Math.round(baseSeconds * multiplier));
}
function fmtHms(totalSec){
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  if(getTimeFormat()==="minutes"){
    return formatMinutesDisplay(sec);
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if(h > 0) return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  if(m > 0) return `${m}m ${String(s).padStart(2,"0")}s`;
  return `${s}s`;
}
function msToMinsLeft(endMs){
  const diff = endMs - nowMs();
  return Math.ceil(diff / 60000);
}
function fmtLeft(endMs){
  const diff = Math.max(0, endMs - nowMs());
  const totalSec = Math.ceil(diff/1000);
  return formatDurationSeconds(totalSec);
}
function fmtCountdown(endMs){
  const diff = Math.max(0, endMs - nowMs());
  const totalSec = Math.ceil(diff/1000);
  return formatDurationSeconds(totalSec);
}
function collectAutocompleteItemNames(){
  const byLower = new Map();
  const addName = (name)=>{
    const cleaned = String(name || "").trim();
    if(!cleaned) return;
    const key = cleaned.toLowerCase();
    if(!byLower.has(key)) byLower.set(key, cleaned);
  };

  (state?.barn || []).forEach(item=> addName(item?.name));
  (state?.factories || []).forEach(factory=>{
    (factory?.products || []).forEach(product=> addName(product?.name));
  });
  (state?.crops || []).forEach(crop=> addName(crop?.name));
  (state?.farm?.animalBuildings || []).forEach(building=> addName(building?.feedItem));

  return Array.from(byLower.values()).sort((a, b)=>a.localeCompare(b, undefined, {sensitivity:"base"}));
}
function initItemAutocomplete(){
  const selector = 'input[type="text"][data-item-input="true"]';
  let activeInput = null;
  let activeItems = [];
  let activeIndex = -1;
  let menu = null;

  function ensureMenu(){
    if(menu) return menu;
    menu = document.createElement("div");
    menu.className = "autocomplete-menu";
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener("mousedown", (ev)=>{
      const row = ev.target.closest?.(".autocomplete-item");
      if(!row || !activeInput) return;
      ev.preventDefault();
      const idx = Number(row.dataset.idx || -1);
      if(!Number.isFinite(idx) || idx < 0 || idx >= activeItems.length) return;
      applySelection(idx);
    });
    return menu;
  }
  function closeMenu(){
    const panel = ensureMenu();
    panel.hidden = true;
    panel.innerHTML = "";
    panel.style.left = "-9999px";
    panel.style.top = "-9999px";
    panel.style.width = "0px";
    activeItems = [];
    activeIndex = -1;
  }
  function positionMenu(){
    if(!activeInput || !document.body.contains(activeInput)) return;
    const panel = ensureMenu();
    const rect = activeInput.getBoundingClientRect();
    panel.style.left = `${Math.round(rect.left + window.scrollX)}px`;
    panel.style.top = `${Math.round(rect.bottom + window.scrollY + 4)}px`;
    panel.style.width = `${Math.round(rect.width)}px`;
  }
  function getMatches(query){
    const lower = String(query || "").trim().toLowerCase();
    const all = collectAutocompleteItemNames();
    if(!lower) return all.slice(0, 8);
    return all.filter(name=>name.toLowerCase().includes(lower)).slice(0, 8);
  }
  function drawMenu(){
    const panel = ensureMenu();
    if(!activeInput || !activeItems.length){
      closeMenu();
      return;
    }
    panel.innerHTML = activeItems.map((name, idx)=>`
      <div class="autocomplete-item ${idx===activeIndex ? "active" : ""}" data-idx="${idx}" role="option" aria-selected="${idx===activeIndex ? "true" : "false"}">${escapeHtml(name)}</div>
    `).join("");
    panel.hidden = false;
    positionMenu();
  }
  function syncForInput(input){
    activeInput = input;
    activeItems = getMatches(input.value);
    activeIndex = activeItems.length ? 0 : -1;
    drawMenu();
  }
  function applySelection(idx){
    if(!activeInput) return;
    const value = activeItems[idx];
    if(typeof value!=="string") return;
    activeInput.value = value;
    activeInput.dispatchEvent(new Event("input", {bubbles:true}));
    closeMenu();
  }

  document.addEventListener("focusin", (ev)=>{
    const input = ev.target;
    if(!(input instanceof HTMLInputElement) || !input.matches(selector)){
      closeMenu();
      return;
    }
    if(input.readOnly || input.disabled){
      closeMenu();
      return;
    }
    syncForInput(input);
  });
  document.addEventListener("input", (ev)=>{
    const input = ev.target;
    if(!(input instanceof HTMLInputElement)) return;
    if(!input.matches(selector)) return;
    if(input.readOnly || input.disabled){
      closeMenu();
      return;
    }
    syncForInput(input);
  });
  document.addEventListener("keydown", (ev)=>{
    const input = ev.target;
    if(!(input instanceof HTMLInputElement)) return;
    if(!input.matches(selector)) return;
    if(input.readOnly || input.disabled) return;
    if(ev.key==="Escape"){
      closeMenu();
      return;
    }
    if(ev.key==="ArrowDown"){
      if(!activeItems.length) return;
      ev.preventDefault();
      activeIndex = Math.min(activeItems.length - 1, activeIndex + 1);
      drawMenu();
      return;
    }
    if(ev.key==="ArrowUp"){
      if(!activeItems.length) return;
      ev.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      drawMenu();
      return;
    }
    if(ev.key==="Enter" && activeIndex>=0 && activeIndex<activeItems.length){
      ev.preventDefault();
      applySelection(activeIndex);
    }
  });
  document.addEventListener("mousedown", (ev)=>{
    const panel = ensureMenu();
    const target = ev.target;
    if(panel.contains(target)) return;
    if(activeInput && (target===activeInput || activeInput.contains?.(target))) return;
    closeMenu();
  });
  window.addEventListener("resize", ()=>{ if(!ensureMenu().hidden) positionMenu(); });
  window.addEventListener("scroll", ()=>{ if(!ensureMenu().hidden) positionMenu(); }, true);
}
const customDropdownState = {
  initialized:false,
  openWrap:null,
  openMenu:null,
  openButton:null,
};
function positionOpenCustomDropdown(){
  const wrap = customDropdownState.openWrap;
  const menu = customDropdownState.openMenu;
  const button = customDropdownState.openButton;
  if(!wrap || !menu || !button) return;
  const rect = button.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const gap = 6;
  const sidePad = 8;
  const width = Math.max(180, Math.round(rect.width));
  let left = Math.round(rect.left);
  if(left + width > viewportW - sidePad){
    left = Math.max(sidePad, viewportW - sidePad - width);
  }
  if(left < sidePad) left = sidePad;
  menu.style.width = `${width}px`;
  menu.style.minWidth = `${width}px`;
  menu.style.maxHeight = "320px";
  menu.style.visibility = "hidden";
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.round(rect.bottom + gap)}px`;
  const menuH = Math.min(320, Math.ceil(menu.scrollHeight || 0));
  const belowTop = Math.round(rect.bottom + gap);
  const belowBottom = belowTop + menuH;
  const placeAbove = belowBottom > viewportH - sidePad && rect.top - gap - menuH >= sidePad;
  const top = placeAbove
    ? Math.max(sidePad, Math.round(rect.top - gap - menuH))
    : Math.min(Math.round(rect.bottom + gap), Math.max(sidePad, viewportH - sidePad - menuH));
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}
function closeCustomDropdown(){
  const wrap = customDropdownState.openWrap;
  const menu = customDropdownState.openMenu || (wrap ? $(".ddMenu", wrap) : null);
  if(!wrap && !menu) return;
  if(menu) menu.hidden = true;
  if(wrap && menu && menu.parentElement!==wrap){
    wrap.appendChild(menu);
    menu.style.left = "";
    menu.style.top = "";
    menu.style.width = "";
    menu.style.minWidth = "";
    menu.style.maxHeight = "";
    menu.style.visibility = "";
  }
  if(wrap) wrap.classList.remove("ddOpen");
  customDropdownState.openWrap = null;
  customDropdownState.openMenu = null;
  customDropdownState.openButton = null;
}
function setDropdownHover(wrap, index){
  const items = $$(".ddItem", wrap).filter(it=>!it.disabled);
  if(!items.length) return;
  const next = Math.max(0, Math.min(items.length - 1, Number(index || 0)));
  wrap.dataset.ddHoverIndex = String(next);
  items.forEach((item, idx)=>item.classList.toggle("ddItemHover", idx===next));
}
function refreshCustomDropdown(select){
  const wrap = select?.closest?.(".ddWrap");
  if(!wrap) return;
  const button = $(".dd", wrap);
  const menu = (customDropdownState.openWrap===wrap && customDropdownState.openMenu)
    ? customDropdownState.openMenu
    : $(".ddMenu", wrap);
  if(!button || !menu) return;
  const options = Array.from(select.options || []);
  const selectedIdx = Math.max(0, options.findIndex(o=>o.selected));
  const selectedOption = options[selectedIdx] || null;
  button.textContent = selectedOption ? selectedOption.textContent : (select.dataset.ddPlaceholder || "Select");
  button.disabled = !!select.disabled;
  menu.innerHTML = options.map((opt, idx)=>`
    <button
      type="button"
      class="ddItem ${idx===selectedIdx ? "ddItemSelected" : ""} ${escapeAttr(String(opt.className || "").trim())}"
      data-dd-value="${escapeAttr(opt.value)}"
      data-dd-idx="${idx}"
      ${opt.disabled ? "disabled" : ""}
    >${escapeHtml(opt.textContent || "")}</button>
  `).join("");
  const enabledItems = $$(".ddItem", wrap).filter(it=>!it.disabled);
  const selectedEnabledIdx = Math.max(0, enabledItems.findIndex(it=>it.classList.contains("ddItemSelected")));
  setDropdownHover(wrap, selectedEnabledIdx >= 0 ? selectedEnabledIdx : 0);
  if(customDropdownState.openWrap===wrap){
    positionOpenCustomDropdown();
  }
}
function openCustomDropdown(wrap){
  if(!wrap) return;
  if(customDropdownState.openWrap && customDropdownState.openWrap!==wrap){
    closeCustomDropdown();
  }
  const menu = $(".ddMenu", wrap);
  const button = $(".dd", wrap);
  if(!menu) return;

  // IMPORTANT: If this select is inside a <dialog>, portalling the menu to document.body
  // will place it behind the dialog (because dialogs render in the top layer).
  // So we portal to the nearest dialog instead.
  const dialog = wrap.closest("dialog");
  const portalRoot = dialog || document.body;

  if(menu.parentElement!==portalRoot){
    portalRoot.appendChild(menu);
  }

  menu.hidden = false;
  wrap.classList.add("ddOpen");
  customDropdownState.openWrap = wrap;
  customDropdownState.openMenu = menu;
  customDropdownState.openButton = button;
  positionOpenCustomDropdown();
}
function initCustomDropdowns(root=document){
  const scope = root || document;
  const selects = $$("select", scope).filter(select=>!select.closest(".ddWrap"));
  selects.forEach(select=>{
    const wrap = document.createElement("div");
    wrap.className = "ddWrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dd";
    button.setAttribute("aria-haspopup", "listbox");
    if(select.id) button.id = `${select.id}__dd`;
    const menu = document.createElement("div");
    menu.className = "ddMenu";
    menu.hidden = true;
    select.parentNode?.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(button);
    wrap.appendChild(menu);
    select.classList.add("ddNative");
    select.tabIndex = -1;
    if(select.getAttribute("disabled")!=null) button.disabled = true;
    refreshCustomDropdown(select);

    button.addEventListener("click", (ev)=>{
      ev.preventDefault();
      if(button.disabled) return;
      if(customDropdownState.openWrap===wrap){
        closeCustomDropdown();
      }else{
        openCustomDropdown(wrap);
      }
    });
    button.addEventListener("keydown", (ev)=>{
      const items = $$(".ddItem", wrap).filter(it=>!it.disabled);
      if(ev.key==="Escape"){
        closeCustomDropdown();
        return;
      }
      if(ev.key==="Enter" || ev.key===" "){
        ev.preventDefault();
        if(customDropdownState.openWrap!==wrap){
          openCustomDropdown(wrap);
          return;
        }
        const hoverIdx = Math.max(0, Math.min(items.length-1, Number(wrap.dataset.ddHoverIndex || 0)));
        const chosen = items[hoverIdx];
        if(chosen){
          chosen.click();
        }
        return;
      }
      if(ev.key==="ArrowDown" || ev.key==="ArrowUp"){
        ev.preventDefault();
        if(customDropdownState.openWrap!==wrap){
          openCustomDropdown(wrap);
        }
        if(!items.length) return;
        const dir = ev.key==="ArrowDown" ? 1 : -1;
        const curr = Number(wrap.dataset.ddHoverIndex || 0);
        setDropdownHover(wrap, curr + dir);
      }
    });
    menu.addEventListener("mousedown", (ev)=>{
      const item = ev.target.closest(".ddItem");
      if(!item || item.disabled) return;
      ev.preventDefault();
      const nextValue = String(item.dataset.ddValue ?? "");
      if(select.value !== nextValue){
        select.value = nextValue;
        select.dispatchEvent(new Event("change", {bubbles:true}));
        select.dispatchEvent(new Event("input", {bubbles:true}));
      }else{
        // still notify to keep behavior consistent for same-value picks
        select.dispatchEvent(new Event("change", {bubbles:true}));
      }
      refreshCustomDropdown(select);
      closeCustomDropdown();
      button.focus();
    });
    menu.addEventListener("mousemove", (ev)=>{
      const item = ev.target.closest(".ddItem");
      if(!item || item.disabled) return;
      const enabledItems = $$(".ddItem", wrap).filter(it=>!it.disabled);
      const idx = enabledItems.indexOf(item);
      if(idx>=0) setDropdownHover(wrap, idx);
    });
    select.addEventListener("change", ()=>refreshCustomDropdown(select));
  });

  if(customDropdownState.initialized) return;
  customDropdownState.initialized = true;
  document.addEventListener("mousedown", (ev)=>{
    const wrap = customDropdownState.openWrap;
    const menu = customDropdownState.openMenu;
    if(!wrap) return;
    if(wrap.contains(ev.target)) return;
    if(menu && menu.contains(ev.target)) return;
    closeCustomDropdown();
  });
  document.addEventListener("keydown", (ev)=>{
    if(ev.key!=="Escape") return;
    if(!customDropdownState.openWrap) return;
    closeCustomDropdown();
  });
  window.addEventListener("resize", ()=>{
    if(customDropdownState.openWrap) positionOpenCustomDropdown();
  });
  window.addEventListener("scroll", ()=>{
    if(customDropdownState.openWrap) positionOpenCustomDropdown();
  }, true);
}
function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function readPersistedStateForBackup(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return null;
  try{
    return JSON.parse(raw);
  }catch{
    return null;
  }
}
function isCompatibleBackupState(data){
  if(!data || typeof data!=="object" || Array.isArray(data)) return false;
  const compatibleKeys = ["factories","crops","barn","jobs","farm","trains","plane","helicopterOrders"];
  return compatibleKeys.some(k=>k in data);
}
function loadDashboardSettings(){
  try{
    const raw = localStorage.getItem(DASHBOARD_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const fieldPlotsCapacity = Math.max(0, Math.floor(Number(parsed?.fieldPlotsCapacity ?? 12)));
    const advisorSortByRaw = String(parsed?.advisorSortBy || "source");
    const advisorSortBy = ["source","est_time_desc","missing_qty_desc","item_az"].includes(advisorSortByRaw)
      ? advisorSortByRaw
      : "source";
    const advisorShowIngredients = parsed?.advisorShowIngredients === true;
    const rawTableSort = (parsed?.advisorTableSort && typeof parsed.advisorTableSort==="object") ? parsed.advisorTableSort : null;
    const legacyTableSort = advisorSortByRaw==="est_time_desc"
      ? {key:"est_time", dir:"desc"}
      : (advisorSortByRaw==="missing_qty_desc"
        ? {key:"short", dir:"desc"}
        : (advisorSortByRaw==="item_az"
          ? {key:"item", dir:"asc"}
          : {key:"source", dir:"asc"}));
    const advisorTableSort = {
      key: ["item","short","source","transport","est_time"].includes(String(rawTableSort?.key || ""))
        ? String(rawTableSort.key)
        : legacyTableSort.key,
      dir: String(rawTableSort?.dir || "")==="desc" ? "desc" : legacyTableSort.dir,
    };
    const advisorTransportFilter = ["all","train","plane","helicopter","ship"].includes(String(parsed?.advisorTransportFilter || "").toLowerCase())
      ? String(parsed.advisorTransportFilter).toLowerCase()
      : "all";
    const advisorIngredientMissingSortDir = String(parsed?.advisorIngredientMissingSortDir || "").toLowerCase()==="asc" ? "asc" : "desc";
    return {fieldPlotsCapacity, advisorSortBy, advisorShowIngredients, advisorTableSort, advisorTransportFilter, advisorIngredientMissingSortDir};
  }catch{
    return {
      fieldPlotsCapacity:12,
      advisorSortBy:"source",
      advisorShowIngredients:false,
      advisorTableSort:{key:"source", dir:"asc"},
      advisorTransportFilter:"all",
      advisorIngredientMissingSortDir:"desc",
    };
  }
}
function saveDashboardSettings(settings){
  localStorage.setItem(DASHBOARD_SETTINGS_KEY, JSON.stringify(settings));
}
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2200);
}

// Simple beep (works after the user has interacted at least once)
let _audioCtx = null;
function playBeep(){
  try{
    const settings = normalizeSettings(state?.settings);
    if(settings.muteSounds) return;
    const volume = Math.max(0, Math.min(100, Number(settings.soundVolume ?? 50))) / 100;
    if(volume<=0) return;
    if(!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06 * volume;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); }, 180);
  }catch{
    // ignore (browser may block audio)
  }
}

function defaultTrainRequests(){
  return Array.from({length:5}, ()=>({item:"", qty:"", done:false}));
}
function defaultTrains(){
  return [1,2,3].map(n=>({
    id:`train-${n}`,
    name:`Train ${n}`,
    returnHours:2,
    returnMinutes:0,
    status:"Idle", // Idle | Running | Ready
    endMs:null,
    notifiedComplete:false,
    requests: defaultTrainRequests(),
    checkResults: Array(5).fill(null), // null | "ready" | "missing"
  }));
}
function defaultPlaneRows(){
  return [1,2,3].map(n=>({
    id:`plane-row-${n}`,
    name:`Row ${n}`,
    slots: Array.from({length:3}, ()=>({item:"", qty:"", done:false})),
    checkResults: Array(3).fill(null),
  }));
}
function defaultHelicopterOrders(){
  return Array.from({length:9}, (_, i)=>({
    id:`heli-order-${i+1}`,
    name:`Heli ${i+1}`,
    status:"Active", // Active | Refreshing
    refreshEndMs:null,
    slots: Array.from({length:6}, ()=>({item:"", qty:""})),
    checkResults: Array(6).fill(null),
  }));
}
function defaultShips(){
  return [{
    id: "ship-1",
    name: "Ship 1",
    island: "Fructus Isle",
    status: "Idle", // Idle | Sailing | Ready
    endMs: null,
    notifiedComplete: false,
    returnHours: 4,
    returnMinutes: 0,
    returnCargo: { peach: 0, plum: 0, watermelon: 0 },
    ingotType: "Bronze",
    ingotQty: 1,
    ingotUsed: null,
  }];
}
function normalizeShips(ships){
  const arr = Array.isArray(ships) ? ships.slice(0, 1) : [];
  while(arr.length < 1) arr.push(defaultShips()[arr.length]);
  return arr.map((s, idx)=>({
    id: String(s?.id || `ship-${idx+1}`),
    name: String(s?.name || `Ship ${idx+1}`),
    island: String(s?.island || "Fructus Isle"),
    status: ["Idle","Sailing","Ready"].includes(String(s?.status || "")) ? String(s.status) : "Idle",
    endMs: Number.isFinite(Number(s?.endMs)) ? Number(s.endMs) : null,
    notifiedComplete: s?.notifiedComplete === true,
    returnHours: Math.max(0, Math.floor(Number(s?.returnHours ?? 4) || 0)),
    returnMinutes: Math.max(0, Math.min(59, Math.floor(Number(s?.returnMinutes ?? 0) || 0))),
    returnCargo: {
      peach: Math.max(0, Math.floor(Number(s?.returnCargo?.peach || 0) || 0)),
      plum: Math.max(0, Math.floor(Number(s?.returnCargo?.plum || 0) || 0)),
      watermelon: Math.max(0, Math.floor(Number(s?.returnCargo?.watermelon || 0) || 0)),
    },
    ingotType: ["Bronze","Silver","Gold","Platinum"].includes(String(s?.ingotType || "")) ? String(s.ingotType) : "Bronze",
    ingotQty: Math.max(1, Math.floor(Number(s?.ingotQty || 1) || 1)),
    ingotUsed: (s?.ingotUsed && typeof s.ingotUsed==="object" && String(s.ingotUsed.item || "").trim())
      ? {
          item: String(s.ingotUsed.item || "").trim(),
          qty: Math.max(1, Math.floor(Number(s.ingotUsed.qty || 1) || 1)),
        }
      : null,
  }));
}
function blankHelicopterOrder(index){
  const i = Number(index||0);
  return {
    id:`heli-order-${i+1}`,
    name:`Heli ${i+1}`,
    status:"Active",
    refreshEndMs:null,
    slots: Array.from({length:6}, ()=>({item:"", qty:""})),
    checkResults: Array(6).fill(null),
  };
}
function defaultPlane(){
  return {
    id:"plane-1",
    name:"Plane",
    returnHours:2,
    returnMinutes:0,
    status:"Idle", // Idle | Running | Ready
    endMs:null,
    notifiedComplete:false,
    taskHours:12,
    taskMinutes:0,
    taskStatus:"Idle", // Idle | Running | Ready
    taskEndMs:null,
    taskNotifiedComplete:false,
    taskNextHourlyNotifyMs:null,
    rows: defaultPlaneRows(),
  };
}
function defaultFarm(){
  return {
    animalBuildings: [
      {
        id: "cowshed",
        name: "Cowshed",
        product: "Milk",
        feedItem: "Cow Feed",
        durationMin: 60,
        capacity: 12,
        jobs: [],
      },
      {
        id: "chicken",
        name: "Chicken Coop",
        product: "Eggs",
        feedItem: "Chicken Feed",
        durationMin: 30,
        capacity: 8,
        jobs: [],
      },
      {
        id: "sheep",
        name: "Sheep Farm",
        product: "Wool",
        feedItem: "Sheep Feed",
        durationMin: 90,
        capacity: 6,
        jobs: [],
      }
    ]
  };
}
function normalizeFarm(farm, legacyFarms=null, legacyFarmBuildings=null){
  const base = defaultFarm();
  const src = farm || legacyFarms || {};
  let animalBuildings = Array.isArray(src?.animalBuildings) ? src.animalBuildings : [];

  // Migrate from simplified single-cowshed model.
  if(animalBuildings.length===0 && src?.cowshed){
    const c = src.cowshed;
    animalBuildings = [
      {
        id: "cowshed",
        name: "Cowshed",
        product: "Milk",
        feedItem: "Cow Feed",
        durationMin: Math.max(0, Math.floor(Number(src?.durationMin ?? 60) || 0)),
        capacity: Math.max(1, Math.floor(Number(c?.capacity ?? 12) || 12)),
        jobs: Array.isArray(c?.jobs) ? c.jobs : [],
      },
      base.animalBuildings[1],
      base.animalBuildings[2],
    ];
  }

  // Migrate from old multi-shed model into a single cowshed building capacity.
  if(animalBuildings.length===0 && Array.isArray(src?.cowsheds) && src.cowsheds.length){
    const capacity = src.cowsheds.reduce((sum, shed)=>sum + Math.max(1, Math.floor(Number(shed?.capacity ?? 1) || 1)), 0);
    animalBuildings = [
      {
        id: "cowshed",
        name: "Cowshed",
        product: String(src?.product || "Milk"),
        feedItem: String(src?.feedItem || "Cow Feed"),
        durationMin: Math.max(0, Math.floor(Number(src?.durationMin ?? 60) || 0)),
        capacity,
        jobs: [],
      },
      base.animalBuildings[1],
      base.animalBuildings[2],
    ];
  }

  // Migrate legacy farmBuildings config.
  if(animalBuildings.length===0 && legacyFarmBuildings?.cowshed){
    const legacy = legacyFarmBuildings.cowshed;
    const owned = Math.max(1, Math.floor(Number(legacy?.buildingsOwned ?? 1) || 1));
    const perBuilding = Math.max(1, Math.floor(Number(legacy?.animalsPerBuilding ?? 6) || 6));
    animalBuildings = [
      {
        id: "cowshed",
        name: "Cowshed",
        product: String(legacy?.product || "Milk"),
        feedItem: String(legacy?.feedItem || "Cow Feed"),
        durationMin: Math.max(0, Math.floor(Number(legacy?.durationMin ?? 60) || 0)),
        capacity: owned * perBuilding,
        jobs: [],
      },
      base.animalBuildings[1],
      base.animalBuildings[2],
    ];
  }

  const initial = animalBuildings.length ? animalBuildings : base.animalBuildings;
  const defaultIdByName = new Map(base.animalBuildings.map(b=>[String(b.name||"").trim().toLowerCase(), b.id]));
  const defaultIdByProduct = new Map(base.animalBuildings.map(b=>[String(b.product||"").trim().toLowerCase(), b.id]));
  const normalizedFromState = initial.map((b, idx)=>({
    id: (()=>{
      const idRaw = String(b?.id || "").trim();
      const inferred = defaultIdByName.get(String(b?.name || "").trim().toLowerCase())
        || defaultIdByProduct.get(String(b?.product || "").trim().toLowerCase())
        || `animal-${idx+1}`;
      // Stabilize legacy/generic ids to canonical default ids when possible.
      if(!idRaw) return inferred;
      if(/^animal-\d+$/i.test(idRaw) && inferred) return inferred;
      return idRaw;
    })(),
    name: String(b?.name || `Animal Building ${idx+1}`),
    product: String(b?.product || "Product"),
    feedItem: String(b?.feedItem || "Feed"),
    durationMin: Math.max(0, Math.floor(Number(b?.durationMin ?? 0) || 0)),
    capacity: Math.max(1, Math.floor(Number(b?.capacity ?? 1) || 1)),
    jobs: (Array.isArray(b?.jobs) ? b.jobs : []).map(j=>({
      id: j?.id || uid(),
      itemName: String(j?.itemName || b?.product || "Product"),
      startMs: Number.isFinite(Number(j?.startMs)) ? Number(j.startMs) : nowMs(),
      durationMin: Math.max(0, Number(j?.durationMin ?? b?.durationMin ?? 0) || 0),
      endMs: Number.isFinite(Number(j?.endMs)) ? Number(j.endMs) : (nowMs() + minsToMs(Number(j?.durationMin ?? b?.durationMin ?? 0) || 0)),
      notifiedComplete: j?.notifiedComplete === true,
    })),
  }));

  return {animalBuildings: normalizedFromState};
}
function normalizeTrain(train, idx){
  const base = defaultTrains()[idx];
  const reqs = Array.isArray(train?.requests) ? train.requests.slice(0,5) : [];
  while(reqs.length < 5) reqs.push({item:"", qty:"", done:false});
  const checkResults = Array.isArray(train?.checkResults) ? train.checkResults.slice(0,5) : [];
  while(checkResults.length < 5) checkResults.push(null);
  return {
    id: train?.id || base.id,
    name: train?.name || base.name,
    returnHours: Math.max(0, Math.floor(Number(
      train?.returnHours ?? (Number.isFinite(Number(train?.returnMin)) ? Math.floor(Number(train.returnMin)/60) : base.returnHours)
    ) || 0)),
    returnMinutes: Math.max(0, Math.min(59, Math.floor(Number(
      train?.returnMinutes ?? (Number.isFinite(Number(train?.returnMin)) ? (Number(train.returnMin)%60) : base.returnMinutes)
    ) || 0))),
    status: ["Idle","Running","Ready"].includes(train?.status) ? train.status : base.status,
    endMs: Number.isFinite(Number(train?.endMs)) ? Number(train.endMs) : null,
    notifiedComplete: train?.notifiedComplete === true,
    requests: reqs.map(r=>({
      item: String(r?.item ?? "").trimStart(),
      qty: r?.qty === "" ? "" : Number(r?.qty || 0),
      done: r?.done === true,
    })),
    checkResults: checkResults.map(v=> (v==="ready" || v==="missing") ? v : null),
  };
}
function normalizeTrains(trains){
  const arr = Array.isArray(trains) ? trains : [];
  return defaultTrains().map((base, idx)=>{
    const byId = arr.find(t=>t?.id===base.id);
    const byName = arr.find(t=>t?.name===base.name);
    return normalizeTrain(byId || byName || arr[idx] || base, idx);
  });
}
function normalizePlane(plane){
  const base = defaultPlane();
  const inputRows = Array.isArray(plane?.rows) ? plane.rows : [];
  const legacyCrates = Array.isArray(plane?.crates) ? plane.crates : [];
  const rows = base.rows.map((baseRow, idx)=>{
    const src = inputRows[idx]
      || inputRows.find(r=>r?.id===baseRow.id)
      || legacyCrates[idx]
      || legacyCrates.find(c=>c?.id===`plane-crate-${idx+1}`)
      || {};
    const rawSlots = Array.isArray(src?.slots) ? src.slots : (Array.isArray(src?.requests) ? src.requests : []);
    const slots = rawSlots.slice(0,3);
    while(slots.length < 3) slots.push({item:"", qty:"", done:false});
    const checkResults = Array.isArray(src?.checkResults) ? src.checkResults.slice(0,3) : [];
    while(checkResults.length < 3) checkResults.push(null);
    return {
      id: src?.id || baseRow.id,
      name: src?.name || baseRow.name,
      slots: slots.map(r=>({
        item: String(r?.item ?? "").trimStart(),
        qty: r?.qty === "" ? "" : Number(r?.qty || 0),
        done: r?.done === true,
      })),
      checkResults: checkResults.map(v=> (v==="ready" || v==="missing") ? v : null),
    };
  });

  return {
    id: plane?.id || base.id,
    name: plane?.name || base.name,
    returnHours: Math.max(0, Math.floor(Number(
      plane?.returnHours ?? (Number.isFinite(Number(plane?.returnMin)) ? Math.floor(Number(plane.returnMin)/60) : base.returnHours)
    ) || 0)),
    returnMinutes: Math.max(0, Math.min(59, Math.floor(Number(
      plane?.returnMinutes ?? (Number.isFinite(Number(plane?.returnMin)) ? (Number(plane.returnMin)%60) : base.returnMinutes)
    ) || 0))),
    status: ["Idle","Running","Ready"].includes(plane?.status) ? plane.status : base.status,
    endMs: Number.isFinite(Number(plane?.endMs)) ? Number(plane.endMs) : null,
    notifiedComplete: plane?.notifiedComplete === true,
    taskHours: Math.max(0, Math.floor(Number(plane?.taskHours ?? base.taskHours) || 0)),
    taskMinutes: Math.max(0, Math.min(59, Math.floor(Number(plane?.taskMinutes ?? base.taskMinutes) || 0))),
    taskStatus: ["Idle","Running","Ready"].includes(plane?.taskStatus) ? plane.taskStatus : base.taskStatus,
    taskEndMs: Number.isFinite(Number(plane?.taskEndMs)) ? Number(plane.taskEndMs) : null,
    taskNotifiedComplete: plane?.taskNotifiedComplete === true,
    taskNextHourlyNotifyMs: Number.isFinite(Number(plane?.taskNextHourlyNotifyMs)) ? Number(plane.taskNextHourlyNotifyMs) : null,
    rows,
  };
}
function applyPlaneRowMirror(plane){
  if(!plane || !Array.isArray(plane.rows) || plane.rows.length < 3) return false;
  const source = plane.rows[0];
  if(!source || !Array.isArray(source.slots)) return false;
  let changed = false;
  [1,2].forEach(targetIdx=>{
    const target = plane.rows[targetIdx];
    if(!target) return;
    const targetSlots = Array.isArray(target.slots) ? target.slots : [];
    const nextSlots = source.slots.map((s, slotIdx)=>({
      item: String(s?.item ?? ""),
      qty: s?.qty === "" ? "" : Number(s?.qty || 0),
      done: targetSlots[slotIdx]?.done === true,
    }));
    const prev = JSON.stringify(target.slots || []);
    const next = JSON.stringify(nextSlots);
    if(prev !== next){
      target.slots = nextSlots;
      changed = true;
    }
  });
  return changed;
}
function normalizeHelicopterOrders(orders){
  const base = defaultHelicopterOrders();
  const arr = Array.isArray(orders) ? orders : [];
  return base.map((baseOrder, idx)=>{
    const src = arr[idx] || {};
    const slotsRaw = Array.isArray(src?.slots) ? src.slots.slice(0,6) : [];
    while(slotsRaw.length < 6) slotsRaw.push({item:"", qty:""});
    const checkResults = Array.isArray(src?.checkResults) ? src.checkResults.slice(0,6) : [];
    while(checkResults.length < 6) checkResults.push(null);
    return {
      id: baseOrder.id,
      name: baseOrder.name,
      status: ["Active","Refreshing"].includes(src?.status) ? src.status : baseOrder.status,
      refreshEndMs: Number.isFinite(Number(src?.refreshEndMs)) ? Number(src.refreshEndMs) : null,
      slots: slotsRaw.map(s=>({
        item: String(s?.item ?? "").trimStart(),
        qty: s?.qty === "" ? "" : Number(s?.qty || 0),
      })),
      checkResults: checkResults.map(v=> (v==="ready" || v==="missing") ? v : null),
    };
  });
}

function normalizeJobs(jobs){
  const arr = Array.isArray(jobs) ? jobs : [];
  return arr.map(j=>{
    const startMs = Number.isFinite(Number(j?.startMs)) ? Number(j.startMs) : null;
    const endMs = Number.isFinite(Number(j?.endMs)) ? Number(j.endMs) : null;
    const durationSeconds = Number.isFinite(Number(j?.durationSeconds))
      ? Math.max(0, Math.round(Number(j.durationSeconds)))
      : (
        Number.isFinite(Number(j?.durationMin))
          ? Math.max(0, Math.round(Number(j.durationMin) * 60))
          : (
            startMs != null && endMs != null && endMs >= startMs
              ? Math.max(0, Math.round((endMs - startMs) / 1000))
              : 0
          )
      );
    return {
      ...j,
      durationSeconds,
      durationMin: Number.isFinite(Number(j?.durationMin)) ? Math.max(0, Number(j.durationMin)) : (durationSeconds / 60),
      outputQty: Math.max(1, Math.floor(Number(j?.outputQty || 1))),
      notifiedComplete: j?.notifiedComplete === true,
    };
  });
}
function normalizeReservations(reservations){
  const arr = Array.isArray(reservations) ? reservations : [];
  return arr
    .map(r=>({
      id: String(r?.id || uid()),
      jobId: String(r?.jobId || ""),
      factoryId: String(r?.factoryId || ""),
      factoryName: String(r?.factoryName || ""),
      slotIndex: Number.isFinite(Number(r?.slotIndex)) ? Number(r.slotIndex) : null,
      status: (r?.status === "consumed" || r?.status === "released") ? String(r.status) : "reserved",
      createdMs: Number.isFinite(Number(r?.createdMs)) ? Number(r.createdMs) : nowMs(),
      ingredients: (Array.isArray(r?.ingredients) ? r.ingredients : [])
        .map(inp=>({
          item: String(inp?.item || "").trim(),
          qty: Math.max(0, Math.floor(Number(inp?.qty || 0))),
        }))
        .filter(inp=>inp.item && inp.qty > 0),
    }))
    .filter(r=>r.jobId && r.ingredients.length);
}
function normalizeOpsRecent(opsRecent){
  const arr = Array.isArray(opsRecent) ? opsRecent : [];
  return arr
    .map(e=>({
      ts: Number.isFinite(Number(e?.ts)) ? Number(e.ts) : nowMs(),
      source: String(e?.source || "System"),
      item: String(e?.item || ""),
      qty: Math.max(0, Math.floor(Number(e?.qty || 0))),
      status: String(e?.status || "Completed"),
    }))
    .filter(e=>e.source || e.item)
    .slice(-80);
}
function normalizeSettings(settings){
  const rawPriority = (settings?.inventoryPriority && typeof settings.inventoryPriority==="object")
    ? settings.inventoryPriority
    : {};
  const pinnedItems = Array.from(new Set(
    (Array.isArray(rawPriority.pinnedItems) ? rawPriority.pinnedItems : [])
      .map(v=>String(v || "").trim().toLowerCase())
      .filter(Boolean)
  ));
  const view = rawPriority.view === "priority" ? "priority" : "all";
  const rawSoundVolume = Number(settings?.soundVolume);
  const soundVolume = Number.isFinite(rawSoundVolume) ? rawSoundVolume : 50;
  const boosters = normalizeBoosters(settings?.boosters);
  const boosterExpiry = normalizeBoosterExpiry(settings?.boosterExpiry);
  const transportPriority = ["none","trains","plane","helicopter","ships"].includes(String(settings?.transportPriority || "").toLowerCase())
    ? String(settings.transportPriority).toLowerCase()
    : "none";
  const rawPriorityOverride = (settings?.priorityOverride && typeof settings.priorityOverride==="object")
    ? settings.priorityOverride
    : {};
  const priorityOverrideKey = String(rawPriorityOverride.key || "").trim();
  const priorityOverrideExpiresMs = Number(rawPriorityOverride.expiresMs);
  const priorityOverride = (
    priorityOverrideKey &&
    Number.isFinite(priorityOverrideExpiresMs) &&
    priorityOverrideExpiresMs > 0
  )
    ? { key: priorityOverrideKey, expiresMs: priorityOverrideExpiresMs }
    : { key: "", expiresMs: 0 };
  return {
    fieldPlots: Math.max(1, Math.floor(Number(settings?.fieldPlots ?? 12) || 12)),
    gameLevel: Math.max(1, Math.floor(Number(settings?.gameLevel ?? 1) || 1)),
    compactMode: settings?.compactMode === true,
    timeFormat: settings?.timeFormat === "minutes" ? "minutes" : "hms",
    muteSounds: settings?.muteSounds === true,
    soundVolume: Math.max(0, Math.min(100, Math.floor(soundVolume))),
    inventoryPriority: {view, pinnedItems},
    transportPriority,
    priorityOverride,
    boosters,
    boosterExpiry,
  };
}
function defaultPlan(){
  return {
    goals: {trains:3, planes:1, helicopters:10},
    progress: {trainsSent:0, planesSent:0, heliOrdersDone:0},
    lastResetKey: "",
  };
}
function normalizePlan(plan){
  const base = defaultPlan();
  return {
    goals: {
      trains: Math.max(0, Math.floor(Number(plan?.goals?.trains ?? base.goals.trains) || 0)),
      planes: Math.max(0, Math.floor(Number(plan?.goals?.planes ?? base.goals.planes) || 0)),
      helicopters: Math.max(0, Math.floor(Number(plan?.goals?.helicopters ?? base.goals.helicopters) || 0)),
    },
    progress: {
      trainsSent: Math.max(0, Math.floor(Number(plan?.progress?.trainsSent ?? base.progress.trainsSent) || 0)),
      planesSent: Math.max(0, Math.floor(Number(plan?.progress?.planesSent ?? base.progress.planesSent) || 0)),
      heliOrdersDone: Math.max(0, Math.floor(Number(plan?.progress?.heliOrdersDone ?? base.progress.heliOrdersDone) || 0)),
    },
    lastResetKey: String(plan?.lastResetKey || ""),
  };
}
function getLondonNowParts(date = new Date()){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type)=>parts.find(p=>p.type===type)?.value || "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
  };
}
function getPlanDayKey(date = new Date()){
  const p = getLondonNowParts(date);
  const yyyy = String(p.year).padStart(4, "0");
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  if(p.hour >= 6) return `${yyyy}-${mm}-${dd}`;
  const utcMidnight = new Date(Date.UTC(p.year, Math.max(0, p.month - 1), p.day));
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - 1);
  return `${String(utcMidnight.getUTCFullYear()).padStart(4, "0")}-${String(utcMidnight.getUTCMonth()+1).padStart(2, "0")}-${String(utcMidnight.getUTCDate()).padStart(2, "0")}`;
}
function ensurePlanDayBoundary(persist=true){
  state.plan = normalizePlan(state.plan);
  const dayKey = getPlanDayKey();
  if(state.plan.lastResetKey === dayKey) return false;
  state.plan.progress = {trainsSent:0, planesSent:0, heliOrdersDone:0};
  state.plan.lastResetKey = dayKey;
  if(persist) save();
  return true;
}
function incrementPlanProgress(field, delta=1){
  state.plan = normalizePlan(state.plan);
  ensurePlanDayBoundary(false);
  const next = Math.max(0, Math.floor(Number(state.plan.progress?.[field] || 0) + Number(delta || 0)));
  state.plan.progress[field] = next;
  save();
}
function getTimeFormat(){
  return normalizeSettings(state?.settings).timeFormat;
}
function formatMinutesDisplay(totalSec){
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  if(sec < 60) return `${sec}s`;
  const mins = Math.round((sec / 60) * 10) / 10;
  const asInt = Math.round(mins);
  return Math.abs(mins - asInt) < 0.001 ? `${asInt}m` : `${mins.toFixed(1)}m`;
}
function formatDurationSeconds(totalSec){
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  if(getTimeFormat()==="minutes"){
    return formatMinutesDisplay(sec);
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if(h > 0) return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  if(m > 0) return `${m}m ${String(s).padStart(2,"0")}s`;
  return `${s}s`;
}
function applyUiPreferences(){
  const settings = normalizeSettings(state?.settings);
  state.settings = settings;
  document.body.classList.toggle("compact-mode", settings.compactMode === true);
}
function pushOpsRecent(entry){
  state.opsRecent = normalizeOpsRecent(state.opsRecent);
  state.opsRecent.push({
    ts: nowMs(),
    source: String(entry?.source || "System"),
    item: String(entry?.item || ""),
    qty: Math.max(0, Math.floor(Number(entry?.qty || 0))),
    status: String(entry?.status || "Completed"),
  });
  // normalizeOpsRecent trims to 80 entries on next call; trim eagerly here too.
  if(state.opsRecent.length > 80){
    state.opsRecent = state.opsRecent.slice(-80);
  }
}

const defaultData = () => ({
  crops: [
    {id: uid(), name:"Wheat", durationMin:2, qtyDefault:1},
    {id: uid(), name:"Corn", durationMin:5, qtyDefault:1},
    {id: uid(), name:"Carrots", durationMin:10, qtyDefault:1},
    {id: uid(), name:"Sugarcane", durationMin:20, qtyDefault:1},
    {id: uid(), name:"Strawberries", durationMin:45, qtyDefault:1},
    {id: uid(), name:"Pine Trees", durationMin:60, qtyDefault:1},
  ],
  factories: [
    {id: uid(), name:"Dairy Factory", speedBonusPct:0, products:[
      {id: uid(), name:"Cream", durationMin:15},
      {id: uid(), name:"Cheese", durationMin:30, xp:5},
      {id: uid(), name:"Butter", durationMin:45, xp:6},
    ]},
    {id: uid(), name:"Bakery", speedBonusPct:0, products:[
      {id: uid(), name:"Bread", durationMin:30, xp:6},
      {id: uid(), name:"Cookie", durationMin:60, xp:7},
    ]},
    {id: uid(), name:"Feed Mill", speedBonusPct:0, products:[
      {
        id: uid(),
        name:"Cow Feed",
        durationMin:15,
        outputQty:3,
        inputs:[
          { item:"Corn", qty:2 },
          { item:"Carrot", qty:1 },
        ]
      },
      {
        id: uid(),
        name:"Chicken Feed",
        durationMin:15,
        outputQty:3,
        inputs:[
          { item:"Corn", qty:2 },
          { item:"Wheat", qty:1 },
        ]
      },
      {
        id: uid(),
        name:"Sheep Feed",
        durationMin:20,
        outputQty:3,
        inputs:[
          { item:"Wheat", qty:2 },
          { item:"Corn", qty:1 },
        ]
      },
    ]},
  ],
  barn: [
    // {id, name, category: "Crops"|"Products"|"Materials", qty}
  ],
  transport: [
    // {id, mode:"Train"|"Helicopter"|"Airplane"|"Islands", status:"Pending"|"In Progress"|"Ready"|"Completed", etaMin, notes, requests:[{id,name,qty}]}
  ],
  trains: defaultTrains(),
  plane: defaultPlane(),
  helicopterOrders: defaultHelicopterOrders(),
  ships: defaultShips(),
  farm: defaultFarm(),
  opsRecent: [],
  settings: normalizeSettings(null),
  plan: normalizePlan(null),
  reservations: [],
  jobs: [
    // {id, type:"Crop"|"Factory"|"Transport", sourceName, itemName, qty, outputQty, startMs, durationMin, durationSeconds, endMs, status:"In Progress"|"Ready"|"Collected"}
  ]
});

function normalizeFactories(factories){
  const arr = Array.isArray(factories) ? factories : [];
  const normalized = arr.map((f, idx)=>({
    ...f,
    id: String(f?.id || uid()),
    name: String(f?.name || `Factory ${idx+1}`),
    speedBonusPct: clampFactorySpeedBonusPct(f?.speedBonusPct ?? 0),
    products: (Array.isArray(f?.products) ? f.products : []).map(p=>({
      ...p,
      id: String(p?.id || uid()),
      name: String(p?.name || "Product"),
      durationMin: Math.max(0, Number(p?.durationMin || 0)),
      outputQty: getProductOutputQty(f, p),
      inputs: Array.isArray(p?.inputs) ? p.inputs : [],
    })),
  }));

  const hasFeedMill = normalized.some(f=>String(f?.name || "").trim().toLowerCase()==="feed mill");
  if(!hasFeedMill){
    normalized.push({
      id: uid(),
      name:"Feed Mill",
      speedBonusPct:0,
      products:[
        {id: uid(), name:"Cow Feed", durationMin:15, outputQty:3},
        {id: uid(), name:"Chicken Feed", durationMin:15, outputQty:3},
        {id: uid(), name:"Sheep Feed", durationMin:20, outputQty:3},
      ],
    });
  }
  return normalized;
}

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultData();
    const data = JSON.parse(raw);
    // basic migration safety
    const merged = Object.assign(defaultData(), data);
    merged.jobs = normalizeJobs(merged.jobs);
    merged.opsRecent = normalizeOpsRecent(merged.opsRecent);
    merged.reservations = normalizeReservations(merged.reservations);
    merged.factories = normalizeFactories(merged.factories);
    merged.trains = normalizeTrains(merged.trains);
    merged.plane = normalizePlane(merged.plane);
    merged.helicopterOrders = normalizeHelicopterOrders(merged.helicopterOrders);
    merged.ships = normalizeShips(merged.ships);
    merged.farm = normalizeFarm(merged.farm, merged.farms, merged.farmBuildings);
    merged.settings = normalizeSettings(merged.settings);
    merged.plan = normalizePlan(merged.plan);
    // Migrate legacy farm timers from global jobs into farm.animalBuildings jobs.
    const legacyFarmJobs = (merged.jobs || []).filter(j=>j?.type==="Farm" && j?.status==="In Progress");
    if(legacyFarmJobs.length){
      const byProduct = new Map((merged.farm?.animalBuildings || []).map(b=>[String(b.product||"").toLowerCase(), b]));
      legacyFarmJobs.forEach(j=>{
        const key = String(j?.itemName || "").toLowerCase();
        const target = byProduct.get(key) || merged.farm.animalBuildings[0];
        target.jobs = target.jobs || [];
        target.jobs.push({
          id: j.id || uid(),
          itemName: String(j.itemName || target.product || "Milk"),
          startMs: Number.isFinite(Number(j.startMs)) ? Number(j.startMs) : nowMs(),
          durationMin: Math.max(0, Number(j.durationMin || target.durationMin || 0)),
          endMs: Number.isFinite(Number(j.endMs)) ? Number(j.endMs) : (nowMs() + minsToMs(Number(j.durationMin || target.durationMin || 0))),
          notifiedComplete: j?.notifiedComplete === true,
        });
      });
      merged.jobs = merged.jobs.filter(j=>j?.type!=="Farm");
    }
    return merged;
  }catch{
    return defaultData();
  }
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
let state = load();
state.reservations = normalizeReservations(state.reservations);
ensurePlanDayBoundary();
ensureBoosterExpiryState();

/* Jobs ticking */
function updateJobStatuses(){
  const t = nowMs();
  const boosters = normalizeSettings(state.settings).boosters || defaultBoosters();
  const cropYieldMult = boosters.superHarvest?.enabled ? 2 : 1;
  let changed = false;
  let completionBeeps = 0;
  let becameReady = 0;
  let factoryCompleted = 0;
  let cropsAutoCollected = 0;
  let farmCompleted = 0;
  let trainsReady = 0;
  let planesReady = 0;
  let shipsReady = 0;
  const completedFactoryJobIds = [];
  const completedCropJobIds = [];

  // Promote scheduled queued jobs (used for non-factory timers that set a startMs)
  state.jobs.forEach(j=>{
    if(j.status === "Queued" && j.type !== "Factory" && j.startMs != null && t >= j.startMs){
      j.status = "In Progress";
      changed = true;
    }
  });

  // Handle completions
  state.jobs.forEach(j=>{
    if(j.status !== "In Progress") return;
    if(j.endMs == null) return;
    if(t < j.endMs) return;

    if(j.type === "Factory"){
      consumeReservation(j.id);
      // Auto-add to Barn and remove from view
      if(j.notifiedComplete !== true){
        j.notifiedComplete = true;
        completionBeeps++;
      }
      const jobCount = Math.max(1, Math.floor(Number(j?.qty || 1)));
      const outputPerJob = Math.max(1, Math.floor(Number(j?.outputQty || 1)));
      const totalOutput = jobCount * outputPerJob;
      upsertBarnItem(j.itemName, "Products", totalOutput);
      pushOpsRecent({
        source: j.sourceName || "Factory",
        item: j.itemName || "Product",
        qty: totalOutput,
        status: "Completed",
      });
      completedFactoryJobIds.push(j.id);
      factoryCompleted++;
      changed = true;
      return;
    }

    // Crop timers auto-collect into Barn, then disappear.
    if(j.type === "Crop"){
      if(j.notifiedComplete !== true){
        j.notifiedComplete = true;
        completionBeeps++;
      }
      const cropQty = Math.max(1, Math.floor(Number(j.qty || 1))) * cropYieldMult;
      upsertBarnItem(j.itemName, "Crops", cropQty);
      pushOpsRecent({
        source: "Field",
        item: j.itemName || "Crop",
        qty: cropQty,
        status: "Ready",
      });
      completedCropJobIds.push(j.id);
      cropsAutoCollected++;
      changed = true;
      return;
    }
    // Transport/etc become Ready
    if(j.notifiedComplete !== true){
      j.notifiedComplete = true;
      completionBeeps++;
    }
    j.status = "Ready";
    becameReady++;
    changed = true;
  });

  // Migrate any legacy crop jobs that were already Ready.
  state.jobs.forEach(j=>{
    if(j.type !== "Crop" || j.status !== "Ready") return;
    if(j.notifiedComplete !== true){
      j.notifiedComplete = true;
      completionBeeps++;
    }
    const cropQty = Math.max(1, Math.floor(Number(j.qty || 1))) * cropYieldMult;
    upsertBarnItem(j.itemName, "Crops", cropQty);
    completedCropJobIds.push(j.id);
    cropsAutoCollected++;
    changed = true;
  });

  if(completedFactoryJobIds.length){
    const completedFactoryJobIdSet = new Set(completedFactoryJobIds);
    state.jobs = state.jobs.filter(j => !completedFactoryJobIdSet.has(j.id));
  }
  if(completedCropJobIds.length){
    const completedCropJobIdSet = new Set(completedCropJobIds);
    state.jobs = state.jobs.filter(j => !completedCropJobIdSet.has(j.id));
  }
  // Farm building timers (owned by state.farm.animalBuildings[].jobs).
  const farmBuildings = Array.isArray(state.farm?.animalBuildings) ? state.farm.animalBuildings : [];
  farmBuildings.forEach(building=>{
    const jobs = Array.isArray(building?.jobs) ? building.jobs : [];
    if(!jobs.length) return;
    const pending = [];
    jobs.forEach(j=>{
      if(!Number.isFinite(Number(j?.endMs)) || t < Number(j.endMs)){
        pending.push(j);
        return;
      }
      if(j.notifiedComplete !== true){
        j.notifiedComplete = true;
        completionBeeps++;
      }
      const farmQty = Math.max(1, getFarmEffectiveOutputPerAnimal(building, state.settings));
      upsertBarnItem(building.product || "Milk", "Products", farmQty);
      pushOpsRecent({
        source: building.name || "Animal Building",
        item: building.product || "Product",
        qty: farmQty,
        status: "Ready",
      });
      farmCompleted++;
      changed = true;
    });
    building.jobs = pending;
  });

  // Factory-wide strict FIFO queue with configurable running slots.
  const foundrySourceNames = new Set(
    (state.factories || [])
      .filter(f=>isFoundryFactory(f))
      .map(f=>String(f?.name || ""))
  );
  if(foundrySourceNames.size){
    const before = state.jobs.length;
    state.jobs = state.jobs.filter(j=>!(j.type==="Factory" && j.status==="Queued" && foundrySourceNames.has(String(j.sourceName || ""))));
    if(state.jobs.length !== before){
      changed = true;
    }
  }
  const factoryNames = Array.from(new Set(state.jobs.filter(j=>j.type==="Factory").map(j=>j.sourceName)));
  factoryNames.forEach(factoryName=>{
    const factorySlots = getFactoryRunningSlotsByName(factoryName, state.settings);
    let running = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===factoryName && j.status==="In Progress").length;
    if(running >= factorySlots) return;

    const queued = state.jobs
      .filter(j=>j.type==="Factory" && j.sourceName===factoryName && j.status==="Queued")
      .sort((a,b)=>(a.createdMs||0)-(b.createdMs||0));

    while(running < factorySlots && queued.length){
      const next = queued.shift();
      if(!next) break;
      next.status = "In Progress";
      next.startMs = t;
      const nextDurationSec = Number.isFinite(Number(next?.durationSeconds))
        ? Math.max(0, Number(next.durationSeconds))
        : Math.max(0, Number(next?.durationMin || 0) * 60);
      next.endMs = t + (nextDurationSec * 1000);
      running += 1;
      changed = true;
    }
  });

  // Train return timers
  (state.trains || []).forEach(train=>{
    if(train.status !== "Running") return;
    if(train.endMs == null) return;
    if(t < train.endMs) return;
    if(train.notifiedComplete !== true){
      train.notifiedComplete = true;
      completionBeeps++;
    }
    train.status = "Ready";
    train.endMs = null;
    trainsReady++;
    changed = true;
  });

  // Plane return timer
  const plane = state.plane;
  if(plane && plane.status === "Running" && plane.endMs != null && t >= plane.endMs){
    if(plane.notifiedComplete !== true){
      plane.notifiedComplete = true;
      completionBeeps++;
    }
    plane.status = "Ready";
    plane.endMs = null;
    planesReady++;
    changed = true;
  }

  // Plane task expiry timer (separate from return timer)
  if(plane){
    if(plane.taskStatus === "Running" && plane.taskEndMs != null){
      const taskEndMs = Number(plane.taskEndMs);
      const nextNotifyMs = Number(plane.taskNextHourlyNotifyMs);

      if(Number.isFinite(nextNotifyMs) && t >= nextNotifyMs && t < taskEndMs){
        playBeep();
        openModal({
          title: "Plane Task Timer",
          bodyHtml: `<div>Plane — ${escapeHtml(fmtCountdown(taskEndMs))} left</div>`,
          primaryText: "OK",
          onSave: ()=>{},
        });
        let next = nextNotifyMs;
        while(Number.isFinite(next) && next <= t){
          next += (60 * 60 * 1000);
        }
        plane.taskNextHourlyNotifyMs = next;
        changed = true;
      }

      if(t >= taskEndMs){
        plane.taskStatus = "Ready";
        plane.taskEndMs = null;
        plane.taskNextHourlyNotifyMs = null;
        plane.taskNotifiedComplete = true;
        changed = true;
      }
    }
  }

  // Ship return timers
  (state.ships || []).forEach(ship=>{
    if(ship.status !== "Sailing") return;
    if(ship.endMs == null) return;
    if(t < ship.endMs) return;
    if(ship.notifiedComplete !== true){
      ship.notifiedComplete = true;
      completionBeeps++;
    }
    ship.status = "Ready";
    ship.endMs = null;
    shipsReady++;
    changed = true;
  });

  // Helicopter dump refresh timers
  (state.helicopterOrders || []).forEach(order=>{
    if(order.status!=="Refreshing") return;
    if(order.refreshEndMs == null) return;
    if(t < order.refreshEndMs) return;
    order.status = "Active";
    order.refreshEndMs = null;
    order.slots = Array.from({length:6}, ()=>({item:"", qty:""}));
    order.checkResults = Array(6).fill(null);
    changed = true;
  });

  if(changed){
    save();
    if(completionBeeps > 0) playBeep();
  }
  return {changed};
}

function upsertBarnItem(name, category, deltaQty){
  const n = (name||"").trim();
  if(!n) return;
  const cat = category || "Products";
  let item = state.barn.find(b => b.name.toLowerCase()===n.toLowerCase() && b.category===cat);
  if(!item){
    item = {id: uid(), name:n, category:cat, qty:0};
    state.barn.push(item);
  }
  item.qty = Math.max(0, Number(item.qty||0) + Number(deltaQty||0));
  save();
}
function buildBarnActualQtyMap(){
  const barnMap = new Map();
  (state.barn || []).forEach(b=>{
    const key = normalizeItemKey(b?.name);
    if(!key) return;
    const qty = Math.max(0, Number(b?.qty || 0));
    barnMap.set(key, Number(barnMap.get(key) || 0) + qty);
  });
  return barnMap;
}
function getReservedMap(){
  state.reservations = normalizeReservations(state.reservations);
  const m = new Map();
  (state.reservations || []).forEach(r=>{
    if(r?.status !== "reserved") return;
    (r.ingredients || []).forEach(inp=>{
      const key = normalizeItemKey(inp?.item);
      if(!key) return;
      const qty = Math.max(0, Math.floor(Number(inp?.qty || 0)));
      if(qty<=0) return;
      m.set(key, Number(m.get(key) || 0) + qty);
    });
  });
  return m;
}
function buildAvailableBarnQtyMap(){
  const actual = buildBarnActualQtyMap();
  const reserved = getReservedMap();
  const out = new Map();
  actual.forEach((qty, key)=>{
    out.set(key, Math.max(0, Number(qty || 0) - Number(reserved.get(key) || 0)));
  });
  return out;
}
function getAvailableQty(itemName, barnMap=null){
  const key = normalizeItemKey(itemName);
  if(!key) return 0;
  if(barnMap) return Number(barnMap.get(key) || 0);
  return Number(buildAvailableBarnQtyMap().get(key) || 0);
}
function getReservationByJobId(jobId){
  const id = String(jobId || "");
  if(!id) return null;
  state.reservations = normalizeReservations(state.reservations);
  return (state.reservations || []).find(r=>String(r?.jobId || "")===id && r?.status==="reserved") || null;
}
function releaseReservation(jobId){
  const id = String(jobId || "");
  if(!id) return false;
  const before = (state.reservations || []).length;
  state.reservations = normalizeReservations(state.reservations).filter(r=>!(String(r?.jobId || "")===id && r?.status==="reserved"));
  return state.reservations.length !== before;
}
function consumeReservation(jobId){
  const reservation = getReservationByJobId(jobId);
  if(!reservation) return false;
  const actualMap = buildBarnActualQtyMap();
  const reqs = (reservation.ingredients || []).map(inp=>({
    item: String(inp?.item || "").trim(),
    qty: Math.max(0, Math.floor(Number(inp?.qty || 0))),
    key: normalizeItemKey(inp?.item),
  })).filter(inp=>inp.item && inp.key && inp.qty>0);
  const missing = reqs.filter(inp=>Number(actualMap.get(inp.key) || 0) < inp.qty);
  if(missing.length){
    releaseReservation(jobId);
    return false;
  }
  reqs.forEach(inp=>{
    let remaining = inp.qty;
    for(const b of (state.barn || [])){
      if(remaining<=0) break;
      if(normalizeItemKey(b?.name)!==inp.key) continue;
      const available = Math.max(0, Number(b?.qty || 0));
      const take = Math.min(available, remaining);
      if(take<=0) continue;
      b.qty = available - take;
      remaining -= take;
    }
  });
  releaseReservation(jobId);
  return true;
}
function reserveIngredientsForFactoryJob(job, ingredients, meta={}){
  if(!job || !job.id) return {ok:false, reason:"job"};
  const normalizedInputs = (Array.isArray(ingredients) ? ingredients : [])
    .map(inp=>({
      item: String(inp?.item || "").trim(),
      qty: Math.max(1, Math.floor(Number(inp?.qty || 1) || 1)),
    }))
    .filter(inp=>inp.item && inp.qty > 0);
  if(!normalizedInputs.length) return {ok:true};
  if(getReservationByJobId(job.id)) return {ok:true};
  const availMap = buildAvailableBarnQtyMap();
  const checks = normalizedInputs.map(inp=>{
    const availableQty = Number(availMap.get(normalizeItemKey(inp.item)) || 0);
    const short = Math.max(0, inp.qty - availableQty);
    return {...inp, availableQty, short};
  });
  const missing = checks.filter(c=>c.short > 0);
  if(missing.length){
    return {ok:false, reason:"missing", missing};
  }
  state.reservations = normalizeReservations(state.reservations);
  state.reservations.push({
    id: uid(),
    jobId: String(job.id),
    factoryId: String(meta?.factoryId || ""),
    factoryName: String(job.sourceName || meta?.factoryName || ""),
    slotIndex: Number.isFinite(Number(meta?.slotIndex)) ? Number(meta.slotIndex) : null,
    status: "reserved",
    createdMs: nowMs(),
    ingredients: normalizedInputs,
  });
  return {ok:true};
}

function collectJob(jobId){
  const j = state.jobs.find(x=>x.id===jobId);
  if(!j || j.status!=="Ready") return;
  const category = j.type === "Crop" ? "Crops" : "Products";
  const totalQty = j.type==="Factory"
    ? (Math.max(1, Math.floor(Number(j?.qty || 1))) * Math.max(1, Math.floor(Number(j?.outputQty || 1))))
    : Math.max(1, Math.floor(Number(j?.qty || 1)));
  upsertBarnItem(j.itemName, category, totalQty);
  j.status = "Collected";
  save();
  toast(`Collected ${totalQty} × ${j.itemName} → Inventory`);
  render();
}
function collectAllReady(){
  const ready = state.jobs.filter(j=>j.status==="Ready");
  if(ready.length===0){ toast("Nothing ready right now."); return; }
  ready.forEach(j=>collectJob(j.id));
  render();
}

function createJob({type, sourceName, itemName, qty=1, durationMin, durationSeconds=null, startMs=null}){
  const now = nowMs();
  const startCandidate = (startMs==null) ? now : Number(startMs);
  const s = Number.isFinite(startCandidate) ? startCandidate : now;
  const durationFromSeconds = Number.isFinite(Number(durationSeconds)) ? Math.round(Number(durationSeconds)) : NaN;
  const durationFromMinutes = Math.round(Number(durationMin || 0) * 60);
  let jobDurationSeconds = Number.isFinite(durationFromSeconds) ? durationFromSeconds : durationFromMinutes;
  if(type==="Crop" && !(jobDurationSeconds > 0)){
    const fallback = Number.isFinite(durationFromMinutes) ? durationFromMinutes : 0;
    jobDurationSeconds = fallback > 0 ? fallback : 1;
  }
  if(!Number.isFinite(jobDurationSeconds) || jobDurationSeconds < 0){
    jobDurationSeconds = 0;
  }
  if(type==="Crop") jobDurationSeconds = Math.max(1, Math.round(jobDurationSeconds));
  const endMsRaw = s + (jobDurationSeconds * 1000);
  const endMs = (type==="Crop" && endMsRaw <= s) ? (s + 1000) : endMsRaw;
  const status = (s > nowMs()) ? "Queued" : "In Progress";
  const job = {
    id: uid(),
    type,
    sourceName,
    itemName,
    qty:Number(qty||1),
    startMs:s,
    durationMin: jobDurationSeconds / 60,
    durationSeconds: jobDurationSeconds,
    endMs,
    status,
    notifiedComplete:false,
  };
  state.jobs.push(job);
  save();
  toast(status==="Queued" ? `Queued: ${job.qty} × ${itemName}` : `Started: ${job.qty} × ${itemName}`);
}

function createFactoryJob({factoryName, productName, durationMin, durationSeconds=null, qty=1, outputQty=1, allowQueue=true}){
  // Factory-wide mixed queue with strict FIFO and configurable running slots.
  const createdMs = nowMs();
  const runningSlots = getFactoryRunningSlotsByName(factoryName, state.settings);
  const running = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===factoryName && j.status==="In Progress").length;
  const jobDurationSeconds = Number.isFinite(Number(durationSeconds))
    ? Math.max(0, Math.round(Number(durationSeconds)))
    : Math.max(0, Math.round(Number(durationMin || 0) * 60));

  if(!allowQueue && running >= runningSlots){
    return null;
  }
  const status = (running >= runningSlots) ? "Queued" : "In Progress";
  const startMs = (status==="In Progress") ? nowMs() : null;
  const endMs = (status==="In Progress") ? (startMs + (jobDurationSeconds * 1000)) : null;

  const job = {
    id: uid(),
    type: "Factory",
    sourceName: factoryName,
    itemName: productName,
    qty: Math.max(1, Math.floor(Number(qty||1))),
    outputQty: Math.max(1, Math.floor(Number(outputQty||1))),
    createdMs,
    durationMin: jobDurationSeconds / 60,
    durationSeconds: jobDurationSeconds,
    startMs,
    endMs,
    status,
    notifiedComplete:false,
  };

  state.jobs.push(job);
  save();
  toast(status==="Queued" ? `Queued: ${job.qty} × ${productName}` : `Started: ${job.qty} × ${productName}`);
  return job;
}
function getFactoryProductInputs(p){
  return (Array.isArray(p?.inputs) ? p.inputs : [])
    .map(inp=>({
      item: String(inp?.item || "").trim(),
      qty: Math.max(1, Math.floor(Number(inp?.qty || 1) || 1)),
    }))
    .filter(inp=>inp.item);
}
function showMissingFactoryIngredientsModal(checks){
  const missing = (Array.isArray(checks) ? checks : []).filter(c=>Number(c?.short || 0) > 0);
  openModal({
    title:"Missing ingredients",
    primaryText:"OK",
    bodyHtml: `
      <div class="small">The following ingredients are not fully available (reserved items are excluded):</div>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
        ${missing.map(c=>`<div class="small">${escapeHtml(c.item)} ${c.qty} (${Math.max(0, Math.floor(Number(c.availableQty || 0)))})</div>`).join("")}
      </div>
    `,
    onSave: ()=>{},
  });
}

/* Modal helper */
const modal = $("#modal");
const modalForm = $("#modal form");
const modalTitle = $("#modalTitle");
const modalBody = $("#modalBody");
const modalPrimary = $("#modalPrimary");
const modalCancel = $("#modalCancel");
const modalClose = $("#modalClose");
let editDraftDuration = null;
function closeModal(){
  if(modal?.open){
    modal.close("cancel");
  }
}
if(modalForm){
  // Prevent native form submit/validation popups; save path is handled by modalPrimary click.
  modalForm.addEventListener("submit", (ev)=>{
    ev.preventDefault();
  });
}
if(modalCancel){
  modalCancel.onclick = (ev)=>{
    ev.preventDefault();
    closeModal();
  };
}
if(modalClose){
  modalClose.onclick = (ev)=>{
    ev.preventDefault();
    closeModal();
  };
}

function openModal({title, bodyHtml, primaryText="Save", onSave, closeOnSave=true, onAfterSave=null, onOpen=null}){
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalPrimary.textContent = primaryText;
  onOpen?.();
  initCustomDropdowns(modal);

  // Clear any previous click handler
  modalPrimary.onclick = null;

  // Save runs immediately on button click (dialog close event doesn't tell us which button)
  modalPrimary.onclick = (ev) => {
    ev.preventDefault();
    try{
      const result = onSave?.();
      if(closeOnSave){
        modal.close("ok");
      }
      onAfterSave?.(result);
    }catch(e){
      console.error(e);
      toast(e?.message ? e.message : "Could not save (check inputs).");
    }
  };

  modal.showModal();
}
modal.addEventListener("close", ()=>{
  editDraftDuration = null;
});

/* Routing */
const routes = {
  home: {title:"Dashboard", subtitle:"Overview of trains, plane, helicopter, factories, and crops", render: renderHome},
  crops: {title:"Crops", subtitle:"Track crop timers and add harvests to your Inventory", render: renderCrops},
  factories: {title:"Factories", subtitle:"Manage factory products and run up to 6 slots per factory", render: renderFactories},
  foundries: {title:"Foundries", subtitle:"Manage foundry products and ingot timing", render: renderFoundries},
  farm: {title:"Farm Buildings", subtitle:"Feed animals and collect products automatically", render: renderFarm},
  barn: {title:"Inventory", subtitle:"Store and track your inventory", render: renderBarn},
  transport: {title:"Transport", subtitle:"Track trains, helicopters, airplanes, and islands", render: renderTransport},
  settings: {title:"Settings", subtitle:"Configure Town Profile and backup options", render: renderSettings},
};
let route = "home";
let transportTab = "trains";
let transportFilter = "All";
const dashboardSettings = loadDashboardSettings();
let advisorTarget = "plane";
let advisorSortBy = dashboardSettings.advisorSortBy || "source";
let advisorShowIngredients = dashboardSettings.advisorShowIngredients === true;
let advisorTransportFilter = ["all","train","plane","helicopter","ship"].includes(String(dashboardSettings.advisorTransportFilter || ""))
  ? String(dashboardSettings.advisorTransportFilter)
  : "all";
let advisorTableSort = (
  dashboardSettings.advisorTableSort
  && ["item","short","source","transport","est_time"].includes(String(dashboardSettings.advisorTableSort.key || ""))
)
  ? {
      key: String(dashboardSettings.advisorTableSort.key),
      dir: String(dashboardSettings.advisorTableSort.dir || "")==="desc" ? "desc" : "asc",
    }
  : {key:"source", dir:"asc"};
let advisorIngredientMissingSortDir = String(dashboardSettings.advisorIngredientMissingSortDir || "").toLowerCase()==="asc" ? "asc" : "desc";
let advisorExpandedKeys = new Set();
const dashboardSectionCollapsed = { ready:false, almostReady:false, productionAdvisor:false, inventory:false, dailyPlan:false };
const factorySectionCollapsed = {};
const helicopterOrderCollapsed = {};

function setRoute(r){
  route = routes[r] ? r : "home";
  location.hash = route;
  render();
}
function escapeSelectorValue(v){
  return String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function highlightGoTarget(el){
  if(!el) return;
  el.classList.remove("goto-highlight");
  // Force reflow so repeated clicks retrigger animation.
  void el.offsetWidth;
  el.classList.add("goto-highlight");
  setTimeout(()=>{
    el.classList.remove("goto-highlight");
  }, 2000);
}
function navigateToDeepTarget({routeName, tabName="", factoryId="", productId="", cropId="", farmId="", transportFocusId=""}){
  const nextRoute = routes[routeName] ? routeName : "home";
  if(nextRoute==="transport" && tabName){
    transportTab = tabName;
  }
  if(route!==nextRoute){
    route = nextRoute;
    location.hash = route;
    render();
  }
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      const root = $("#content");
      if(!root) return;
      if((nextRoute==="factories" || nextRoute==="foundries") && factoryId){
        const factoryEl = $(`[data-factory-id="${escapeSelectorValue(factoryId)}"]`, root);
        if(factoryEl){
          factoryEl.scrollIntoView({behavior:"smooth", block:"center"});
        }
        if(productId){
          const productEl = $(`[data-product-id="${escapeSelectorValue(productId)}"]`, factoryEl || root);
          const productTitle = productEl ? $("[data-product-title]", productEl) : null;
          if(productTitle){
            highlightGoTarget(productTitle);
            return;
          }
          if(productEl){
            highlightGoTarget(productEl);
            return;
          }
        }
        if(factoryEl){
          highlightGoTarget(factoryEl);
        }
        return;
      }
      if(nextRoute==="crops" && cropId){
        const cropEl = $(`[data-crop-id="${escapeSelectorValue(cropId)}"]`, root);
        if(cropEl){
          cropEl.scrollIntoView({behavior:"smooth", block:"center"});
          highlightGoTarget(cropEl);
        }
        return;
      }
      if(nextRoute==="transport" && transportFocusId){
        const targetEl = document.getElementById(String(transportFocusId || ""));
        if(targetEl){
          targetEl.scrollIntoView({behavior:"smooth", block:"center"});
          highlightGoTarget(targetEl);
        }
        return;
      }
      if(nextRoute==="farm" && farmId){
        const farmEl = $(`[data-farm-id="${escapeSelectorValue(farmId)}"]`, root);
        if(farmEl){
          farmEl.scrollIntoView({behavior:"smooth", block:"center"});
          highlightGoTarget(farmEl);
        }
      }
    });
  });
}
function initRoute(){
  const h = (location.hash||"").replace("#","");
  route = routes[h] ? h : "home";
}

function headerButton(label, cls, onClick){
  const b = document.createElement("button");
  b.className = cls || "primary";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function render(){
  updateJobStatuses();
  initRoute();
  applyUiPreferences();

  // nav active
  $$(".nav-item").forEach(btn=>{
    const r = btn.dataset.route;
    btn.classList.toggle("active", r===route);
  });

  $("#pageTitle").textContent = routes[route].title;
  $("#pageSubtitle").textContent = routes[route].subtitle;

  const actions = $("#headerActions");
  actions.innerHTML = "";
  routes[route].render();
  initCustomDropdowns(document);
  const advisorTransportFilterDdBtn = $("#advisorTransportFilter__dd");
  if(advisorTransportFilterDdBtn) advisorTransportFilterDdBtn.textContent = "Transport";
  updateTimerTextNodes();
}

function renderHome(){
  const content = $("#content");
  state.plan = normalizePlan(state.plan);
  ensurePlanDayBoundary(false);
  const plan = state.plan;
  const dayKey = getPlanDayKey();
  const trains = normalizeTrains(state.trains);
  const plane = normalizePlane(state.plane);
  if(applyPlaneRowMirror(plane)){
    state.plane = plane;
    save();
  }
  const helicopterOrders = normalizeHelicopterOrders(state.helicopterOrders);
  const townSettings = normalizeSettings(state.settings);
  state.settings = townSettings;
  const totalPlots = Math.max(1, Math.floor(Number(townSettings.fieldPlots || 12)));
  const currentGrowingPlots = (state.jobs || []).filter(j=>j?.type==="Crop" && j?.status==="In Progress").length;
  const freePlots = Math.max(totalPlots - currentGrowingPlots, 1);

  const barnMap = buildAvailableBarnQtyMap();
  const dashSectionIsCollapsed = (key)=>dashboardSectionCollapsed[String(key || "")] === true;
  const dashSectionChevron = (key)=>dashSectionIsCollapsed(key) ? "▶" : "▼";

  function readPositiveQty(v){
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function getAdvisorRequests(target){
    if(target==="all"){
      const all = [];
      getAdvisorRequests("trains").forEach(r=>all.push(r));
      getAdvisorRequests("plane").forEach(r=>all.push(r));
      getAdvisorRequests("helicopters").forEach(r=>all.push(r));
      return all;
    }
    if(target==="trains"){
      const rows = [];
      (trains || []).slice(0,3).forEach(train=>{
        (train?.requests || []).forEach(r=>{
          rows.push({
            item: String(r?.item || "").trim(),
            qty: readPositiveQty(r?.qty),
          });
        });
      });
      return rows;
    }
    if(target==="plane"){
      return ((plane?.rows || []).flatMap(row=>
        (row?.slots || []).map(s=>({
          item: String(s?.item || "").trim(),
          qty: readPositiveQty(s?.qty),
        }))
      ));
    }
    if(target==="helicopters"){
      const rows = [];
      (helicopterOrders || []).slice(0,9).forEach(order=>{
        if(order?.status==="Refreshing") return;
        (order?.slots || []).forEach(s=>{
          rows.push({
            item: String(s?.item || "").trim(),
            qty: readPositiveQty(s?.qty),
          });
        });
      });
      return rows;
    }
    return [];
  }
  function getProductionInfo(itemName){
    const key = normalizeItemKey(itemName);
    const crop = (state.crops || []).find(c=>normalizeItemKey(c?.name)===key);
    if(crop){
      const cropDurationSeconds = getAdjustedCropDurationSeconds(crop?.durationMin, townSettings);
      return {
        kind:"Crop",
        source:"Crop",
        durationSec:cropDurationSeconds,
        outputQty:1,
        capacity:1,
        cropId:String(crop?.id || ""),
        farmId:"",
        factoryId:"",
        productId:"",
        isFoundry:false,
        factory:null,
      };
    }
    const animalBuilding = (state.farm?.animalBuildings || []).find(b=>normalizeItemKey(b?.product)===key);
    if(animalBuilding){
      return {
        kind:"Animal",
        source:String(animalBuilding?.name || "Animal Building"),
        durationSec:Math.max(0, Math.round(Number(animalBuilding?.durationMin || 0) * 60)),
        outputQty:1,
        capacity:Math.max(1, Math.floor(Number(animalBuilding?.capacity || 1))),
        cropId:"",
        farmId:String(animalBuilding?.id || ""),
        factoryId:"",
        productId:"",
        isFoundry:false,
        factory:null,
      };
    }
    for(const f of (state.factories || [])){
      const p = (f?.products || []).find(prod=>normalizeItemKey(prod?.name)===key);
      if(p){
        const adjustedSec = getAdjustedFactoryDurationSeconds(Math.max(0, Number(p?.durationMin || 0)), f);
        const foundry = isFoundryFactory(f);
        return {
          kind:"Factory",
          source:foundry ? "Foundry" : String(f?.name || "Factory"),
          durationSec:adjustedSec,
          outputQty:getProductOutputQty(f, p),
          capacity:1,
          cropId:"",
          farmId:"",
          factoryId:String(f?.id || ""),
          productId:String(p?.id || ""),
          isFoundry:foundry,
          factory:foundry ? "Foundry" : String(f?.name || "Factory"),
        };
      }
    }
    return {
      kind:"Unknown",
      source:"Unknown",
      durationSec:null,
      outputQty:1,
      capacity:1,
      cropId:"",
      farmId:"",
      factoryId:"",
      productId:"",
      isFoundry:false,
      factory:null
    };
  }

  const advisorTargets = [
    {value:"all", label:"View All"},
    {value:"trains", label:"Trains"},
    {value:"plane", label:"Plane"},
    {value:"helicopters", label:"Helicopters"},
  ];
  const legacyToNew = new Map([
    ["trains","trains"],
    ["helicopter","helicopters"],
    ["view-trains","trains"],
    ["view-planes","plane"],
    ["view-helicopters","helicopters"],
  ]);
  const selectedTargetCandidate = legacyToNew.get(advisorTarget) || advisorTarget;
  const normalizedSelectedTarget = /^train-\d+$/.test(selectedTargetCandidate)
    ? "trains"
    : (/^helicopter-\d+$/.test(selectedTargetCandidate) ? "helicopters" : selectedTargetCandidate);
  const selectedTarget = advisorTargets.some(t=>t.value===normalizedSelectedTarget) ? normalizedSelectedTarget : "plane";
  function buildMissingItemsFromRequests(rawRequests){
    const requestedByKey = new Map();
    rawRequests.forEach(r=>{
      const key = normalizeItemKey(r.item);
      if(!key) return;
      const prev = requestedByKey.get(key) || {itemName:r.item, qty:0};
      prev.qty += r.qty;
      requestedByKey.set(key, prev);
    });
    const out = [];
    requestedByKey.forEach((req, key)=>{
      const barnQty = Number(barnMap.get(key) || 0);
      const missingQty = Math.max(0, req.qty - barnQty);
      if(missingQty<=0) return;
      const info = getProductionInfo(req.itemName);
      const outputQty = Math.max(1, Math.floor(Number(info?.outputQty || 1)));
      const jobsNeeded = info.kind==="Factory"
        ? Math.ceil(missingQty / outputQty)
        : missingQty;
      let estTimeSec = null;
      if(info.kind==="Factory" && info.durationSec != null){
        const slots = Math.max(1, info.isFoundry ? 1 : getFactoryRunningSlots(townSettings));
        const batches = Math.ceil(jobsNeeded / slots);
        estTimeSec = batches * Number(info.durationSec || 0);
      }else if(info.kind==="Crop" && info.durationSec != null){
        const cyclesNeeded = Math.ceil(missingQty / freePlots);
        estTimeSec = cyclesNeeded * Number(info.durationSec || 0);
      }else if(info.kind==="Animal" && info.durationSec != null){
        const capacity = Math.max(1, Math.floor(Number(info.capacity || 1)));
        const batches = Math.ceil(missingQty / capacity);
        estTimeSec = batches * Number(info.durationSec || 0);
      }
      out.push({
        itemName: req.itemName,
        item: String(req.itemName || ""),
        missingQty,
        short: missingQty,
        source: info.source,
        kind: info.kind,
        durationSec: info.durationSec,
        outputQty,
        jobsNeeded,
        estTimeSec,
        estMs: estTimeSec == null ? 0 : (Math.max(0, Number(estTimeSec || 0)) * 1000),
        goRoute: info.kind==="Factory" ? (info.isFoundry ? "foundries" : "factories") : (info.kind==="Crop" ? "crops" : (info.kind==="Animal" ? "farm" : "barn")),
        goFactoryId: String(info.factoryId || ""),
        goProductId: String(info.productId || ""),
        goCropId: String(info.cropId || ""),
        goFarmId: String(info.farmId || ""),
        goto: {
          page: info.kind==="Factory" ? (info.isFoundry ? "foundries" : "factories") : (info.kind==="Crop" ? "crops" : (info.kind==="Animal" ? "farm" : "barn")),
          tab: "",
          factoryId: String(info.factoryId || ""),
          productId: String(info.productId || ""),
          cropId: String(info.cropId || ""),
          farmId: String(info.farmId || ""),
          focusKey: "",
        },
      });
    });
    out.sort((a,b)=>a.itemName.localeCompare(b.itemName, undefined, {sensitivity:"base"}));
    return out;
  }
  function collectRequestsForTargets(targetValues){
    const list = [];
    targetValues.forEach(targetValue=>{
      const rows = getAdvisorRequests(targetValue).filter(r=>r.item && r.qty>0);
      rows.forEach(r=>list.push(r));
    });
    return list;
  }
  function buildMissingItemsForTarget(targetValue){
    const addTransportMeta = (rows, transportType, transportLabel, transportIndex=null)=>rows.map(row=>({
      ...row,
      transportType,
      transportLabel: String(transportLabel || transportType || "Other").trim() || String(transportType || "Other"),
      transportIndex: Number.isFinite(Number(transportIndex)) ? Number(transportIndex) : null,
      transport: transportType, // keep legacy field for compatibility
    }));
    if(targetValue==="trains"){
      const out = [];
      (trains || []).slice(0,3).forEach((train, idx)=>{
        const requests = (train?.requests || []).map(r=>({
          item: String(r?.item || "").trim(),
          qty: readPositiveQty(r?.qty),
        })).filter(r=>r.item && r.qty>0);
        if(!requests.length) return;
        const label = String(train?.name || "").trim() || `Train ${idx+1}`;
        out.push(...addTransportMeta(buildMissingItemsFromRequests(requests), "Train", label, idx+1));
      });
      return out;
    }
    if(targetValue==="plane"){
      const out = [];
      (plane?.rows || []).forEach((row, idx)=>{
        const requests = (row?.slots || []).map(s=>({
          item: String(s?.item || "").trim(),
          qty: readPositiveQty(s?.qty),
        })).filter(r=>r.item && r.qty>0);
        if(!requests.length) return;
        const label = `Plane ${idx+1}`;
        out.push(...addTransportMeta(buildMissingItemsFromRequests(requests), "Plane", label, idx+1));
      });
      return out;
    }
    if(targetValue==="helicopters" || targetValue==="helicopter"){
      const out = [];
      (helicopterOrders || []).slice(0,9).forEach((order, idx)=>{
        if(order?.status==="Refreshing") return;
        const requests = (order?.slots || []).map(s=>({
          item: String(s?.item || "").trim(),
          qty: readPositiveQty(s?.qty),
        })).filter(r=>r.item && r.qty>0);
        if(!requests.length) return;
        const label = String(order?.name || "").trim() || `Helicopter ${idx+1}`;
        out.push(...addTransportMeta(buildMissingItemsFromRequests(requests), "Helicopter", label, idx+1));
      });
      return out;
    }
    const transportType = (
      (targetValue==="factory" || targetValue==="factories" || targetValue==="production") ? "Factory" : "Other"
    );
    return addTransportMeta(
      buildMissingItemsFromRequests(getAdvisorRequests(targetValue).filter(r=>r.item && r.qty>0)),
      transportType,
      transportType,
      null
    );
  }
  function buildSectionsForTargetMode(targetMode){
    if(targetMode==="all"){
      return [
        {label:"Trains", rows: buildMissingItemsForTarget("trains")},
        {label:"Plane", rows: buildMissingItemsForTarget("plane")},
        {label:"Helicopters", rows: buildMissingItemsForTarget("helicopters")},
      ].filter(section=>section.rows.length>0);
    }
    if(targetMode==="trains"){
      return [{label:"Trains", rows: buildMissingItemsForTarget("trains")}]
        .filter(section=>section.rows.length>0);
    }
    if(targetMode==="plane"){
      return [{label:"Plane", rows: buildMissingItemsForTarget("plane")}]
        .filter(section=>section.rows.length>0);
    }
    if(targetMode==="helicopters"){
      return [{label:"Helicopters", rows: buildMissingItemsForTarget("helicopters")}]
        .filter(section=>section.rows.length>0);
    }
    return [];
  }
  function matchesAdvisorTransportFilter(row){
    const filter = String(advisorTransportFilter || "all");
    if(filter==="all") return true;
    const raw = String(row?.transportType || row?.transport || "").trim().toLowerCase();
    const key = raw.endsWith("s") ? raw.slice(0, -1) : raw;
    return key === filter;
  }
  let advisorRows = [];
  let missingItems = [];
  let sourceTotals = [];
  let overallEstimatedSec = 0;
  let overallHasUnknown = false;
  let dashboardAdvisorError = null;
  try{
    const advisorShortageRows = buildSectionsForTargetMode("all")
      .flatMap(section=>section.rows || [])
      .filter(matchesAdvisorTransportFilter);
    advisorRows = advisorShortageRows.slice();
    missingItems = advisorShortageRows.slice();

    const sourceTotalsMap = new Map();
    missingItems.forEach(m=>{
      const src = String(m?.source || "");
      const prev = sourceTotalsMap.get(src) || {source:src, totalSec:0, hasUnknown:false};
      if(m?.estTimeSec == null) prev.hasUnknown = true;
      else prev.totalSec += Number(m.estTimeSec || 0);
      sourceTotalsMap.set(src, prev);
    });
    sourceTotals = Array.from(sourceTotalsMap.values())
      .sort((a,b)=>String(a?.source || "").localeCompare(String(b?.source || ""), undefined, {sensitivity:"base"}));
    overallEstimatedSec = sourceTotals.reduce((mx, s)=>
      s.hasUnknown ? mx : Math.max(mx, Number(s.totalSec || 0))
    , 0);
    overallHasUnknown = sourceTotals.some(s=>s.hasUnknown);
  }catch(err){
    dashboardAdvisorError = err;
    advisorRows = [];
    missingItems = [];
    sourceTotals = [];
    overallEstimatedSec = 0;
    overallHasUnknown = false;
    console.error(err);
  }

  function getFactoryProductByName(itemName){
    const key = normalizeItemKey(itemName);
    for(const f of (state.factories || [])){
      const p = (f?.products || []).find(prod=>normalizeItemKey(prod?.name)===key);
      if(p){
        return {
          factoryName: String(f?.name || "Factory"),
          product: p,
        };
      }
    }
    return null;
  }
  function getAnimalBuildingByProduct(itemName){
    const key = normalizeItemKey(itemName);
    return (state.farm?.animalBuildings || []).find(b=>normalizeItemKey(b?.product)===key) || null;
  }
  function hasKnownDependencies(itemName){
    const factoryMatch = getFactoryProductByName(itemName);
    if(factoryMatch){
      const inputs = Array.isArray(factoryMatch.product?.inputs) ? factoryMatch.product.inputs : [];
      if(inputs.some(inp=>String(inp?.item || "").trim())) return true;
    }
    const animalMatch = getAnimalBuildingByProduct(itemName);
    if(animalMatch && String(animalMatch.feedItem || "").trim()) return true;
    return false;
  }
  function advisorRowKey(itemName){
    return normalizeItemKey(itemName);
  }
  function getDependencyRows(itemName, missingQty, depth=3, level=1, visited=null){
    if(depth<=0) return [];
    const rows = [];
    const needQty = Math.max(0, Math.floor(Number(missingQty || 0)));
    if(needQty<=0) return rows;
    const key = normalizeItemKey(itemName);
    if(!key) return rows;
    const seen = visited ? new Set(visited) : new Set();
    if(seen.has(key)) return rows;
    seen.add(key);

    const factoryMatch = getFactoryProductByName(itemName);
    if(factoryMatch){
      const matchFactory = (state.factories || []).find(f=>String(f?.name || "")===String(factoryMatch.factoryName || ""));
      const outputQty = getProductOutputQty(matchFactory, factoryMatch.product);
      const jobsRequired = Math.ceil(needQty / outputQty);
      const inputs = Array.isArray(factoryMatch.product?.inputs) ? factoryMatch.product.inputs : [];
      inputs.forEach(inp=>{
        const ingName = String(inp?.item || "").trim();
        if(!ingName) return;
        const perJobQty = Math.max(1, Math.floor(Number(inp?.qty || 1) || 1));
        const requiredQty = perJobQty * jobsRequired;
        const barnQty = barnQtyFor(ingName);
        const ingMissing = Math.max(0, requiredQty - barnQty);
        const toneClass = barnQty >= requiredQty
          ? "factory-ing-ok"
          : (barnQty > 0 ? "factory-ing-some" : "factory-ing-none");
        const ingInfo = getProductionInfo(ingName);
        rows.push({
          level,
          itemName: ingName,
          requiredQty,
          barnQty,
          toneClass,
          source: ingInfo.source || "Unknown",
        });
        if(depth>1 && ingMissing>0){
          rows.push(...getDependencyRows(ingName, ingMissing, depth-1, level+1, seen));
        }
      });
      return rows;
    }

    const animalMatch = getAnimalBuildingByProduct(itemName);
    if(animalMatch){
      const feedItem = String(animalMatch.feedItem || "").trim();
      if(!feedItem) return rows;
      const requiredQty = needQty; // 1 feed per product
      const barnQty = barnQtyFor(feedItem);
      const feedMissing = Math.max(0, requiredQty - barnQty);
      const feedInfo = getProductionInfo(feedItem);
      const toneClass = barnQty >= requiredQty
        ? "factory-ing-ok"
        : (barnQty > 0 ? "factory-ing-some" : "factory-ing-none");
      rows.push({
        level,
        itemName: feedItem,
        requiredQty,
        barnQty,
        toneClass,
        source: feedInfo.source || "Unknown",
      });
      if(depth>1 && feedMissing>0){
        rows.push(...getDependencyRows(feedItem, feedMissing, depth-1, level+1, seen));
      }
      return rows;
    }
    return rows;
  }
  function dependencyRowsHtml(parentItem){
    if(!advisorShowIngredients) return "";
    const rowKey = advisorRowKey(parentItem.itemName);
    if(!advisorExpandedKeys.has(rowKey)) return "";
    const rows = getDependencyRows(parentItem.itemName, parentItem.missingQty, 3, 1, new Set());
    if(!rows.length) return "";
    return rows.map(r=>`
      <tr class="advisor-dep-row">
        <td colspan="6">
          <div class="small advisor-dep-line ${escapeAttr(r.toneClass || "")}" style="padding-left:${Math.max(0, Number(r.level || 1)) * 14}px">
            ↳ ${escapeHtml(r.itemName)} ${Math.max(0, Number(r.requiredQty || 0))} <span class="advisor-dep-barn">(${Math.max(0, Number(r.barnQty || 0))})</span> <span class="advisor-dep-source">${escapeHtml(r.source || "Unknown")}</span>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function barnQtyFor(itemName){
    return Number(barnMap.get(normalizeItemKey(itemName)) || 0);
  }
  function advisorSortValue(row, key){
    if(key==="item") return String(row?.itemName || "");
    if(key==="short") return Number(row?.missingQty || 0);
    if(key==="source") return String(row?.source || "");
    if(key==="transport") return String(row?.transportType || row?.transport || "Other");
    if(key==="est_time") return row?.estTimeSec == null ? null : Number(row.estTimeSec || 0);
    return String(row?.itemName || "");
  }
  function compareAdvisorValues(aVal, bVal, dir){
    const aBlank = aVal == null || aVal === "";
    const bBlank = bVal == null || bVal === "";
    if(aBlank || bBlank){
      if(aBlank && bBlank) return 0;
      if(dir==="asc") return aBlank ? 1 : -1;
      return aBlank ? -1 : 1;
    }
    const aNum = typeof aVal==="number" && Number.isFinite(aVal);
    const bNum = typeof bVal==="number" && Number.isFinite(bVal);
    if(aNum && bNum){
      if(aVal === bVal) return 0;
      return dir==="asc" ? (aVal - bVal) : (bVal - aVal);
    }
    const cmp = String(aVal).localeCompare(String(bVal), undefined, {sensitivity:"base"});
    return dir==="asc" ? cmp : -cmp;
  }
  function compareAdvisorRows(a,b){
    const key = advisorTableSort?.key || "source";
    const dir = advisorTableSort?.dir === "desc" ? "desc" : "asc";
    if(key==="transport"){
      const typeRank = (value)=>{
        const raw = String(value || "").trim().toLowerCase();
        if(raw==="train" || raw==="trains") return 0;
        if(raw==="plane" || raw==="planes") return 1;
        if(raw==="helicopter" || raw==="helicopters") return 2;
        if(raw==="ship" || raw==="ships") return 3;
        if(raw==="factory" || raw==="production") return 4;
        return 5;
      };
      const aRank = typeRank(a?.transportType || a?.transport);
      const bRank = typeRank(b?.transportType || b?.transport);
      if(aRank !== bRank){
        return dir==="asc" ? (aRank - bRank) : (bRank - aRank);
      }
      const aIdx = Number(a?.transportIndex);
      const bIdx = Number(b?.transportIndex);
      if(Number.isFinite(aIdx) && Number.isFinite(bIdx) && aIdx !== bIdx){
        return dir==="asc" ? (aIdx - bIdx) : (bIdx - aIdx);
      }
      const labelCmp = compareAdvisorValues(
        String(a?.transportLabel || a?.transportType || a?.transport || "Other"),
        String(b?.transportLabel || b?.transportType || b?.transport || "Other"),
        dir
      );
      if(labelCmp !== 0) return labelCmp;
    }
    const primary = compareAdvisorValues(advisorSortValue(a, key), advisorSortValue(b, key), dir);
    if(primary !== 0) return primary;
    return String(a.itemName || "").localeCompare(String(b.itemName || ""), undefined, {sensitivity:"base"});
  }
  function advisorHeaderLabel(label, key){
    const active = advisorTableSort?.key === key;
    if(!active) return label;
    return `${label} ${advisorTableSort?.dir === "desc" ? "▼" : "▲"}`;
  }

  function advisorRowsHtmlForRows(rows){
    rows = Array.isArray(rows) ? rows : [];
    const flatAdvisorRows = rows.slice().sort(compareAdvisorRows);
    if(!flatAdvisorRows.length){
      return "";
    }
    return flatAdvisorRows.map(m=>{
      const transportText = String(m?.transportLabel || m?.transportType || m?.transport || "");
      const itemText = String(m?.itemName || m?.item || "");
      const shortText = m?.missingQty ?? m?.short ?? "";
      const sourceText = String(m?.source || "");
      const estText = m?.estTimeSec == null ? "n/a" : fmtHms(m.estTimeSec);
      const goto = (m?.goto && typeof m.goto==="object") ? m.goto : null;
      const goRoute = String(goto?.page || m?.goRoute || "").trim();
      const goTab = String(goto?.tab || m?.goTab || "").trim();
      const goFocus = String(goto?.focusKey || m?.goTransportFocusId || "").trim();
      const goFactoryId = String(goto?.factoryId || m?.goFactoryId || "").trim();
      const goProductId = String(goto?.productId || m?.goProductId || "").trim();
      const goCropId = String(goto?.cropId || m?.goCropId || "").trim();
      const goFarmId = String(goto?.farmId || m?.goFarmId || "").trim();
      return `
      <tr>
        <td>${escapeHtml(transportText)}</td>
        <td>
          <div class="row" style="gap:6px; align-items:center; flex-wrap:nowrap">
            ${advisorShowIngredients && hasKnownDependencies(itemText) ? `<button class="icon advisor-expand-btn" data-advisor-expand="${escapeAttr(advisorRowKey(itemText))}" title="Toggle ingredients">${advisorExpandedKeys.has(advisorRowKey(itemText)) ? "▾" : "▸"}</button>` : ``}
            <b>${escapeHtml(itemText)}</b>
          </div>
        </td>
        <td>${shortText === "" ? "" : escapeHtml(String(shortText))}</td>
        <td>${escapeHtml(sourceText)}</td>
        <td>${estText}</td>
        <td>${goRoute ? `<button class="secondary dash-go-link"
          data-go-route="${escapeAttr(goRoute)}"
          data-go-tab="${escapeAttr(goTab)}"
          data-go-transport-focus="${escapeAttr(goFocus)}"
          data-go-factory-id="${escapeAttr(goFactoryId)}"
          data-go-product-id="${escapeAttr(goProductId)}"
          data-go-crop-id="${escapeAttr(goCropId)}"
          data-go-farm-id="${escapeAttr(goFarmId)}">Go to</button>` : ``}</td>
      </tr>
      ${dependencyRowsHtml(m)}
    `;
    }).join("");
  }
  function advisorRowsHtml(){
    if(!advisorRows.length){
      return `<tr><td colspan="6" class="small">No items.</td></tr>`;
    }
    return advisorRowsHtmlForRows(advisorRows);
  }
  function buildAdvisorIngredientRows(){
    const byKey = new Map();
    const includeTransport = (transportType)=>matchesAdvisorTransportFilter({ transportType });
    const addUsage = (transportType, transportLabel, itemName, qtyRaw)=>{
      if(!includeTransport(transportType)) return;
      const item = String(itemName || "").trim();
      const qty = parseInt(qtyRaw, 10);
      if(!item || !Number.isFinite(qty) || qty<=0) return;
      const key = normalizeItemKey(item);
      if(!key) return;
      const prev = byKey.get(key) || {
        key,
        ingredient: item,
        stock: Number(barnMap.get(key) || 0),
        missingTotal: 0,
        refs: [],
      };
      const stockQty = Math.max(0, Number(prev.stock || 0));
      const lineMissing = Math.max(0, qty - stockQty);
      prev.missingTotal += lineMissing;
      if(!prev.refs.some(r=>r.transportLabel===transportLabel && normalizeItemKey(r.item)===key && r.qty===qty)){
        prev.refs.push({ transportType, transportLabel, item, qty });
      }
      byKey.set(key, prev);
    };

    (trains || []).forEach((train, trainIdx)=>{
      const trainLabel = String(train?.name || "").trim() || `Train ${trainIdx+1}`;
      (train?.requests || []).forEach(req=>{
        if(req?.done === true) return;
        addUsage("Train", trainLabel, req?.item, req?.qty);
      });
    });
    (plane?.rows || []).forEach((row, rowIdx)=>{
      const rowLabel = `Plane ${rowIdx+1}`;
      (row?.slots || []).forEach(slot=>{
        if(slot?.done === true) return;
        addUsage("Plane", rowLabel, slot?.item, slot?.qty);
      });
    });
    (helicopterOrders || []).forEach((order, orderIdx)=>{
      if(String(order?.status || "") !== "Active") return;
      const heliLabel = String(order?.name || "").trim() || `Heli ${orderIdx+1}`;
      (order?.slots || []).forEach(slot=>{
        addUsage("Helicopter", heliLabel, slot?.item, slot?.qty);
      });
    });

    return Array.from(byKey.values()).map(row=>{
      const needed = Math.max(0, Number(row.missingTotal || 0));
      const info = getProductionInfo(String(row.ingredient || ""));
      const gotoPage = info?.kind==="Crop"
        ? "crops"
        : (info?.kind==="Animal"
          ? "farm"
          : (info?.kind==="Factory"
            ? (info?.isFoundry ? "foundries" : "factories")
            : "factories"));
      return {
        ingredient: String(row.ingredient || ""),
        stock: Math.max(0, Number(row.stock || 0)),
        needed,
        refs: Array.isArray(row.refs) ? row.refs : [],
        goto: {
          page: gotoPage,
          tab: "",
          factoryId: String(info?.factoryId || ""),
          productId: String(info?.productId || ""),
          cropId: String(info?.cropId || ""),
          farmId: String(info?.farmId || ""),
          focusKey: "",
        },
      };
    }).filter(row=>Number(row.needed || 0) > 0).sort((a,b)=>{
      const dir = advisorIngredientMissingSortDir === "asc" ? 1 : -1;
      if(Number(a.needed || 0) !== Number(b.needed || 0)){
        return (Number(a.needed || 0) - Number(b.needed || 0)) * dir;
      }
      return String(a.ingredient || "").localeCompare(String(b.ingredient || ""), undefined, {sensitivity:"base"});
    });
  }
  function ingredientMissingHeaderLabel(){
    return `Missing ${advisorIngredientMissingSortDir === "asc" ? "▲" : "▼"}`;
  }
  function advisorIngredientRowsHtml(){
    const rows = buildAdvisorIngredientRows();
    if(!rows.length){
      return `<tr><td colspan="5" class="small">No missing ingredients in current transport requests.</td></tr>`;
    }
    return rows.map(r=>{
      const refs = (r.refs || []).slice(0, 3).map(ref=>`${ref.transportLabel} x${Math.max(0, Number(ref.qty || 0))}`);
      const moreCount = Math.max(0, (r.refs || []).length - refs.length);
      const usedInText = refs.join(", ") + (moreCount>0 ? ` +${moreCount} more` : "");
      return `
        <tr>
          <td><b>${escapeHtml(r.ingredient || "")}</b></td>
          <td>${Math.max(0, Number(r.stock || 0))}</td>
          <td>${Math.max(0, Number(r.needed || 0))}</td>
          <td class="small">${escapeHtml(usedInText)}</td>
          <td>${r.goto ? `<button class="secondary dash-go-link"
            data-go-route="${escapeAttr(String(r.goto.page || "factories"))}"
            data-go-tab="${escapeAttr(String(r.goto.tab || ""))}"
            data-go-factory-id="${escapeAttr(String(r.goto.factoryId || ""))}"
            data-go-product-id="${escapeAttr(String(r.goto.productId || ""))}"
            data-go-crop-id="${escapeAttr(String(r.goto.cropId || ""))}"
            data-go-farm-id="${escapeAttr(String(r.goto.farmId || ""))}"
            data-go-transport-focus="${escapeAttr(String(r.goto.focusKey || ""))}">Go</button>` : ``}</td>
        </tr>
      `;
    }).join("");
  }



// ===== Dashboard: Ready + Almost Ready blocks =====
// Ready: fully ready transports (Train all cars ready, Ship returned, Plane row ready, Helicopter order ready)
// Almost ready: within 30m (ships) OR >=80% complete (others); max 5 items

const READY_PROGRESS_PCT = 100;
const ALMOST_READY_THRESHOLD_MIN = 30;
const ALMOST_READY_PROGRESS_PCT = 80;
const ALMOST_READY_MAX = 5;

function pct(n, d){
  if(!d) return 0;
  return Math.round((n / d) * 100);
}
function hasValidQty(qty){
  const n = Number(qty);
  return Number.isFinite(n) && n > 0;
}
function isFilled(itemName, qty){
  return String(itemName||"").trim()!=="" && hasValidQty(qty);
}
function isReadyResult(result){
  return String(result||"").toLowerCase()==="ready";
}
function isDoneOrReady(doneFlag, result){
  return doneFlag===true || isReadyResult(result);
}
function buildProgress(items){
  const active = (Array.isArray(items) ? items : []).filter(x=>isFilled(x?.item, x?.qty));
  const ready = active.filter(x=>isDoneOrReady(x?.done, x?.result)).length;
  return { activeCount: active.length, readyCount: ready, pct: pct(ready, active.length) };
}

const readyEntries = [];
const almostReadyEntries = [];
function logDashReady(kind, label, info){
  try{
    console.log(`[Dashboard Ready] ${kind} ${label}`, info);
  }catch{}
}

try{
  // Trains
  (trains || []).forEach((train)=>{
    const trainLabel = String(train?.name || "Train");
    const items = (train?.requests || []).map((req, idx)=>({
      item: String(req?.item || "").trim(),
      qty: req?.qty,
      done: req?.done === true,
      result: train?.checkResults?.[idx] || null,
    }));
    const totalCars = items.length;
    if(totalCars === 0){
      logDashReady("Train", trainLabel, { outcome:"skip", reason:"no_cars" });
      return;
    }
    const filledCars = items.filter(x=>isFilled(x.item, x.qty)).length;
    if(filledCars === 0){
      logDashReady("Train", trainLabel, { outcome:"skip", reason:"no_filled_cars", totalCars });
      return;
    }

    const allCarsReady = items
      .filter(x=>isFilled(x.item, x.qty))
      .every(x=>isDoneOrReady(x.done, x.result));

    if(train?.status !== "Running" && allCarsReady){
      logDashReady("Train", trainLabel, {
        outcome:"ready",
        reason:"all_filled_cars_ready",
        status:String(train?.status || ""),
        filledCars,
        totalCars,
      });
      readyEntries.push({
        sortMins: 0,
        sortPct: 100,
        label: trainLabel,
        detail: "Ready to send",
        goRoute: "transport",
        goTab: "trains",
        focusId: `train-card-${String(train?.id || "")}`,
        action: "Go",
      });
      return;
    }

    // Almost ready: >=80% ready among filled cars (and not fully ready)
    // OR only 1 car remaining missing/incomplete.
    const prog = buildProgress(items);
    if(prog.activeCount === 0){
      logDashReady("Train", trainLabel, { outcome:"skip", reason:"no_active_progress_items" });
      return;
    }
    if(train?.status === "Running"){
      logDashReady("Train", trainLabel, {
        outcome:"skip",
        reason:"train_running",
        status:String(train?.status || ""),
        progress:prog,
      });
      return;
    }
    if(allCarsReady){
      logDashReady("Train", trainLabel, {
        outcome:"skip",
        reason:"already_ready_branch_handled",
        progress:prog,
      });
      return;
    }
    const remaining = Math.max(0, prog.activeCount - prog.readyCount);
    if(prog.pct >= ALMOST_READY_PROGRESS_PCT || remaining === 1){
      logDashReady("Train", trainLabel, {
        outcome:"almost_ready",
        reason: (remaining===1 ? "one_remaining" : "pct_threshold"),
        progress:prog,
        remaining,
      });
      almostReadyEntries.push({
        sortMins: null,
        sortPct: prog.pct,
        label: trainLabel,
        detail: `${prog.readyCount}/${prog.activeCount} cars ready`,
        goRoute: "transport",
        goTab: "trains",
        focusId: `train-card-${String(train?.id || "")}`,
        action: "Go",
      });
    }else{
      logDashReady("Train", trainLabel, {
        outcome:"skip",
        reason:"not_almost_ready",
        progress:prog,
        remaining,
      });
    }
  });

  // Ships
  (normalizeShips(state.ships) || []).forEach((ship)=>{
    const shipLabel = String(ship?.name || "Ship");
    const status = String(ship?.status || "");
    if(status === "Ready"){
      logDashReady("Ship", shipLabel, { outcome:"ready", reason:"returned", status });
      readyEntries.push({
        sortMins: 0,
        sortPct: 100,
        label: shipLabel,
        detail: "Returned",
        goRoute: "transport",
        goTab: "ships",
        focusId: `ship-card-${String(ship?.id || "")}`,
        action: "Go",
      });
      return;
    }
    if(status !== "Sailing"){
      logDashReady("Ship", shipLabel, { outcome:"skip", reason:"not_sailing_or_ready", status });
      return;
    }
    const endMs = Number(ship?.endMs || 0);
    if(!Number.isFinite(endMs) || endMs <= 0){
      logDashReady("Ship", shipLabel, { outcome:"skip", reason:"invalid_endMs", status, endMs });
      return;
    }
    const leftMs = endMs - nowMs();
    if(leftMs <= 0){
      logDashReady("Ship", shipLabel, { outcome:"skip", reason:"expired_waiting_tick", status, leftMs });
      return;
    }
    const leftMin = Math.ceil(leftMs / 60000);
    if(leftMin <= ALMOST_READY_THRESHOLD_MIN){
      logDashReady("Ship", shipLabel, {
        outcome:"almost_ready",
        reason:"within_30m",
        status,
        leftMin,
      });
      almostReadyEntries.push({
        sortMins: leftMin,
        sortPct: 0,
        label: shipLabel,
        detail: `Returning in ${fmtMins(leftMin)}`,
        goRoute: "transport",
        goTab: "ships",
        focusId: `ship-card-${String(ship?.id || "")}`,
        action: "Go",
      });
    }else{
      logDashReady("Ship", shipLabel, {
        outcome:"skip",
        reason:"more_than_30m",
        status,
        leftMin,
      });
    }
  });

  // Plane
  (plane?.rows || []).forEach((row, rowIdx)=>{
    const planeLabel = `Plane ${rowIdx+1}`;
    const items = (row?.slots || []).map((slot, slotIdx)=>({
      item: String(slot?.item || "").trim(),
      qty: slot?.qty,
      done: slot?.done === true,
      result: plane?.rows?.[rowIdx]?.checkResults?.[slotIdx] || null,
    }));
    const totalSlots = items.length;
    if(totalSlots === 0){
      logDashReady("Plane", planeLabel, { outcome:"skip", reason:"no_slots" });
      return;
    }
    const filled = items.filter(x=>isFilled(x.item, x.qty)).length;
    if(filled === 0){
      logDashReady("Plane", planeLabel, { outcome:"skip", reason:"no_filled_slots", totalSlots });
      return;
    }

    const allReady = items
      .filter(x=>isFilled(x.item, x.qty))
      .every(x=>isDoneOrReady(x.done, x.result));
    if(allReady){
      logDashReady("Plane", planeLabel, {
        outcome:"ready",
        reason:"all_filled_slots_ready",
        filled,
        totalSlots,
      });
      readyEntries.push({
        sortMins: 0,
        sortPct: 100,
        label: planeLabel,
        detail: "Ready",
        goRoute: "transport",
        goTab: "plane",
        focusId: `plane-req-${rowIdx}-0`,
        action: "Go",
      });
      return;
    }
    const prog = buildProgress(items);
    if(prog.activeCount === 0){
      logDashReady("Plane", planeLabel, { outcome:"skip", reason:"no_active_progress_items" });
      return;
    }
    const remaining = Math.max(0, prog.activeCount - prog.readyCount);
    if(prog.pct >= ALMOST_READY_PROGRESS_PCT || remaining === 1){
      logDashReady("Plane", planeLabel, {
        outcome:"almost_ready",
        reason:(remaining===1 ? "one_remaining" : "pct_threshold"),
        progress:prog,
        remaining,
      });
      almostReadyEntries.push({
        sortMins: null,
        sortPct: prog.pct,
        label: planeLabel,
        detail: `${prog.readyCount}/${prog.activeCount} ready`,
        goRoute: "transport",
        goTab: "plane",
        focusId: `plane-req-${rowIdx}-0`,
        action: "Go",
      });
    }else{
      logDashReady("Plane", planeLabel, {
        outcome:"skip",
        reason:"not_almost_ready",
        progress:prog,
        remaining,
      });
    }
  });

  // Helicopter
  (helicopterOrders || []).forEach((order, orderIdx)=>{
    const heliLabel = `Heli ${orderIdx+1}`;
    if(String(order?.status || "") !== "Active"){
      logDashReady("Helicopter", heliLabel, {
        outcome:"skip",
        reason:"order_not_active",
        status:String(order?.status || ""),
      });
      return;
    }
    const items = (order?.slots || []).map((slot, slotIdx)=>({
      item: String(slot?.item || "").trim(),
      qty: slot?.qty,
      done: false,
      result: order?.checkResults?.[slotIdx] || null,
    }));
    const totalSlots = items.length;
    if(totalSlots === 0){
      logDashReady("Helicopter", heliLabel, { outcome:"skip", reason:"no_slots" });
      return;
    }
    const filled = items.filter(x=>isFilled(x.item, x.qty)).length;
    if(filled === 0){
      logDashReady("Helicopter", heliLabel, { outcome:"skip", reason:"no_filled_slots", totalSlots });
      return;
    }

    const allReady = items
      .filter(x=>isFilled(x.item, x.qty))
      .every(x=>isDoneOrReady(x.done, x.result));
    if(allReady){
      logDashReady("Helicopter", heliLabel, {
        outcome:"ready",
        reason:"all_filled_items_ready",
        filled,
        totalSlots,
      });
      readyEntries.push({
        sortMins: 0,
        sortPct: 100,
        label: heliLabel,
        detail: "Ready",
        goRoute: "transport",
        goTab: "helicopter",
        focusId: `heli-card-${orderIdx}`,
        action: "Go",
      });
      return;
    }
    const prog = buildProgress(items);
    if(prog.activeCount === 0){
      logDashReady("Helicopter", heliLabel, { outcome:"skip", reason:"no_active_progress_items" });
      return;
    }
    const remaining = Math.max(0, prog.activeCount - prog.readyCount);
    if(prog.pct >= ALMOST_READY_PROGRESS_PCT || remaining === 1){
      logDashReady("Helicopter", heliLabel, {
        outcome:"almost_ready",
        reason:(remaining===1 ? "one_remaining" : "pct_threshold"),
        progress:prog,
        remaining,
      });
      almostReadyEntries.push({
        sortMins: null,
        sortPct: prog.pct,
        label: heliLabel,
        detail: `${prog.readyCount}/${prog.activeCount} ready`,
        goRoute: "transport",
        goTab: "helicopter",
        focusId: `heli-card-${orderIdx}`,
        action: "Go",
      });
    }else{
      logDashReady("Helicopter", heliLabel, {
        outcome:"skip",
        reason:"not_almost_ready",
        progress:prog,
        remaining,
      });
    }
  });
}catch(e){
  console.error(e);
}

function sortDashboardEntries(list){
  return (Array.isArray(list) ? list : []).slice().sort((a,b)=>{
    const am = (a.sortMins==null) ? Infinity : a.sortMins;
    const bm = (b.sortMins==null) ? Infinity : b.sortMins;
    if(am !== bm) return am - bm;
    const ap = Number(a.sortPct || 0);
    const bp = Number(b.sortPct || 0);
    if(ap !== bp) return bp - ap;
    return String(a.label||"").localeCompare(String(b.label||""), undefined, {sensitivity:"base"});
  });
}

function readyBlockHtml(){
  if(!readyEntries.length){
    return `<div class="small">Nothing ready right now.</div>`;
  }
  const sorted = sortDashboardEntries(readyEntries);
  return `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px">
      ${sorted.map(e=>`
        <div class="card" style="padding:10px; background:rgba(46,204,113,0.10); border:1px solid rgba(46,204,113,0.28)">
          <div class="row" style="justify-content:space-between; gap:10px; align-items:center">
            <div>
              <div style="font-weight:700">${escapeHtml(e.label)}</div>
              <div class="small">${escapeHtml(e.detail)}</div>
            </div>
            <button class="secondary dash-go-link" data-go-route="${escapeAttr(e.goRoute)}" data-go-tab="${escapeAttr(e.goTab)}" data-go-transport-focus="${escapeAttr(e.focusId)}">${escapeHtml(e.action)}</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function almostReadyBlockHtml(){
  if(!almostReadyEntries.length){
    return `<div class="small">Nothing close to ready right now.</div>`;
  }
  const sorted = sortDashboardEntries(almostReadyEntries).slice(0, ALMOST_READY_MAX);
  return `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px">
      ${sorted.map(e=>`
        <div class="card" style="padding:10px; background:rgba(241,196,15,0.10); border:1px solid rgba(241,196,15,0.28)">
          <div class="row" style="justify-content:space-between; gap:10px; align-items:center">
            <div>
              <div style="font-weight:700">${escapeHtml(e.label)}</div>
              <div class="small">${escapeHtml(e.detail)}</div>
            </div>
            <button class="secondary dash-go-link" data-go-route="${escapeAttr(e.goRoute)}" data-go-tab="${escapeAttr(e.goTab)}" data-go-transport-focus="${escapeAttr(e.focusId)}">${escapeHtml(e.action)}</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
  const dash = document.createElement("div");
  dash.className = "dash-wrap";
  const dashboardSectionKeys = ["ready","almostReady","dailyPlan","productionAdvisor","inventory"];
  const anyDashboardSectionExpanded = dashboardSectionKeys.some(key=>!dashSectionIsCollapsed(key));
  dash.innerHTML = `
    <div class="row" style="justify-content:flex-end; margin-bottom:10px">
      <button id="btnDashToggleAllSections" class="secondary">${anyDashboardSectionExpanded ? "Collapse all" : "Expand all"}</button>
    </div>
    <div class="dash-layout dash-layout-single">
      <div class="dash-right">
        
<div class="dash-panel ops-card">
  <div class="dash-panel-head" data-dash-section-toggle="ready" style="cursor:pointer">
    <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
      <div class="small" aria-hidden="true">${dashSectionChevron("ready")}</div>
      <div class="dash-panel-title">Ready</div>
    </div>
  </div>
  <div data-dash-section-body="ready" style="${dashSectionIsCollapsed("ready") ? "display:none" : ""}">
    ${readyBlockHtml()}
  </div>
</div>
<div class="dash-panel ops-card">
  <div class="dash-panel-head" data-dash-section-toggle="almostReady" style="cursor:pointer">
    <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
      <div class="small" aria-hidden="true">${dashSectionChevron("almostReady")}</div>
      <div class="dash-panel-title">Almost ready</div>
    </div>
  </div>
  <div data-dash-section-body="almostReady" style="${dashSectionIsCollapsed("almostReady") ? "display:none" : ""}">
    ${almostReadyBlockHtml()}
  </div>
</div>
        <div class="dash-panel ops-card">
        <div class="dash-panel-head" data-dash-section-toggle="productionAdvisor" style="cursor:pointer">
          <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
            <div class="small" aria-hidden="true">${dashSectionChevron("productionAdvisor")}</div>
            <div class="dash-panel-title">Production Advisor</div>
          </div>
        </div>
        <div data-dash-section-body="productionAdvisor" style="${dashSectionIsCollapsed("productionAdvisor") ? "display:none" : ""}">
        ${dashboardAdvisorError ? `
          <div class="card" style="margin-top:10px">
            <div class="card-title">Dashboard error — check console</div>
            <div class="small" style="margin-top:6px">${escapeHtml(String(dashboardAdvisorError?.message || "Unknown error"))}</div>
          </div>
        ` : `
          <div class="small">Items (${missingItems.length})</div>
          <div class="small">Fields: total ${totalPlots} • Growing ${currentGrowingPlots} • Free ${freePlots}</div>
          <div class="row" style="margin-top:6px; gap:14px">
            <label class="row small" style="gap:6px; align-items:center; margin:0">
              <input id="advisorShowIngredients" type="checkbox" ${advisorShowIngredients ? "checked" : ""} />
              Show ingredients
            </label>
            ${advisorShowIngredients ? `
              <label class="dash-inline-field">Transport
                <select id="advisorTransportFilter" aria-label="Transport filter">
                  <option value="all" ${advisorTransportFilter==="all" ? "selected" : ""}>All</option>
                  <option value="train" ${advisorTransportFilter==="train" ? "selected" : ""}>Trains</option>
                  <option value="plane" ${advisorTransportFilter==="plane" ? "selected" : ""}>Plane</option>
                  <option value="helicopter" ${advisorTransportFilter==="helicopter" ? "selected" : ""}>Helicopters</option>
                  <option value="ship" ${advisorTransportFilter==="ship" ? "selected" : ""}>Ships</option>
                </select>
              </label>
            ` : ``}
          </div>
          <div style="margin-top:6px">
            <table class="table">
              ${advisorShowIngredients ? `
                <colgroup>
                  <col style="width:24%" />
                  <col style="width:12%" />
                  <col style="width:14%" />
                  <col style="width:42%" />
                  <col style="width:8%" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>In stock</th>
                    <th id="advisorIngredientMissingSort" style="cursor:pointer; user-select:none">${escapeHtml(ingredientMissingHeaderLabel())}</th>
                    <th>Used in</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${advisorIngredientRowsHtml()}
                </tbody>
              ` : `
                <colgroup>
                  <col style="width:14%" />
                  <col style="width:28%" />
                  <col style="width:12%" />
                  <col style="width:18%" />
                  <col style="width:20%" />
                  <col style="width:8%" />
                </colgroup>
                <thead>
                  <tr>
                    <th style="user-select:none">
                      <select id="advisorTransportFilter" aria-label="Transport filter">
                        <option value="all" ${advisorTransportFilter==="all" ? "selected" : ""}>All</option>
                        <option value="train" ${advisorTransportFilter==="train" ? "selected" : ""}>Trains</option>
                        <option value="plane" ${advisorTransportFilter==="plane" ? "selected" : ""}>Plane</option>
                        <option value="helicopter" ${advisorTransportFilter==="helicopter" ? "selected" : ""}>Helicopters</option>
                        <option value="ship" ${advisorTransportFilter==="ship" ? "selected" : ""}>Ships</option>
                      </select>
                    </th>
                    <th data-advisor-sort="item" style="cursor:pointer; user-select:none">${escapeHtml(advisorHeaderLabel("Item", "item"))}</th>
                    <th data-advisor-sort="short" style="cursor:pointer; user-select:none">${escapeHtml(advisorHeaderLabel("Short", "short"))}</th>
                    <th data-advisor-sort="source" style="cursor:pointer; user-select:none">${escapeHtml(advisorHeaderLabel("Source", "source"))}</th>
                    <th data-advisor-sort="est_time" style="cursor:pointer; user-select:none">${escapeHtml(advisorHeaderLabel("Est. Time", "est_time"))}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${advisorRowsHtml()}
                </tbody>
              `}
            </table>
          </div>
          <div class="small" style="margin-top:10px">Totals by source</div>
          <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px">
            ${sourceTotals.length ? sourceTotals.map(s=>`
              <div class="row" style="justify-content:space-between">
                <span class="small">${escapeHtml(s.source)}</span>
                <span class="small">${s.hasUnknown ? `${fmtHms(s.totalSec)} + n/a` : fmtHms(s.totalSec)}</span>
              </div>
            `).join("") : `<div class="small">-</div>`}
          </div>
          <div class="row" style="justify-content:space-between; margin-top:10px; border-top:1px solid var(--border); padding-top:8px">
            <span class="small"><b>Estimated completion time</b></span>
            <span class="small"><b>${overallHasUnknown ? `${fmtHms(overallEstimatedSec)} + n/a` : fmtHms(overallEstimatedSec)}</b></span>
          </div>
        `}
        </div>
        </div>
        <div class="dash-panel ops-card daily-plan-card">
        <div class="dash-panel-head" data-dash-section-toggle="dailyPlan" style="cursor:pointer">
          <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
            <div class="small" aria-hidden="true">${dashSectionChevron("dailyPlan")}</div>
            <div>
              <div class="dash-panel-title">Daily Plan</div>
              <div class="small">Day boundary: 06:00 Europe/London • Current plan day: <b>${escapeHtml(dayKey)}</b></div>
            </div>
          </div>
          <button id="btnDashPlanResetNow" class="secondary">Reset progress now</button>
        </div>
        <div data-dash-section-body="dailyPlan" style="${dashSectionIsCollapsed("dailyPlan") ? "display:none" : ""}">
        <table class="table" style="margin-top:8px">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Goal</th>
              <th>Progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Trains to send</td>
              <td><input data-dash-plan-goal="trains" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.trains || 0))}" style="max-width:110px" /></td>
              <td><span class="small"><b>${Math.max(0, Number(plan.progress.trainsSent || 0))}</b> / ${Math.max(0, Number(plan.goals.trains || 0))}</span></td>
              <td><button class="secondary dash-go-link" data-go-route="transport" data-go-tab="trains">Go to</button></td>
            </tr>
            <tr>
              <td>Planes to send</td>
              <td><input data-dash-plan-goal="planes" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.planes || 0))}" style="max-width:110px" /></td>
              <td><span class="small"><b>${Math.max(0, Number(plan.progress.planesSent || 0))}</b> / ${Math.max(0, Number(plan.goals.planes || 0))}</span></td>
              <td><button class="secondary dash-go-link" data-go-route="transport" data-go-tab="plane">Go to</button></td>
            </tr>
            <tr>
              <td>Helicopter orders to complete</td>
              <td><input data-dash-plan-goal="helicopters" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.helicopters || 0))}" style="max-width:110px" /></td>
              <td><span class="small"><b>${Math.max(0, Number(plan.progress.heliOrdersDone || 0))}</b> / ${Math.max(0, Number(plan.goals.helicopters || 0))}</span></td>
              <td><button class="secondary dash-go-link" data-go-route="transport" data-go-tab="helicopter">Go to</button></td>
            </tr>
          </tbody>
        </table>
        </div>
        </div>
      </div>
    </div>
  `;

  content.innerHTML = "";
  content.appendChild(dash);
  $$("[data-dash-section-toggle]", dash).forEach(head=>{
    head.onclick = ()=>{
      const key = String(head.dataset.dashSectionToggle || "");
      if(!key) return;
      dashboardSectionCollapsed[key] = !dashSectionIsCollapsed(key);
      render();
    };
  });
  const dashToggleAllSectionsBtn = $("#btnDashToggleAllSections", dash);
  if(dashToggleAllSectionsBtn){
    dashToggleAllSectionsBtn.onclick = ()=>{
      const shouldCollapse = dashboardSectionKeys.some(key=>!dashSectionIsCollapsed(key));
      dashboardSectionKeys.forEach(key=>{
        dashboardSectionCollapsed[key] = shouldCollapse;
      });
      render();
    };
  }
  function persistAdvisorDisplaySettings(){
    const settings = loadDashboardSettings();
    settings.advisorSortBy = advisorSortBy;
    settings.advisorShowIngredients = advisorShowIngredients;
    settings.advisorTransportFilter = ["all","train","plane","helicopter","ship"].includes(String(advisorTransportFilter || ""))
      ? String(advisorTransportFilter)
      : "all";
    settings.advisorIngredientMissingSortDir = advisorIngredientMissingSortDir === "asc" ? "asc" : "desc";
    settings.advisorTableSort = {
      key: advisorTableSort?.key || "source",
      dir: advisorTableSort?.dir === "desc" ? "desc" : "asc",
    };
    saveDashboardSettings(settings);
  }
  const advisorTransportFilterSel = $("#advisorTransportFilter", dash);
  if(advisorTransportFilterSel){
    advisorTransportFilterSel.onchange = ()=>{
      const next = String(advisorTransportFilterSel.value || "all");
      advisorTransportFilter = ["all","train","plane","helicopter","ship"].includes(next) ? next : "all";
      if(["all","train","plane","helicopter","ship"].includes(advisorTransportFilter)){
        advisorTableSort = { key:"transport", dir:"asc" };
      }
      persistAdvisorDisplaySettings();
      render();
    };
  }
  $$("[data-advisor-sort]", dash).forEach(th=>{
    th.onclick = ()=>{
      const key = String(th.dataset.advisorSort || "");
      if(!["item","short","source","transport","est_time"].includes(key)) return;
      if(advisorTableSort?.key === key){
        advisorTableSort = { key, dir: advisorTableSort.dir === "asc" ? "desc" : "asc" };
      }else{
        advisorTableSort = { key, dir: "asc" };
      }
      persistAdvisorDisplaySettings();
      render();
    };
  });
  const advisorIngredientsChk = $("#advisorShowIngredients", dash);
  if(advisorIngredientsChk){
    advisorIngredientsChk.onchange = ()=>{
      advisorShowIngredients = !!advisorIngredientsChk.checked;
      persistAdvisorDisplaySettings();
      render();
    };
  }
  const advisorIngredientMissingSortBtn = $("#advisorIngredientMissingSort", dash);
  if(advisorIngredientMissingSortBtn){
    advisorIngredientMissingSortBtn.onclick = ()=>{
      advisorIngredientMissingSortDir = advisorIngredientMissingSortDir === "desc" ? "asc" : "desc";
      persistAdvisorDisplaySettings();
      render();
    };
  }
  $$("[data-advisor-expand]", dash).forEach(btn=>{
    btn.onclick = ()=>{
      const key = String(btn.dataset.advisorExpand || "");
      if(!key) return;
      if(advisorExpandedKeys.has(key)) advisorExpandedKeys.delete(key);
      else advisorExpandedKeys.add(key);
      render();
    };
  });
  $$("[data-go-route]", dash).forEach(btn=>{
    btn.onclick = ()=>{
      const nextRoute = String(btn.dataset.goRoute || "home");
      const nextTab = String(btn.dataset.goTab || "").trim();
      const factoryId = String(btn.dataset.goFactoryId || "").trim();
      const productId = String(btn.dataset.goProductId || "").trim();
      const cropId = String(btn.dataset.goCropId || "").trim();
      const farmId = String(btn.dataset.goFarmId || "").trim();
      const transportFocusId = String(btn.dataset.goTransportFocus || "").trim();
      const hasDeepTarget = !!(factoryId || productId || cropId || farmId || transportFocusId);
      if(hasDeepTarget){
        navigateToDeepTarget({
          routeName: nextRoute,
          tabName: nextTab,
          factoryId,
          productId,
          cropId,
          farmId,
          transportFocusId,
        });
        return;
      }
      if(nextRoute==="transport" && nextTab){
        transportTab = nextTab;
      }
      setRoute(nextRoute);
    };
  });
  $$("[data-dash-plan-goal]", dash).forEach(input=>input.onchange=()=>{
    const key = String(input.dataset.dashPlanGoal || "");
    if(!["trains","planes","helicopters"].includes(key)) return;
    state.plan = normalizePlan(state.plan);
    state.plan.goals[key] = Math.max(0, Math.floor(Number(input.value || 0)));
    save();
    render();
  });
  const dashResetBtn = $("#btnDashPlanResetNow", dash);
  if(dashResetBtn){
    dashResetBtn.onclick = (e)=>{
      e.stopPropagation();
      state.plan = normalizePlan(state.plan);
      state.plan.progress = {trainsSent:0, planesSent:0, heliOrdersDone:0};
      state.plan.lastResetKey = getPlanDayKey();
      save();
      render();
    };
  }
}

function renderCrops(){
  const content = $("#content");
  const cropsForDisplay = [...state.crops].sort((a,b)=>
    String(a?.name||"").trim().localeCompare(String(b?.name||"").trim(), undefined, {sensitivity:"base"})
  );
  const townSettings = normalizeSettings(state.settings);
  state.settings = townSettings;
  const fieldPlots = Math.max(1, Math.floor(Number(townSettings.fieldPlots || 12)));
  const boosters = townSettings.boosters || defaultBoosters();
  const growingCount = state.jobs.filter(j=>j.type==="Crop" && j.status==="In Progress").length;
  const freePlots = Math.max(fieldPlots - growingCount, 0);
  const noFreePlots = freePlots === 0;

  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = `
    <div class="card-head">
      <div>
        <div class="card-title">Crops</div>
        <div class="small">Start a timer. Completed harvests auto-add to Inventory.</div>
        <div class="small">Plots: <b>${fieldPlots}</b> • Growing: <b>${growingCount}</b> • Free: <b>${freePlots}</b></div>
        ${boosters.superHarvest?.enabled ? `<div class="small">Boosters: Super-Harvest active (x2 yield) • ${escapeHtml(getBoosterEndsInLabel("superHarvest", townSettings) || "")}</div>` : ``}
        ${boosters.richFields?.enabled ? `<div class="small">Boosters: Rich Fields active (-40% crop time) • ${escapeHtml(getBoosterEndsInLabel("richFields", townSettings) || "")}</div>` : ``}
      </div>
      <div class="row">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="toggleSuperHarvest" class="booster-toggle" type="checkbox" ${boosters.superHarvest?.enabled ? "checked" : ""} />
          Super-Harvest (x2 yield) ${boosters.superHarvest?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("superHarvest", townSettings))}</span>` : ``}
        </label>
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="toggleRichFields" class="booster-toggle" type="checkbox" ${boosters.richFields?.enabled ? "checked" : ""} />
          Rich Fields (-40% time) ${boosters.richFields?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("richFields", townSettings))}</span>` : ``}
        </label>
        <button class="primary" id="btnAddCrop">+ Add Crop</button>
      </div>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "grid";
  list.innerHTML = cropsForDisplay.map(c=>cropCard(c, {noFreePlots, freePlots})).join("");

  const readySoonGroups = new Map();
  (state.jobs || []).forEach(j=>{
    if(j?.type!=="Crop") return;
    if(j?.status!=="In Progress") return;
    const cropName = String(j?.itemName || "").trim();
    if(!cropName) return;
    const endMs = Number(j?.endMs || 0);
    if(!Number.isFinite(endMs) || endMs<=0) return;
    const prev = readySoonGroups.get(cropName) || { name: cropName, count: 0, earliestEndMs: endMs };
    prev.count += 1;
    prev.earliestEndMs = Math.min(Number(prev.earliestEndMs || endMs), endMs);
    readySoonGroups.set(cropName, prev);
  });
  const readySoonRows = Array.from(readySoonGroups.values())
    .sort((a,b)=>Number(a.earliestEndMs || 0) - Number(b.earliestEndMs || 0));
  const readySoon = document.createElement("div");
  readySoon.className = "card";
  readySoon.innerHTML = `
    <div class="card-head">
      <div>
        <div class="card-title">Ready Soon</div>
        <div class="small">Earliest crop completion by crop type</div>
      </div>
    </div>
    ${readySoonRows.length ? `
      <table class="table" style="margin-top:8px">
        <thead>
          <tr>
            <th>Crop</th>
            <th>Growing</th>
            <th>Earliest</th>
          </tr>
        </thead>
        <tbody>
          ${readySoonRows.map(r=>{
            const leftSec = Math.max(0, Math.ceil((Number(r.earliestEndMs || 0) - nowMs()) / 1000));
            const timeStyle = leftSec <= 60
              ? `color:var(--green)`
              : (leftSec <= 300 ? `color:var(--orange)` : ``);
            return `
              <tr>
                <td><b>${escapeHtml(r.name)}</b></td>
                <td>${Math.max(0, Number(r.count || 0))}</td>
                <td><span class="small" style="${timeStyle}"><span data-end-ms="${Number(r.earliestEndMs || 0)}" data-timer-kind="left">${fmtLeft(r.earliestEndMs)}</span></span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    ` : `<div class="small" style="margin-top:8px">No active crop timers.</div>`}
  `;

  content.innerHTML = "";
  content.appendChild(top);
  content.appendChild(readySoon);
  content.appendChild(list);

  $("#btnAddCrop").onclick = ()=>openModal({
    title:"Add Crop",
    primaryText:"Add",
    bodyHtml: cropFormHtml({name:"", durationMin:5, qtyDefault:1}),
    onSave: ()=>{
      const v = readCropForm();
      state.crops.push({id: uid(), ...v});
      save(); render();
    }
  });
  const cropBoosterToggle = $("#toggleSuperHarvest", top);
  if(cropBoosterToggle){
    cropBoosterToggle.onchange = ()=>{
      setBoosterEnabled("superHarvest", !!cropBoosterToggle.checked);
      render();
    };
  }
  const richFieldsToggle = $("#toggleRichFields", top);
  if(richFieldsToggle){
    richFieldsToggle.onchange = ()=>{
      setBoosterEnabled("richFields", !!richFieldsToggle.checked);
      render();
    };
  }
  initCropDurationDraftInput("5");

  $$("[data-start-crop]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.startCrop;
      const crop = state.crops.find(c=>c.id===id);
      if(!crop) return;
      const qtyInput = $(`[data-crop-inline-qty="${id}"]`);
      const rawQty = String(qtyInput?.value ?? "").trim();
      const parsed = Number(rawQty);
      const defaultQty = Math.max(1, Math.floor(Number(crop.qtyDefault || 1) || 1));
      const qty = rawQty === ""
        ? defaultQty
        : (Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1);
      const msg = $(`[data-crop-start-msg="${id}"]`);
      const plotsNeeded = qty;
      const latestGrowingPlots = state.jobs.filter(j=>j.type==="Crop" && j.status==="In Progress").length;
      const latestFreePlots = Math.max(fieldPlots - latestGrowingPlots, 0);
      if(plotsNeeded > latestFreePlots){
        if(msg){
          msg.textContent = `Not enough free plots (Free: ${latestFreePlots})`;
        }
        return;
      }
      if(msg) msg.textContent = "";
      const adjustedCropDurationSec = getAdjustedCropDurationSeconds(crop.durationMin, townSettings);
      for(let i=0; i<qty; i++){
        createJob({type:"Crop", sourceName:"Field", itemName:crop.name, qty:1, durationMin:crop.durationMin, durationSeconds:adjustedCropDurationSec});
      }
      render();
    };
  });

  $$("[data-edit-crop]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.editCrop;
      const crop = state.crops.find(c=>c.id===id);
      if(!crop) return;
      openModal({
        title:`Edit Crop`,
        primaryText:"Save",
        bodyHtml: cropFormHtml(crop),
        onSave: ()=>{
          const v = readCropForm();
          const oldName = crop.name;
          Object.assign(crop, v);
          // keep existing timers linked if you renamed the crop
          state.jobs.forEach(j=>{ if(j.type==='Crop' && j.itemName===oldName) j.itemName = crop.name; });
          save(); render();
        }
      });
      initCropDurationDraftInput(String(crop.durationMin ?? 0));
    };
  });

  $$("[data-del-crop]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.delCrop;
      const idx = state.crops.findIndex(c=>c.id===id);
      if(idx>=0){
        state.crops.splice(idx,1);
        save(); render();
      }
    };
  });

  // Active crop timers actions
  $$("[data-delete-job]").forEach(b=>b.onclick=()=>{
    const idx = state.jobs.findIndex(x=>x.id===b.dataset.deleteJob);
    if(idx>=0){
      state.jobs.splice(idx,1);
      save(); render();
    }
  });
}

function cropCard(c, {noFreePlots=false, freePlots=0} = {}){
  // Show active jobs (running/ready) for this crop
  const active = state.jobs
    .filter(j => j.type==="Crop" && j.itemName===c.name && j.status!=="Collected")
    .sort((a,b)=>a.endMs-b.endMs);

  const jobsHtml = active.length ? `
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div class="small" style="margin-bottom:6px">Active timers</div>
      ${active.map(j=>{
        const minsLeft = j.status==="In Progress" ? msToMinsLeft(j.endMs) : 0;
        const pill = j.status==="Ready" ? "ready" : (j.status==="Queued" ? "pending" : "progress");
        return `
          <div class="row" style="padding:6px 0">
            <span class="pill ${pill}">${j.status==="Ready" ? "Ready" : (j.status==="Queued" ? "Queued" : "In Progress")}</span>
            <div class="small"><b>${j.qty}×</b> ${escapeHtml(c.name)}${j.status==="In Progress" ? ` • <span data-end-ms="${Number(j.endMs || 0)}" data-timer-kind="left">${fmtLeft(j.endMs)}</span> left` : (j.status==="Queued" ? (j.type==="Factory" ? ` • waiting` : ` • starts in <span data-end-ms="${Number(j.startMs || 0)}" data-timer-kind="left">${fmtLeft(j.startMs)}</span>`) : "")}</div>
            <div class="spacer"></div>
            <button class="icon" data-delete-job="${j.id}" title="Delete timer">🗑️</button>
          </div>
        `;
      }).join("")}
    </div>
  ` : ``;

  return `
  <div class="card" data-crop-id="${escapeAttr(c.id)}" style="grid-column:span 6">
    <div class="card-head" style="gap:10px; align-items:flex-start; flex-wrap:wrap">
      <div>
        <div class="card-title">${escapeHtml(c.name)}</div>
        <div class="small">⏱️ ${fmtMins(c.durationMin)} • default qty: ${Number(c.qtyDefault||1)}</div>
      </div>
      <div class="row" style="margin-left:auto; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <span>Qty</span>
          <input data-crop-inline-qty="${c.id}" data-crops-input type="number" min="1" step="1" value="${Number(c.qtyDefault||1)}" style="width:90px" />
        </label>
        <button class="primary ${noFreePlots ? "crop-start-softwarn" : ""}" data-start-crop="${c.id}" ${noFreePlots ? `title="Not enough free plots (Free: ${Math.max(0, Number(freePlots||0))})."` : ""}>+ Plant</button>
        <button class="icon" title="Edit" data-edit-crop="${c.id}">✎</button>
        <button class="icon" title="Delete" data-del-crop="${c.id}">🗑️</button>
      </div>
    </div>
    <div class="small" data-crop-start-msg="${c.id}" style="margin-top:6px; color:var(--orange)">${noFreePlots ? `Not enough free plots (Free: ${Math.max(0, Number(freePlots||0))})` : ``}</div>
    ${jobsHtml}
  </div>`;
}
function cropFormHtml(c){
  const durationValue = editDraftDuration != null ? editDraftDuration : String(Number(c.durationMin||0));
  return `
    <label class="field">Name
      <input id="cropName" type="text" value="${escapeAttr(c.name||"")}" required />
    </label>
    <label class="field">Duration (minutes)
      <input id="cropDur" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeAttr(durationValue)}" />
    </label>
    <label class="field">Default Quantity
      <input id="cropQty" type="number" min="1" step="1" value="${Number(c.qtyDefault||1)}" />
    </label>
  `;
}
function initCropDurationDraftInput(initialValue){
  editDraftDuration = String(initialValue ?? "");
  const dur = $("#cropDur");
  if(!dur) return;
  dur.value = editDraftDuration;
  dur.oninput = ()=>{ editDraftDuration = dur.value; };
  dur.onblur = ()=>{
    const raw = (dur.value || "").trim();
    if(raw===""){
      editDraftDuration = "";
      return;
    }
    const parsed = parseInt(raw, 10);
    const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    editDraftDuration = String(safe);
    dur.value = editDraftDuration;
  };
}
function readCropForm(){
  const parsedDur = parseInt($("#cropDur").value, 10);
  const durationMin = Number.isFinite(parsedDur) ? Math.max(0, parsedDur) : 0;
  const parsedQty = Number($("#cropQty").value);
  const qtyDefault = Number.isFinite(parsedQty) && parsedQty>0 ? Math.floor(parsedQty) : 1;
  return {
    name: $("#cropName").value.trim(),
    durationMin,
    qtyDefault,
  };
}

function renderFactories(){
  const content = $("#content");
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  const boosters = settings.boosters || defaultBoosters();
  const factoriesForDisplay = [...state.factories]
    .filter(f=>!isFoundryFactory(f))
    .sort((a,b)=>
    String(a?.name||"").trim().localeCompare(String(b?.name||"").trim(), undefined, {sensitivity:"base"})
  );
  const allFactoriesCollapsed = factoriesForDisplay.length>0
    && factoriesForDisplay.every(f=>factorySectionCollapsed[String(f?.id || "")] === true);

  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = `
    <div class="card-head">
        <div>
          <div class="card-title">Factories</div>
          <div class="small">Start product timers (strict FIFO queue)</div>
          ${boosters.highSpeedProduction?.enabled ? `<div class="small">Boosters: High-Speed Production active (-30% time) • ${escapeHtml(getBoosterEndsInLabel("highSpeedProduction", settings) || "")}</div>` : ``}
          ${boosters.extraPairOfHands?.enabled ? `<div class="small">Boosters: Extra Pair of Hands active (2 running slots) • ${escapeHtml(getBoosterEndsInLabel("extraPairOfHands", settings) || "")}</div>` : ``}
      </div>
      <div class="row">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="toggleHighSpeedProduction" class="booster-toggle" type="checkbox" ${boosters.highSpeedProduction?.enabled ? "checked" : ""} />
          High-Speed Production (-30% time) ${boosters.highSpeedProduction?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("highSpeedProduction", settings))}</span>` : ``}
        </label>
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="toggleExtraPairOfHands" class="booster-toggle" type="checkbox" ${boosters.extraPairOfHands?.enabled ? "checked" : ""} />
          Extra Pair of Hands (2 slots) ${boosters.extraPairOfHands?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("extraPairOfHands", settings))}</span>` : ``}
        </label>
        <button class="secondary" id="btnToggleAllFactories">${allFactoriesCollapsed ? "Expand all" : "Collapse all"}</button>
        <button class="primary" id="btnAddFactory">+ Add Factory</button>
      </div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.className = "content";
  // Force single-column factory list layout, overriding shared grid styles if any leak in.
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gridTemplateColumns = "none";
  wrap.style.columnCount = "auto";
  wrap.style.columns = "auto";
  wrap.style.gap = "12px";
  const availableBarnMap = buildAvailableBarnQtyMap();
  function sortFactoriesByNameInState(){
    state.factories.sort((a,b)=>
      String(a?.name || "").trim().localeCompare(String(b?.name || "").trim(), undefined, {sensitivity:"base"})
    );
  }
  function resetProductFormFieldsForQuickEntry(factory){
    const defaultOutputQty = getProductOutputQty(factory, {});
    const nameInput = $("#prodName");
    const durInput = $("#prodDur");
    const outInput = $("#prodOut");
    const inputsInput = $("#prodInputs");
    if(nameInput) nameInput.value = "";
    if(durInput) durInput.value = "10";
    if(outInput) outInput.value = String(defaultOutputQty);
    if(inputsInput) inputsInput.value = "";
    if(nameInput){
      nameInput.focus();
      nameInput.select();
    }
  }
  function openAddProductLoop(factoryId){
    const f = state.factories.find(x=>String(x?.id)===String(factoryId));
    if(!f) return;
    openModal({
      title:`Add Product (${f.name})`,
      primaryText:"Add",
      closeOnSave:false,
      bodyHtml: productFormHtml({name:"", durationMin:10, outputQty:getProductOutputQty(f, {})}, f),
      onSave: ()=>{
        const v = readProductForm(f);
        if(!String(v?.name || "").trim()) throw new Error("Product name required");
        if(!Number.isFinite(Number(v?.durationMin)) || Number(v.durationMin) < 0) throw new Error("Duration must be 0 or greater");
        f.products.push({id: uid(), ...v});
        save();
        render();
        resetProductFormFieldsForQuickEntry(f);
      }
    });
    resetProductFormFieldsForQuickEntry(f);
  }

  factoriesForDisplay.forEach(f=>{
    const runningCount = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="In Progress").length;
    const readyCount = (f.products || []).filter(p=>{
      const inputs = getFactoryProductInputs(p);
      if(inputs.length===0) return true;
      return inputs.every(inp=>Number(availableBarnMap.get(normalizeItemKey(inp.item)) || 0) >= Math.max(1, Number(inp.qty || 1)));
    }).length;
    const isCollapsed = factorySectionCollapsed[String(f.id || "")] === true;
    const fac = document.createElement("div");
    fac.className = "card";
    fac.style.width = "100%";
    fac.style.gridColumn = "auto";
    fac.setAttribute("data-factory-id", String(f.id || ""));
    fac.innerHTML = `
      <div class="card-head" data-factory-collapse-toggle="${f.id}" style="cursor:pointer">
        <div>
          <div class="row" style="gap:8px; align-items:center">
            <span class="small" aria-hidden="true">${isCollapsed ? "▶" : "▼"}</span>
            <div class="card-title">${escapeHtml(f.name)}</div>
          </div>
          <div class="small">${f.products.length} products • running: ${runningCount}/${getFactoryRunningSlotsByFactory(f, settings)}</div>
        </div>
        <div class="row">
          <span class="small ${readyCount>0 ? "pill ready" : ""}" style="${readyCount>0 ? "padding:2px 8px" : ""}">Ready: ${readyCount}</span>
          <button class="icon" title="Edit factory" data-edit-factory="${f.id}">✎</button>
          <button class="icon" title="Delete factory" data-del-factory="${f.id}">🗑️</button>
          <label class="small factory-speed-wrap">Speed: -
            <input
              class="factory-speed-input"
              type="number"
              min="0"
              max="99"
              step="1"
              value="${getFactorySpeedBonusPct(f)}"
              data-factory-speed="${f.id}"
            /> %
          </label>
          <button class="primary" data-add-product="${f.id}">+ Product</button>
        </div>
      </div>
      <div style="margin-top:10px; ${isCollapsed ? "display:none;" : ""}" class="grid" data-factory-collapse-body="${f.id}">
        ${f.products.map(p=>productCard(f,p)).join("")}
      </div>
    `;
    wrap.appendChild(fac);
  });

  content.innerHTML = "";
  content.appendChild(top);
  content.appendChild(wrap);

  const toggleAllFactoriesBtn = $("#btnToggleAllFactories", top);
  if(toggleAllFactoriesBtn){
    toggleAllFactoriesBtn.onclick = ()=>{
      const collapseAll = !allFactoriesCollapsed;
      factoriesForDisplay.forEach(f=>{
        factorySectionCollapsed[String(f?.id || "")] = collapseAll;
      });
      render();
    };
  }

  $$("[data-factory-collapse-toggle]", wrap).forEach(head=>{
    head.onclick = (ev)=>{
      const target = ev.target;
      if(target && (target.closest("button") || target.closest("input") || target.closest("label"))) return;
      const id = String(head.dataset.factoryCollapseToggle || "");
      if(!id) return;
      factorySectionCollapsed[id] = !(factorySectionCollapsed[id] === true);
      render();
    };
  });

  $("#btnAddFactory").onclick = ()=>openModal({
    title:"Add Factory",
    primaryText:"Add",
    bodyHtml: `
      <label class="field">Factory name
        <input id="factoryName" type="text" value="" />
      </label>
    `,
    onSave: ()=>{
      const name = $("#factoryName").value.trim();
      if(!name) throw new Error("Name required");
      const created = {id: uid(), name, speedBonusPct:0, products:[]};
      state.factories.push(created);
      sortFactoriesByNameInState();
      save();
      render();
      return created;
    },
    onAfterSave: (created)=>{
      const createdId = String(created?.id || "");
      if(!createdId) return;
      setTimeout(()=>openAddProductLoop(createdId), 0);
    },
  });
  const highSpeedToggle = $("#toggleHighSpeedProduction", top);
  if(highSpeedToggle){
    highSpeedToggle.onchange = ()=>{
      setBoosterEnabled("highSpeedProduction", !!highSpeedToggle.checked);
      render();
    };
  }
  const extraHandsToggle = $("#toggleExtraPairOfHands", top);
  if(extraHandsToggle){
    extraHandsToggle.onchange = ()=>{
      setBoosterEnabled("extraPairOfHands", !!extraHandsToggle.checked);
      render();
    };
  }

  $$("[data-edit-factory]").forEach(btn=>{
    btn.onclick = ()=>{
      const f = state.factories.find(x=>x.id===btn.dataset.editFactory);
      if(!f) return;
      openModal({
        title:"Edit Factory",
        bodyHtml:`<label class="field">Factory name
          <input id="factoryName" type="text" value="${escapeAttr(f.name)}" />
        </label>`,
        onSave: ()=>{
          const oldName = f.name;
          const name = $("#factoryName").value.trim();
          if(!name) throw new Error("Name required");
          f.name = name;
          // Update jobs sourceName so running timers still group correctly
          state.jobs.forEach(j=>{ if(j.type==="Factory" && j.sourceName===oldName) j.sourceName = name; });
          save(); render();
        }
      });
    };
  });

  $$("[data-del-factory]").forEach(btn=>{
    btn.onclick = ()=>{
      const idx = state.factories.findIndex(x=>x.id===btn.dataset.delFactory);
      if(idx>=0){
        state.factories.splice(idx,1);
        save(); render();
      }
    };
  });

  $$("[data-factory-speed]").forEach(input=>{
    input.onchange = ()=>{
      const f = state.factories.find(x=>x.id===input.dataset.factorySpeed);
      if(!f) return;
      const next = clampFactorySpeedBonusPct(input.value);
      input.value = String(next);
      if(Number(f.speedBonusPct || 0) === next) return;
      f.speedBonusPct = next;
      save();
      render();
    };
  });

  $$("[data-add-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const f = state.factories.find(x=>x.id===btn.dataset.addProduct);
      if(!f) return;
      openModal({
        title:`Add Product (${f.name})`,
        primaryText:"Add",
        bodyHtml: productFormHtml({name:"", durationMin:10}, f),
        onSave: ()=>{
          const v = readProductForm(f);
          if(!String(v?.name || "").trim()) throw new Error("Product name required");
          if(!Number.isFinite(Number(v?.durationMin)) || Number(v.durationMin) < 0) throw new Error("Duration must be 0 or greater");
          f.products.push({id: uid(), ...v});
          save(); render();
        }
      });
    };
  });

  $$("[data-edit-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const p = f?.products.find(x=>x.id===pId);
      if(!f || !p) return;
      openModal({
        title:`Edit Product (${f.name})`,
        bodyHtml: productFormHtml(p, f),
        onSave: ()=>{
          Object.assign(p, readProductForm(f));
          save(); render();
        }
      });
    };
  });

  $$("[data-del-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const idx = f?.products.findIndex(x=>x.id===pId) ?? -1;
      if(idx>=0){
        f.products.splice(idx,1);
        save(); render();
      }
    };
  });

  function startFactoryProductTimer(f,p){
    const running = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="In Progress").length;
    const queued = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="Queued").length;
    if(queued + running >= 60){
      toast("Queue limit reached for this factory (60).");
      return;
    }

    // Strict queue mode: only 1 running; everything else is queued FIFO
    const adjustedDurationSeconds = getAdjustedFactoryDurationSeconds(p.durationMin, f);
    const created = createFactoryJob({
      factoryName:f.name,
      productName:p.name,
      durationSeconds:adjustedDurationSeconds,
      qty: 1,
      outputQty: getProductOutputQty(f, p),
    });
    if(!created) return;
    const reserveResult = reserveIngredientsForFactoryJob(created, getFactoryProductInputs(p), {factoryId: f.id, factoryName: f.name});
    if(!reserveResult.ok){
      state.jobs = (state.jobs || []).filter(j=>j.id !== created.id);
      save();
      if(reserveResult.reason==="missing") showMissingFactoryIngredientsModal(reserveResult.missing);
      return;
    }
    render();
  }

  $$("[data-start-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const p = f?.products.find(x=>x.id===pId);
      if(!f || !p) return;

      const inputs = getFactoryProductInputs(p);

      // No ingredients defined -> start normally (no guard)
      if(inputs.length===0){
        startFactoryProductTimer(f,p);
        return;
      }

      const barnMap = buildAvailableBarnQtyMap();

      const checks = inputs.map(inp=>{
        const availableQty = Number(barnMap.get(normalizeItemKey(inp.item)) || 0);
        const short = Math.max(0, inp.qty - availableQty);
        return {...inp, availableQty, short};
      });
      const missing = checks.filter(c=>c.short > 0);

      if(missing.length===0){
        startFactoryProductTimer(f,p);
        return;
      }

      showMissingFactoryIngredientsModal(missing);
    };
  });

  // Active factory timers actions (collect / delete)
  $$("[data-collect]").forEach(b=>b.onclick=()=>collectJob(b.dataset.collect));
  $$("[data-delete-job]").forEach(b=>b.onclick=()=>{
    const idx = state.jobs.findIndex(x=>x.id===b.dataset.deleteJob);
    if(idx>=0){
      releaseReservation(state.jobs[idx]?.id);
      state.jobs.splice(idx,1);
      save(); render();
    }
  });
}

function productCard(f,p, options={}){
  const queueEnabled = options.queueEnabled !== false;
  const disableStart = options.disableStart === true;
  const showBusyHint = options.showBusyHint === true;
  const startDisabledTitle = String(options.startDisabledTitle || "");
  const productOutputQty = getProductOutputQty(f, p);

  const inputs = (Array.isArray(p.inputs) ? p.inputs : [])
    .map(inp=>({
      item: String(inp?.item || "").trim(),
      qty: Math.max(1, Math.floor(Number(inp?.qty || 1) || 1)),
    }))
    .filter(inp=>inp.item);

  const hasIngredients = inputs.length > 0;
  let statusIcon = "";
  let ingredientStatusHtml = "";
  const adjustedDurationSeconds = getAdjustedFactoryDurationSeconds(p.durationMin, f);

  if(hasIngredients){
    const barnMap = buildAvailableBarnQtyMap();

    const checks = inputs.map(inp=>{
      const barnQty = Number(barnMap.get(normalizeItemKey(inp.item)) || 0);
      const short = Math.max(0, inp.qty - barnQty);
      return {...inp, barnQty, short};
    });

    const allReady = checks.every(c=>c.short===0);
    const allZero = checks.every(c=>c.barnQty===0);
    if(allReady) statusIcon = "✅";
    else if(allZero) statusIcon = "⛔";
    else statusIcon = "⚠️";

    ingredientStatusHtml = checks.map(c=>{
      const isReady = c.barnQty >= c.qty;
      const isPartial = c.barnQty > 0 && c.barnQty < c.qty;
      const toneClass = isReady ? "factory-ing-ok" : (isPartial ? "factory-ing-some" : "factory-ing-none");
      const barnQtyText = isReady ? "" : ` <span class="factory-ing-missing">(${Math.max(0, Math.floor(Number(c.barnQty || 0)))})</span>`;
      return `<div class="small factory-ing-row ${toneClass}">${escapeHtml(c.item)} ${c.qty}${barnQtyText}</div>`;
    }).join("");
  }

  // Show active jobs for this product (running + queued when enabled)
  const active = state.jobs
    .filter(j => {
      if(j.type!=="Factory" || j.sourceName!==f.name || j.itemName!==p.name) return false;
      if(queueEnabled) return j.status==="In Progress" || j.status==="Queued";
      return j.status==="In Progress";
    })
    .sort((a,b)=>{
      // running first by end time, then queued by created time
      const aKey = (a.status==="In Progress") ? (a.endMs||0) : (a.createdMs||0) + 10**15;
      const bKey = (b.status==="In Progress") ? (b.endMs||0) : (b.createdMs||0) + 10**15;
      return aKey - bKey;
    });

  const jobsHtml = active.length ? `
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
      <div class="small" style="margin-bottom:6px">Active timers</div>
      ${active.map(j=>{
        const pill = (j.status==="Queued") ? "pending" : "progress";
        const label = (j.status==="Queued") ? "Queued" : "In Progress";
        const detail = (j.status==="Queued")
          ? " • waiting"
          : ` • <span data-end-ms="${Number(j.endMs || 0)}" data-timer-kind="left">${fmtLeft(j.endMs)}</span> left`;
        return `
          <div class="row" style="padding:6px 0">
            <span class="pill ${pill}">${label}</span>
            <div class="small"><b>1×</b> ${escapeHtml(p.name)}${detail}</div>
            <div class="spacer"></div>
            <button class="icon" data-delete-job="${j.id}" title="Remove">🗑️</button>
          </div>
        `;
      }).join("")}
    </div>
  ` : ``;

  return `
    <div class="card" data-factory-id="${escapeAttr(f.id)}" data-product-id="${escapeAttr(p.id)}" style="grid-column:span 6; background:rgba(255,255,255,0.03)">
      <div class="factory-product-main">
        <div class="factory-product-left">
          <div class="factory-product-top">
            <div class="card-title" data-product-title>${statusIcon ? `${statusIcon} ` : ""}${escapeHtml(p.name)}</div>
            <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
              <button class="primary" data-start-product data-fid="${f.id}" data-pid="${p.id}" ${disableStart ? "disabled" : ""} ${disableStart && startDisabledTitle ? `title="${escapeAttr(startDisabledTitle)}"` : ""}>${disableStart ? "Busy" : "▶ Start"}</button>
              <button class="icon" title="Edit" data-edit-product data-fid="${f.id}" data-pid="${p.id}">✎</button>
              <button class="icon" title="Delete" data-del-product data-fid="${f.id}" data-pid="${p.id}">🗑️</button>
            </div>
          </div>
          <div class="small">⏱️ ${formatDurationSeconds(adjustedDurationSeconds)}${productOutputQty!==1 ? ` • output: ${productOutputQty}` : ""}</div>
          ${showBusyHint ? `<div class="small"><span class="pill pending">Busy</span></div>` : ``}
        </div>
        <div class="factory-product-right">
          ${ingredientStatusHtml}
        </div>
      </div>
      ${jobsHtml}
    </div>
  `;
}
function productFormHtml(p, factory=null){
  const lockedOutputQty = isFeedMillFactory(factory) ? 3 : null;
  const outputQty = lockedOutputQty != null ? lockedOutputQty : Math.max(1, Math.floor(Number(p.outputQty||1)));
  const parsedInputs = Array.isArray(p.inputs)
    ? p.inputs.map(i=>`${String(i?.item||"").trim()}:${Math.max(1, Math.floor(Number(i?.qty||1))||1)}`).join(", ")
    : "";
  return `
    <label class="field">Product name
      <input id="prodName" type="text" value="${escapeAttr(p.name||"")}" />
    </label>
    <label class="field">Duration (minutes)
      <input id="prodDur" type="number" min="0" step="1" value="${Number(p.durationMin||0)}" />
    </label>
    ${lockedOutputQty == null ? `
      <label class="field">Output quantity
        <input id="prodOut" type="number" min="1" step="1" value="${outputQty}" />
      </label>
    ` : `<div class="small">output: ${outputQty}</div>`}
    <label class="field">Inputs (optional, format: item:qty, item:qty)
      <input id="prodInputs" data-item-input="true" type="text" value="${escapeAttr(parsedInputs)}" />
    </label>
  `;
}
function readProductForm(factory=null){
  const rawInputs = String($("#prodInputs")?.value || "").trim();
  const inputs = rawInputs
    ? rawInputs.split(",")
      .map(chunk=>chunk.trim())
      .filter(Boolean)
      .map(chunk=>{
        const [itemRaw, qtyRaw] = chunk.split(":");
        const item = String(itemRaw || "").trim();
        const qty = Math.max(1, Math.floor(Number(qtyRaw || 1) || 1));
        return item ? {item, qty} : null;
      })
      .filter(Boolean)
    : [];
  return {
    name: $("#prodName").value.trim(),
    durationMin: Number($("#prodDur").value||0),
    outputQty: isFeedMillFactory(factory) ? 3 : Math.max(1, Math.floor(Number($("#prodOut").value||1))),
    inputs,
  };
}

function renderBarn(){
  const content = $("#content");
  const inventoryCategoryOptions = ["All", "Crops", "Products", "Materials", "Feed", "Ingots"];
  function categoryOptionsHtml(includeAll){
    return inventoryCategoryOptions
      .filter(catName => includeAll || catName !== "All")
      .map(catName=>`<option value="${escapeAttr(catName)}">${escapeHtml(catName)}</option>`)
      .join("");
  }
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  const inventoryPriority = settings.inventoryPriority;
  function saveInventoryPriority(){
    state.settings = normalizeSettings({
      ...state.settings,
      inventoryPriority,
    });
    save();
  }
  function renameItemEverywhere(oldName, newName){
    const oldKey = normalizeItemKey(oldName);
    const newLabel = String(newName || "").trim();
    if(!oldKey || !newLabel) return;
    const renameIfMatch = (value)=> (normalizeItemKey(value)===oldKey ? newLabel : value);

    (state.trains || []).forEach(train=>{
      (train?.requests || []).forEach(req=>{
        if(!req) return;
        req.item = renameIfMatch(req.item || "");
      });
    });
    (state.plane?.rows || []).forEach(row=>{
      (row?.slots || []).forEach(slot=>{
        if(!slot) return;
        slot.item = renameIfMatch(slot.item || "");
      });
    });
    (state.helicopterOrders || []).forEach(order=>{
      (order?.slots || []).forEach(slot=>{
        if(!slot) return;
        slot.item = renameIfMatch(slot.item || "");
      });
    });
    (state.transport || []).forEach(t=>{
      (t?.requests || []).forEach(req=>{
        if(!req) return;
        if(typeof req.name === "string") req.name = renameIfMatch(req.name);
      });
    });
    (state.factories || []).forEach(factory=>{
      (factory?.products || []).forEach(product=>{
        (product?.inputs || []).forEach(input=>{
          if(!input) return;
          if(typeof input.item === "string") input.item = renameIfMatch(input.item);
        });
      });
    });
    (state.farm?.animalBuildings || []).forEach(building=>{
      if(!building) return;
      if(typeof building.feedItem === "string") building.feedItem = renameIfMatch(building.feedItem);
    });
  }
  function renameBarnItemById(itemId, nextNameRaw){
    const nextName = String(nextNameRaw || "").trim();
    if(!nextName) throw new Error("Name required");
    const idx = state.barn.findIndex(x=>x.id===itemId);
    if(idx < 0) throw new Error("Item not found.");
    const currentItem = state.barn[idx];
    const oldName = String(currentItem?.name || "").trim();
    const oldKey = normalizeItemKey(oldName);
    const newKey = normalizeItemKey(nextName);
    if(!newKey) throw new Error("Name required");

    const existingIdx = state.barn.findIndex((x, i)=>i!==idx && normalizeItemKey(x?.name)===newKey);
    if(existingIdx >= 0){
      const existing = state.barn[existingIdx];
      existing.qty = Math.max(0, Number(existing?.qty || 0)) + Math.max(0, Number(currentItem?.qty || 0));
      const existingCategory = String(existing?.category || "").trim();
      const currentCategory = String(currentItem?.category || "").trim();
      if(!existingCategory && currentCategory){
        existing.category = currentItem.category;
      }
      state.barn.splice(idx, 1);
    }else{
      currentItem.name = nextName;
    }

    renameItemEverywhere(oldName, nextName);

    if(oldKey && newKey && oldKey !== newKey){
      const shouldPinNew = pinnedSet.has(oldKey) || pinnedSet.has(newKey);
      pinnedSet.delete(oldKey);
      if(shouldPinNew) pinnedSet.add(newKey);
      inventoryPriority.pinnedItems = Array.from(pinnedSet);
      saveInventoryPriority();
    }else{
      save();
    }
  }
  function getNeededNowMap(){
    const needed = new Map();
    function addNeed(item, qty){
      const key = normalizeItemKey(item);
      const q = Number.isFinite(Number(qty)) ? Math.max(0, Math.floor(Number(qty))) : 0;
      if(!key || q<=0) return;
      needed.set(key, Number(needed.get(key) || 0) + q);
    }
    (state.trains || []).forEach(train=>{
      (train?.requests || []).forEach(req=>addNeed(req?.item, req?.qty));
    });
    (state.plane?.rows || []).forEach(row=>{
      (row?.slots || []).forEach(slot=>addNeed(slot?.item, slot?.qty));
    });
    (state.helicopterOrders || []).forEach(order=>{
      if(order?.status === "Refreshing") return;
      (order?.slots || []).forEach(slot=>addNeed(slot?.item, slot?.qty));
    });
    return needed;
  }
  const neededNowMap = getNeededNowMap();
  const pinnedSet = new Set(inventoryPriority.pinnedItems || []);

  const top = document.createElement("div");
  top.className = "card";
  const totalQty = state.barn.reduce((a,b)=>a+(Number(b.qty)||0),0);
  top.innerHTML = `
    <div class="card-head">
      <div>
        <div class="card-title">Inventory</div>
        <div class="small">Total quantity: <b>${totalQty}</b></div>
      </div>
      <div class="row">
        <button class="primary" id="btnAddBarn">+ Add Item</button>
      </div>
    </div>
    <div class="row" style="margin-top:10px; gap:12px">
      <label class="field" style="flex:1">Search
        <input id="barnSearch" type="text" placeholder="Search items..." />
      </label>
      <label class="field" style="width:220px">Category
        <select id="barnCat">
          ${categoryOptionsHtml(true)}
        </select>
      </label>
      <label class="field" style="width:170px">View
        <select id="inventoryViewMode">
          <option value="all" ${inventoryPriority.view==="all" ? "selected" : ""}>All</option>
          <option value="priority" ${inventoryPriority.view==="priority" ? "selected" : ""}>Priority</option>
        </select>
      </label>
      <label class="field" style="width:170px">Show
        <select id="inventoryQtyFilter">
          <option value="all">All</option>
          <option value="zero">Zero only</option>
        </select>
      </label>
    </div>
  `;

  const tableCard = document.createElement("div");
  tableCard.className = "card";
  tableCard.innerHTML = `
    <div id="barnList" class="inventory-grid"></div>
    <div class="small" style="margin-top:8px">Tip: use + / − to adjust quickly.</div>
  `;

  content.innerHTML = "";
  content.appendChild(top);
  content.appendChild(tableCard);

  const listEl = $("#barnList");
  const search = $("#barnSearch");
  const cat = $("#barnCat");
  const viewMode = $("#inventoryViewMode");
  const qtyFilter = $("#inventoryQtyFilter");
  function isPinned(item){
    return pinnedSet.has(normalizeItemKey(item?.name));
  }
  function isNeededNow(item){
    const key = normalizeItemKey(item?.name);
    return Number(neededNowMap.get(key) || 0) > 0;
  }
  const foundryProductNames = new Set(
    (state.factories || [])
      .filter(f=>isFoundryFactory(f))
      .flatMap(f=>Array.isArray(f?.products) ? f.products : [])
      .map(p=>normalizeItemKey(p?.name))
      .filter(Boolean)
  );
  function classifyInventoryCategory(item){
    const name = String(item?.name || "").trim();
    const nameKey = normalizeItemKey(name);
    const storedCategory = String(item?.category || "").trim().toLowerCase();
    const sourceMeta = String(item?.source || item?.sourceName || "").trim().toLowerCase();
    if(/\bingot\b/i.test(name)) return "Ingots";
    if(storedCategory==="foundry" || sourceMeta==="foundry") return "Ingots";
    if(nameKey && foundryProductNames.has(nameKey)) return "Ingots";
    if(/\bfeed\b/i.test(name)) return "Feed";
    return String(item?.category || "Products");
  }
  function buildRowModel(item){
    const qty = Math.max(0, Number(item?.qty || 0));
    const pinned = isPinned(item);
    const neededNow = isNeededNow(item);
    return {
      ...item,
      qty,
      pinned,
      neededNow,
      displayCategory: classifyInventoryCategory(item),
      key: normalizeItemKey(item?.name),
    };
  }
  function rowSort(a,b){
    if(a.pinned!==b.pinned) return a.pinned ? -1 : 1;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {sensitivity:"base"});
  }
  function renderInventoryRow(i){
    const chips = [
      i.pinned ? `<span class="pill pinned inv-chip" title="Pinned">⭐</span>` : "",
      i.neededNow ? `<span class="pill needed inv-chip" title="Needed now">🤖</span>` : "",
    ].filter(Boolean).join("");
    return `
      <div class="card inventory-item-card">
        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
          <button class="icon pin-toggle ${i.pinned ? "pin-on" : ""}" data-pin-item="${i.id}" title="${i.pinned ? "Unpin item" : "Pin item"}">${i.pinned ? "★" : "☆"}</button>
          <b>${escapeHtml(i.name)}</b>
          <span class="row inventory-chip-row">${chips}</span>
          <div class="spacer"></div>
          <span class="pill">${escapeHtml(i.displayCategory || i.category)}</span>
          <span class="pill">${Number(i.qty||0)}</span>
        </div>
        <div class="row" style="justify-content:flex-end; margin-top:8px; gap:8px; flex-wrap:wrap">
          <button class="secondary" data-bminus="${i.id}">−</button>
          <button class="secondary" data-bplus="${i.id}">+</button>
          <button class="icon" data-brename="${i.id}" title="Rename">✎</button>
          <button class="danger" data-bdel="${i.id}">Delete</button>
        </div>
      </div>
    `;
  }

  function draw(){
    const q = (search.value||"").trim().toLowerCase();
    const c = cat.value;
    const onlyZero = qtyFilter?.value === "zero";
    const rows = state.barn
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .filter(i => !onlyZero || Number(i.qty||0)===0)
      .map(buildRowModel)
      .filter(i => (c==="All" || i.displayCategory===c));

    if(inventoryPriority.view==="priority"){
      const priorityRows = rows.filter(r=>r.pinned || r.neededNow);
      const pinned = priorityRows.filter(r=>r.pinned).sort(rowSort);
      const neededNow = priorityRows.filter(r=>!r.pinned && r.neededNow).sort(rowSort);
      const sections = [
        {label:"Pinned", items:pinned},
        {label:"Needed Now", items:neededNow},
      ].filter(s=>s.items.length);
      listEl.innerHTML = sections.length
        ? sections.map(sec=>`
          <div class="inventory-group-row inventory-grid-span"><div class="small"><b>${escapeHtml(sec.label)}</b></div></div>
          ${sec.items.map(renderInventoryRow).join("")}
        `).join("")
        : `<div class="small inventory-grid-span">No priority items match current filters.</div>`;
    }else{
      const sorted = rows.sort(rowSort);
      listEl.innerHTML = sorted.length
        ? sorted.map(renderInventoryRow).join("")
        : `<div class="small inventory-grid-span">Inventory is empty. Collect from timers or add items.</div>`;
    }

    $$("[data-pin-item]").forEach(btn=>btn.onclick=()=>{
      const item = state.barn.find(x=>x.id===btn.dataset.pinItem);
      if(!item) return;
      const key = normalizeItemKey(item.name);
      if(!key) return;
      if(pinnedSet.has(key)) pinnedSet.delete(key);
      else pinnedSet.add(key);
      inventoryPriority.pinnedItems = Array.from(pinnedSet);
      saveInventoryPriority();
      draw();
    });

    $$("[data-bminus]").forEach(b=>b.onclick=()=>{
      const it = state.barn.find(x=>x.id===b.dataset.bminus);
      if(!it) return;
      it.qty = Math.max(0, Number(it.qty||0)-1);
      save(); draw();
    });
    $$("[data-bplus]").forEach(b=>b.onclick=()=>{
      const it = state.barn.find(x=>x.id===b.dataset.bplus);
      if(!it) return;
      it.qty = Number(it.qty||0)+1;
      save(); draw();
    });
    $$("[data-brename]").forEach(b=>b.onclick=()=>{
      const it = state.barn.find(x=>x.id===b.dataset.brename);
      if(!it) return;
      openModal({
        title: "Rename item",
        primaryText: "Save",
        bodyHtml: `
          <label class="field">Name
            <input id="barnRenameName" data-item-input="true" type="text" value="${escapeAttr(it.name || "")}" />
          </label>
        `,
        onSave: ()=>{
          const nameEl = modalBody?.querySelector?.("#barnRenameName");
          const nextName = (nameEl?.value || "").trim();
          if(!nextName) throw new Error("Name required");
          renameBarnItemById(it.id, nextName);
          renderBarn();
        }
      });
    });
    $$("[data-bdel]").forEach(b=>b.onclick=()=>{
      const idx = state.barn.findIndex(x=>x.id===b.dataset.bdel);
      if(idx>=0){
        const removed = state.barn[idx];
        const key = normalizeItemKey(removed?.name);
        if(key){
          pinnedSet.delete(key);
          inventoryPriority.pinnedItems = Array.from(pinnedSet);
        }
        state.barn.splice(idx,1);
        saveInventoryPriority();
        draw();
      }
    });
  }

  search.oninput = draw;
  cat.onchange = draw;
  if(qtyFilter) qtyFilter.onchange = draw;
  if(viewMode){
    viewMode.onchange = ()=>{
      inventoryPriority.view = viewMode.value==="priority" ? "priority" : "all";
      saveInventoryPriority();
      draw();
    };
  }
  document.getElementById("btnAddBarn")?.addEventListener("click", () => openModal({
    title: "Add Inventory Item",
    primaryText: "Add",
    bodyHtml: `
      <label class="field">Item name
        <input id="barnName" data-item-input="true" type="text" />
      </label>
      <label class="field">Category
        <select id="barnCat2"></select>
      </label>
      <label class="field">Quantity
        <input id="barnQty" type="number" min="0" step="1" value="1" />
      </label>
    `,
    onOpen: () => {
      const barnCat2 = modalBody?.querySelector?.("#barnCat2");
      if (barnCat2){
        barnCat2.innerHTML = categoryOptionsHtml(false);
        // If the UI uses a custom select wrapper, ensure it refreshes after options are injected.
        if (typeof refreshCustomDropdown === "function"){
          refreshCustomDropdown(barnCat2);
        }
      }
    },
    onSave: () => {
      const nameEl = modalBody?.querySelector?.("#barnName");
      const catEl  = modalBody?.querySelector?.("#barnCat2");
      const qtyEl  = modalBody?.querySelector?.("#barnQty");

      const name = (nameEl?.value || "").trim();
      const category = catEl?.value || "Products";
      const qty = Number(qtyEl?.value || 0);

      if (!name) throw new Error("Name required");
      upsertBarnItem(name, category, qty);
      render();
    }
  }));

  draw();
}

function renderFarm(){
  const content = $("#content");
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  const boosters = settings.boosters || defaultBoosters();
  const farm = state.farm && typeof state.farm==="object" ? state.farm : {animalBuildings:[]};
  state.farm = farm;
  const animalBuildings = Array.isArray(farm.animalBuildings) ? farm.animalBuildings : [];

  function getBarnQtyByName(itemName){
    const key = normalizeItemKey(itemName);
    if(!key) return 0;
    return (state.barn || []).reduce((sum, b)=>{
      if(normalizeItemKey(b?.name)!==key) return sum;
      return sum + Math.max(0, Number(b?.qty || 0));
    }, 0);
  }
  function deductFromBarn(itemName, qty){
    let remaining = Math.max(0, Math.floor(Number(qty || 0)));
    if(remaining<=0) return true;
    const key = normalizeItemKey(itemName);
    for(const b of (state.barn || [])){
      if(remaining<=0) break;
      if(normalizeItemKey(b?.name)!==key) continue;
      const available = Math.max(0, Number(b?.qty || 0));
      const take = Math.min(available, remaining);
      if(take<=0) continue;
      b.qty = Math.max(0, available - take);
      remaining -= take;
    }
    return remaining<=0;
  }
  function endClock(ms){
    if(!ms) return "-";
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function getBuildingFeedItemName(building){
    const id = String(building?.id || "").trim().toLowerCase();
    const name = String(building?.name || "").trim().toLowerCase();
    if(id==="cowshed" || name.includes("cowshed")) return "Cow Feed";
    if(id==="chicken" || name.includes("chicken coop")) return "Chicken Feed";
    if(id==="sheep" || name.includes("sheep farm")) return "Sheep Feed";
    return String(building?.feedItem || "").trim();
  }
  function getFeedStatusIcon(building, feedAmountEntered){
    const need = Math.max(0, Math.floor(Number(feedAmountEntered || 0)));
    if(need===0) return "";
    const feedItem = getBuildingFeedItemName(building);
    const feedQtyInInventory = getBarnQtyByName(feedItem);
    if(feedQtyInInventory===0) return "⛔";
    if(feedQtyInInventory < need) return "⚠️";
    return "✅";
  }
  function buildingFormHtml(b){
    const dur = Math.max(0, Math.floor(Number(b?.durationMin || 0)));
    const h = Math.floor(dur / 60);
    const m = dur % 60;
    return `
      <label class="field">Name
        <input id="abName" type="text" value="${escapeAttr(b?.name || "")}" />
      </label>
      <label class="field">Product
        <input id="abProduct" type="text" value="${escapeAttr(b?.product || "")}" />
      </label>
      <label class="field">Feed Item
        <input id="abFeedItem" type="text" value="${escapeAttr(b?.feedItem || "")}" />
      </label>
      <div class="row" style="gap:8px">
        <label class="field" style="flex:1">Duration Hours
          <input id="abDurH" type="number" min="0" step="1" value="${h}" />
        </label>
        <label class="field" style="flex:1">Duration Minutes
          <input id="abDurM" type="number" min="0" max="59" step="1" value="${m}" />
        </label>
      </div>
      <label class="field">Capacity
        <input id="abCapacity" type="number" min="1" step="1" value="${Math.max(1, Math.floor(Number(b?.capacity || 1)))}" />
      </label>
    `;
  }
  function readBuildingForm(){
    const name = $("#abName").value.trim();
    const product = $("#abProduct").value.trim();
    const feedItem = $("#abFeedItem").value.trim();
    const h = Math.max(0, Math.floor(Number($("#abDurH").value || 0)));
    const mRaw = Math.floor(Number($("#abDurM").value || 0));
    const m = Math.max(0, Math.min(59, Number.isFinite(mRaw) ? mRaw : 0));
    const capacity = Math.max(1, Math.floor(Number($("#abCapacity").value || 1)));
    if(!name) throw new Error("Name required");
    if(!product) throw new Error("Product required");
    if(!feedItem) throw new Error("Feed item required");
    return {
      name,
      product,
      feedItem,
      durationMin: (h * 60) + m,
      capacity,
    };
  }
  function slugifyId(name){
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `animal-${uid()}`;
  }

  const wrap = document.createElement("div");
  wrap.className = "content";
  wrap.innerHTML = `
    <div class="card">
      <div class="card-head">
          <div>
            <div class="card-title">Animal Buildings</div>
            <div class="small">${animalBuildings.length} buildings</div>
            ${boosters.advancedFarming?.enabled ? `<div class="small">Boosters: Advanced Farming active (x2 output) • ${escapeHtml(getBoosterEndsInLabel("advancedFarming", settings) || "")}</div>` : ``}
          </div>
          <div class="row">
            <label class="row small" style="gap:6px; align-items:center; margin:0">
              <input id="toggleAdvancedFarming" class="booster-toggle" type="checkbox" ${boosters.advancedFarming?.enabled ? "checked" : ""} />
              Advanced Farming (x2 output) ${boosters.advancedFarming?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("advancedFarming", settings))}</span>` : ``}
            </label>
            <button class="primary" id="btnAddAnimalBuilding">+ Add Animal Building</button>
          </div>
        </div>
    </div>
    ${animalBuildings.map(b=>{
    const capacity = Math.max(1, Math.floor(Number(b.capacity || 1)));
    const jobs = Array.isArray(b.jobs) ? b.jobs : [];
    const running = jobs.length;
    const free = Math.max(0, capacity - running);
    const activeJobs = [...jobs].sort((a,c)=>Number(a.endMs||0)-Number(c.endMs||0));
    const statusIcon = getFeedStatusIcon(b, 1);
    return `
      <div class="card" data-farm-building="${escapeAttr(b.id)}" data-farm-id="${escapeAttr(b.id)}">
        <div class="card-head">
          <div>
            <div class="card-title"><span data-farm-status-icon="${escapeAttr(b.id)}">${statusIcon ? `${statusIcon} ` : ""}</span>${escapeHtml(b.name)}</div>
            <div class="small">Capacity: ${capacity} • Running: ${running} • Free: ${free}</div>
          </div>
          <div class="row">
            <button class="icon" data-edit-animal="${escapeAttr(b.id)}" title="Edit">✎</button>
            <button class="icon" data-del-animal="${escapeAttr(b.id)}" title="Delete">🗑️</button>
          </div>
        </div>

        <div class="row" style="margin-top:10px; gap:10px; align-items:flex-start; flex-wrap:wrap">
          <div>
            <div><b>${escapeHtml(b.product)}</b></div>
            <div class="small">⏱️ ${fmtMins(b.durationMin)} • Inventory ${escapeHtml(b.feedItem)}: <b>${getBarnQtyByName(b.feedItem)}</b></div>
          </div>
          <div class="row" style="margin-left:auto; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
            <label class="row small" style="gap:6px; align-items:center; margin:0">
              <span>Qty</span>
              <input data-farm-feed-qty="${escapeAttr(b.id)}" data-farm-input type="number" min="1" step="1" value="1" style="width:90px" />
            </label>
            <button class="primary" data-farm-feed="${escapeAttr(b.id)}">Feed</button>
          </div>
        </div>

        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          ${activeJobs.length ? activeJobs.map(job=>`
            <div class="row" style="padding:6px 0">
              <span class="pill progress">In Progress</span>
              <div class="small"><b>1×</b> ${escapeHtml(job.itemName || b.product)} • <span data-end-ms="${Number(job.endMs || 0)}" data-timer-kind="left">${fmtLeft(job.endMs)}</span> left • ends <span data-end-ms="${Number(job.endMs || 0)}" data-timer-kind="endclock">${endClock(job.endMs)}</span></div>
              <div class="spacer"></div>
              <button class="icon" data-delete-farm-job="${job.id}" data-delete-farm-building="${escapeAttr(b.id)}" title="Delete timer">🗑️</button>
            </div>
          `).join("") : ``}
        </div>
      </div>
    `;
  }).join("")}
  `;

  content.innerHTML = "";
  content.appendChild(wrap);

  function refreshFarmStatusIcon(buildingId){
    const b = animalBuildings.find(x=>String(x.id)===String(buildingId));
    if(!b) return;
    const qtyInput = $(`[data-farm-feed-qty="${escapeAttr(b.id)}"]`, wrap);
    const iconEl = $(`[data-farm-status-icon="${escapeAttr(b.id)}"]`, wrap);
    if(!qtyInput || !iconEl) return;
    const entered = Math.max(0, Math.floor(Number(qtyInput.value || 0)));
    const icon = getFeedStatusIcon(b, entered);
    iconEl.textContent = icon ? `${icon} ` : "";
  }
  $$("[data-farm-feed-qty]", wrap).forEach(input=>{
    const buildingId = input.dataset.farmFeedQty;
    const sync = ()=>refreshFarmStatusIcon(buildingId);
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    sync();
  });

  const advancedFarmingToggle = $("#toggleAdvancedFarming", wrap);
  if(advancedFarmingToggle){
    advancedFarmingToggle.onchange = ()=>{
      setBoosterEnabled("advancedFarming", !!advancedFarmingToggle.checked);
      render();
    };
  }

  $("#btnAddAnimalBuilding", wrap).onclick = ()=>{
    openModal({
      title:"Add Animal Building",
      primaryText:"Add",
      bodyHtml: buildingFormHtml({name:"", product:"", feedItem:"", durationMin:60, capacity:6}),
      onSave: ()=>{
        const data = readBuildingForm();
        let id = slugifyId(data.name);
        if(animalBuildings.some(x=>String(x.id)===id)){
          id = `${id}-${uid().slice(0,4)}`;
        }
        animalBuildings.push({...data, id, jobs:[]});
        save();
        render();
      }
    });
  };

  $$("[data-edit-animal]", wrap).forEach(btn=>btn.onclick=()=>{
    const b = animalBuildings.find(x=>x.id===btn.dataset.editAnimal);
    if(!b) return;
    openModal({
      title:`Edit ${b.name}`,
      primaryText:"Save",
      bodyHtml: buildingFormHtml(b),
      onSave: ()=>{
        const data = readBuildingForm();
        const idx = animalBuildings.findIndex(x=>String(x.id)===String(b.id));
        if(idx<0) throw new Error("Building not found.");
        const next = {...animalBuildings[idx], ...data};
        animalBuildings[idx] = next;
        state.farm.animalBuildings[idx] = next;
        save();
        render();
      }
    });
  });
  $$("[data-del-animal]", wrap).forEach(btn=>btn.onclick=()=>{
    const idx = animalBuildings.findIndex(x=>x.id===btn.dataset.delAnimal);
    if(idx<0) return;
    const b = animalBuildings[idx];
    if((b.jobs || []).length>0){
      toast("Cannot delete building with active jobs.");
      return;
    }
    animalBuildings.splice(idx,1);
    save();
    render();
  });

  $$("[data-farm-feed]", wrap).forEach(btn=>btn.onclick=()=>{
    const b = animalBuildings.find(x=>x.id===btn.dataset.farmFeed);
    if(!b) return;
    const qtyInput = $(`[data-farm-feed-qty="${escapeAttr(b.id)}"]`, wrap);
    const qtyReq = Math.max(0, Math.floor(Number(qtyInput?.value || 0)));
    if(qtyReq<=0){
      toast("Qty must be > 0");
      return;
    }
    const capacity = Math.max(1, Math.floor(Number(b.capacity || 1)));
    const running = (b.jobs || []).length;
    const free = Math.max(0, capacity - running);
    if(qtyReq > free){
      toast("Not enough empty slots.");
      return;
    }
    const feedQty = getBarnQtyByName(b.feedItem);
    if(feedQty < qtyReq){
      toast(`Not enough ${b.feedItem} in Inventory.`);
      return;
    }
    if(!deductFromBarn(b.feedItem, qtyReq)){
      toast(`Could not deduct ${b.feedItem}.`);
      return;
    }

    const start = nowMs();
    const durationMin = Math.max(0, Math.floor(Number(b.durationMin || 0)));
    b.jobs = b.jobs || [];
    for(let i=0; i<qtyReq; i++){
      b.jobs.push({
        id: uid(),
        itemName: b.product,
        startMs: start,
        durationMin,
        endMs: start + minsToMs(durationMin),
        notifiedComplete:false,
      });
    }
    save();
    toast(`Fed ${qtyReq} for ${b.name}.`);
    render();
  });

  $$("[data-delete-farm-job]", wrap).forEach(btn=>btn.onclick=()=>{
    const buildingId = btn.dataset.deleteFarmBuilding;
    const b = animalBuildings.find(x=>x.id===buildingId);
    if(!b || !Array.isArray(b.jobs)) return;
    const idx = b.jobs.findIndex(j=>j.id===btn.dataset.deleteFarmJob);
    if(idx>=0){
      b.jobs.splice(idx,1);
      save();
      render();
    }
  });
}

function renderFoundries(){
  const content = $("#content");
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  const boosters = settings.boosters || defaultBoosters();
  const foundriesForDisplay = [...state.factories]
    .filter(f=>isFoundryFactory(f))
    .sort((a,b)=>
      String(a?.name||"").trim().localeCompare(String(b?.name||"").trim(), undefined, {sensitivity:"base"})
    );
  const foundryNameSet = new Set(foundriesForDisplay.map(f=>String(f?.name || "")));
  if(foundryNameSet.size){
    const before = state.jobs.length;
    state.jobs = state.jobs.filter(j=>!(j.type==="Factory" && j.status==="Queued" && foundryNameSet.has(String(j.sourceName || ""))));
    if(state.jobs.length !== before){
      save();
    }
  }

  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = `
    <div class="card-head">
      <div>
        <div class="card-title">Foundries</div>
        <div class="small">Manage foundry products with single-slot timing (no queue).</div>
        ${boosters.efficientSmelting?.enabled ? `<div class="small">Boosters: Efficient Smelting active (-50% time) • ${escapeHtml(getBoosterEndsInLabel("efficientSmelting", settings) || "")}</div>` : ``}
      </div>
      <div class="row">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="toggleEfficientSmelting" class="booster-toggle" type="checkbox" ${boosters.efficientSmelting?.enabled ? "checked" : ""} />
          Efficient Smelting (-50% time) ${boosters.efficientSmelting?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("efficientSmelting", settings))}</span>` : ``}
        </label>
        <button class="primary" id="btnAddFoundry">+ Foundry</button>
      </div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.className = "content";
  wrap.style.gap = "12px";

  foundriesForDisplay.forEach(f=>{
    const runningCount = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="In Progress").length;
    const runningJob = state.jobs
      .filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="In Progress")
      .sort((a,b)=>Number(a.endMs||0)-Number(b.endMs||0))[0] || null;
    const foundryBusy = runningCount >= 1;
    const fac = document.createElement("div");
    fac.className = "card";
    fac.setAttribute("data-factory-id", String(f.id || ""));
    fac.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${escapeHtml(f.name)}</div>
          <div class="small">${f.products.length} products</div>
          <div class="small">Status: ${runningJob
            ? `Smelting: ${escapeHtml(runningJob.itemName || "Product")} • <span data-end-ms="${Number(runningJob.endMs || 0)}" data-timer-kind="left">${fmtLeft(runningJob.endMs)}</span>`
            : "Idle"}</div>
        </div>
        <div class="row">
          <button class="icon" title="Edit foundry" data-edit-factory="${f.id}">✎</button>
          <button class="icon" title="Delete foundry" data-del-factory="${f.id}">🗑️</button>
          <label class="small factory-speed-wrap">Speed: -
            <input
              class="factory-speed-input"
              type="number"
              min="0"
              max="99"
              step="1"
              value="${getFactorySpeedBonusPct(f)}"
              data-factory-speed="${f.id}"
            /> %
          </label>
          <button class="primary" data-add-product="${f.id}">+ Product</button>
        </div>
      </div>
      <div style="margin-top:10px" class="grid foundry-products-grid">
        ${f.products.map(p=>productCard(f,p,{queueEnabled:false, disableStart:foundryBusy, showBusyHint:false, startDisabledTitle:"Foundry is busy"})).join("")}
      </div>
    `;
    wrap.appendChild(fac);
  });

  content.innerHTML = "";
  content.appendChild(top);
  content.appendChild(wrap);

  const smeltingToggle = $("#toggleEfficientSmelting", top);
  if(smeltingToggle){
    smeltingToggle.onchange = ()=>{
      setBoosterEnabled("efficientSmelting", !!smeltingToggle.checked);
      render();
    };
  }
  $("#btnAddFoundry").onclick = ()=>openModal({
    title:"Add Foundry",
    primaryText:"Add",
    bodyHtml: `
      <label class="field">Foundry name
        <input id="factoryName" type="text" value="" placeholder="Foundry" />
      </label>
    `,
    onSave: ()=>{
      const name = $("#factoryName").value.trim() || "Foundry";
      state.factories.push({id: uid(), name, speedBonusPct:0, products:[]});
      save(); render();
    }
  });

  $$("[data-edit-factory]").forEach(btn=>{
    btn.onclick = ()=>{
      const f = state.factories.find(x=>x.id===btn.dataset.editFactory);
      if(!f) return;
      openModal({
        title:"Edit Foundry",
        bodyHtml:`<label class="field">Foundry name
          <input id="factoryName" type="text" value="${escapeAttr(f.name)}" />
        </label>`,
        onSave: ()=>{
          const oldName = f.name;
          const name = $("#factoryName").value.trim();
          if(!name) throw new Error("Name required");
          f.name = name;
          state.jobs.forEach(j=>{ if(j.type==="Factory" && j.sourceName===oldName) j.sourceName = name; });
          save(); render();
        }
      });
    };
  });

  $$("[data-del-factory]").forEach(btn=>{
    btn.onclick = ()=>{
      const idx = state.factories.findIndex(x=>x.id===btn.dataset.delFactory);
      if(idx>=0){
        state.factories.splice(idx,1);
        save(); render();
      }
    };
  });

  $$("[data-factory-speed]").forEach(input=>{
    input.onchange = ()=>{
      const f = state.factories.find(x=>x.id===input.dataset.factorySpeed);
      if(!f) return;
      const next = clampFactorySpeedBonusPct(input.value);
      input.value = String(next);
      if(Number(f.speedBonusPct || 0) === next) return;
      f.speedBonusPct = next;
      save();
      render();
    };
  });

  $$("[data-add-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const f = state.factories.find(x=>x.id===btn.dataset.addProduct);
      if(!f) return;
      openModal({
        title:`Add Product (${f.name})`,
        primaryText:"Add",
        bodyHtml: productFormHtml({name:"", durationMin:10}, f),
        onSave: ()=>{
          const v = readProductForm(f);
          f.products.push({id: uid(), ...v});
          save(); render();
        }
      });
    };
  });

  $$("[data-edit-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const p = f?.products.find(x=>x.id===pId);
      if(!f || !p) return;
      openModal({
        title:`Edit Product (${f.name})`,
        bodyHtml: productFormHtml(p, f),
        onSave: ()=>{
          Object.assign(p, readProductForm(f));
          save(); render();
        }
      });
    };
  });

  $$("[data-del-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const idx = f?.products.findIndex(x=>x.id===pId) ?? -1;
      if(idx>=0){
        f.products.splice(idx,1);
        save(); render();
      }
    };
  });

  function startFactoryProductTimer(f,p){
    const running = state.jobs.filter(j=>j.type==="Factory" && j.sourceName===f.name && j.status==="In Progress").length;
    if(running >= 1){
      toast("Foundry is busy.");
      return;
    }
    const adjustedDurationSeconds = getAdjustedFactoryDurationSeconds(p.durationMin, f);
    const created = createFactoryJob({
      factoryName:f.name,
      productName:p.name,
      durationSeconds:adjustedDurationSeconds,
      qty: 1,
      outputQty: getProductOutputQty(f, p),
      allowQueue:false,
    });
    if(!created){
      toast("Foundry is busy.");
      return;
    }
    const reserveResult = reserveIngredientsForFactoryJob(created, getFactoryProductInputs(p), {factoryId: f.id, factoryName: f.name});
    if(!reserveResult.ok){
      state.jobs = (state.jobs || []).filter(j=>j.id !== created.id);
      save();
      if(reserveResult.reason==="missing") showMissingFactoryIngredientsModal(reserveResult.missing);
      return;
    }
    render();
  }

  $$("[data-start-product]").forEach(btn=>{
    btn.onclick = ()=>{
      const fId = btn.dataset.fid;
      const pId = btn.dataset.pid;
      const f = state.factories.find(x=>x.id===fId);
      const p = f?.products.find(x=>x.id===pId);
      if(!f || !p) return;

      const inputs = getFactoryProductInputs(p);

      if(inputs.length===0){
        startFactoryProductTimer(f,p);
        return;
      }

      const barnMap = buildAvailableBarnQtyMap();

      const checks = inputs.map(inp=>{
        const availableQty = Number(barnMap.get(normalizeItemKey(inp.item)) || 0);
        const short = Math.max(0, inp.qty - availableQty);
        return {...inp, availableQty, short};
      });
      const missing = checks.filter(c=>c.short > 0);

      if(missing.length===0){
        startFactoryProductTimer(f,p);
        return;
      }

      showMissingFactoryIngredientsModal(missing);
    };
  });

  $$("[data-collect]").forEach(b=>b.onclick=()=>collectJob(b.dataset.collect));
  $$("[data-delete-job]").forEach(b=>b.onclick=()=>{
    const idx = state.jobs.findIndex(x=>x.id===b.dataset.deleteJob);
    if(idx>=0){
      releaseReservation(state.jobs[idx]?.id);
      state.jobs.splice(idx,1);
      save(); render();
    }
  });
}

function renderTransport(){
  const content = $("#content");
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  const boosters = settings.boosters || defaultBoosters();
  state.trains = normalizeTrains(state.trains);
  state.plane = normalizePlane(state.plane);
  state.helicopterOrders = normalizeHelicopterOrders(state.helicopterOrders);
  state.ships = normalizeShips(state.ships);

  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = `
    <div class="card-head">
      <div>
        <div class="card-title">Transport</div>
        <div class="small">Trains, Plane, Helicopter, Ships, and existing transport requests</div>
        ${boosters.favorableVoyage?.enabled ? `<div class="small">Boosters: Favorable Voyage active • ${escapeHtml(getBoosterEndsInLabel("favorableVoyage", settings) || "")}</div>` : ``}
      </div>
      ${transportTab==="other" ? `
      <div class="row">
        <button class="primary" id="btnAddTransport">+ Add Transport</button>
      </div>` : ""}
    </div>
    <div class="row" style="margin-top:10px; gap:8px">
      <label class="row small" style="gap:6px; align-items:center; margin:0">
        <input id="toggleFavorableVoyage" class="booster-toggle" type="checkbox" ${boosters.favorableVoyage?.enabled ? "checked" : ""} />
        Favorable Voyage (store only) ${boosters.favorableVoyage?.enabled ? `<span class="small">${escapeHtml(getBoosterEndsInLabel("favorableVoyage", settings))}</span>` : ``}
      </label>
    </div>
    <div class="row" style="margin-top:10px; gap:8px">
      <button class="${transportTab==="trains" ? "primary" : "secondary"}" data-transport-tab="trains">Trains</button>
      <button class="${transportTab==="plane" ? "primary" : "secondary"}" data-transport-tab="plane">Plane</button>
      <button class="${transportTab==="helicopter" ? "primary" : "secondary"}" data-transport-tab="helicopter">Helicopter</button>
      <button class="${transportTab==="ships" ? "primary" : "secondary"}" data-transport-tab="ships">Ships</button>
      <button class="${transportTab==="other" ? "primary" : "secondary"}" data-transport-tab="other">Other Transport</button>
    </div>
    ${transportTab==="other" ? `
    <div class="row" style="margin-top:10px; gap:8px">
      <span class="badge">Filter:</span>
      <button class="secondary ${transportFilter==="All" ? "active" : ""}" data-tfilter="All">All</button>
      <button class="secondary ${transportFilter==="Train" ? "active" : ""}" data-tfilter="Train">Trains</button>
      <button class="secondary ${transportFilter==="Helicopter" ? "active" : ""}" data-tfilter="Helicopter">Helicopters</button>
      <button class="secondary ${transportFilter==="Airplane" ? "active" : ""}" data-tfilter="Airplane">Airplanes</button>
      <button class="secondary ${transportFilter==="Islands" ? "active" : ""}" data-tfilter="Islands">Islands</button>
    </div>` : ""}
  `;

  const section = document.createElement("div");
  section.className = "content";

  function drawGeneralTransport(){
    section.innerHTML = "";
    const items = state.transport
      .filter(t=> transportFilter==="All" || t.mode===transportFilter)
      .sort((a,b)=> (a.status===b.status ? 0 : a.status.localeCompare(b.status)));

    if(items.length===0){
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `<div class="small">No transport requests yet.</div>`;
      section.appendChild(empty);
      return;
    }

    items.forEach(t=>{
      const card = document.createElement("div");
      card.className = "card";
      const statusClass = t.status==="Ready" ? "ready" : (t.status==="In Progress" ? "progress" : "pending");
      card.innerHTML = `
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(t.mode)}</div>
            <div class="row" style="margin-top:6px">
              <span class="pill ${statusClass}">${escapeHtml(t.status)}</span>
              <span class="pill">ETA: ${fmtMins(t.etaMin||0)}</span>
            </div>
            ${t.notes ? `<div class="small" style="margin-top:6px">${escapeHtml(t.notes)}</div>` : ""}
          </div>
          <div class="row">
            <button class="icon" data-edit-transport="${t.id}" title="Edit">Edit</button>
            <button class="icon" data-del-transport="${t.id}" title="Delete">Del</button>
          </div>
        </div>

        <hr/>
        <div class="small" style="margin-bottom:6px">Requested items</div>
        <div class="row" style="gap:8px; flex-wrap:wrap">
          ${(t.requests||[]).map(r=>`<span class="badge">${escapeHtml(r.name)} x ${Number(r.qty||0)}</span>`).join("") || `<span class="small">None</span>`}
        </div>

        <div class="row" style="margin-top:12px">
          <button class="secondary" data-add-req="${t.id}">+ Add item</button>
          <div class="spacer"></div>
          ${t.status==="Pending" ? `<button class="primary" data-send="${t.id}">Send</button>` : ""}
          ${t.status==="Ready" ? `<button class="primary" data-complete="${t.id}">Complete</button>` : ""}
        </div>
      `;
      section.appendChild(card);
    });

    $$("[data-edit-transport]").forEach(b=>b.onclick=()=>editTransport(b.dataset.editTransport));
    $$("[data-del-transport]").forEach(b=>b.onclick=()=>{
      const idx = state.transport.findIndex(x=>x.id===b.dataset.delTransport);
      if(idx>=0){
        state.transport.splice(idx,1);
        save();
        drawGeneralTransport();
      }
    });
    $$("[data-add-req]").forEach(b=>b.onclick=()=>addTransportReq(b.dataset.addReq));
    $$("[data-send]").forEach(b=>b.onclick=()=>sendTransport(b.dataset.send));
    $$("[data-complete]").forEach(b=>b.onclick=()=>{
      const t = state.transport.find(x=>x.id===b.dataset.complete);
      if(!t) return;
      t.status = "Completed";
      save();
      render();
    });
  }

  function buildBarnQtyMap(){
    return buildAvailableBarnQtyMap();
  }
  function getBarnQty(itemName, barnMap=null){
    return getAvailableQty(itemName, barnMap);
  }
  function getPriorityShortageMap(priorityTransport){
    const priority = String(priorityTransport || "");
    const required = new Map();
    const addReq = (itemName, qtyRaw)=>{
      const item = String(itemName || "").trim();
      const qty = parseInt(qtyRaw, 10);
      if(!item || !Number.isFinite(qty) || qty<=0) return;
      const key = normalizeItemKey(item);
      if(!key) return;
      required.set(key, Number(required.get(key) || 0) + qty);
    };
    if(priority==="trains"){
      (state.trains || []).forEach(train=>{
        (train?.requests || []).forEach(req=>{
          if(req?.done === true) return;
          addReq(req?.item, req?.qty);
        });
      });
    }else if(priority==="plane"){
      const plane = state.plane;
      (plane?.rows || []).forEach(row=>{
        (row?.slots || []).forEach(slot=>{
          if(slot?.done === true) return;
          addReq(slot?.item, slot?.qty);
        });
      });
    }else if(priority==="helicopter"){
      (state.helicopterOrders || []).forEach(order=>{
        if(order?.status==="Refreshing") return;
        (order?.slots || []).forEach(slot=>{
          addReq(slot?.item, slot?.qty);
        });
      });
    }else{
      return null;
    }
    const barnMap = buildBarnQtyMap();
    const missing = new Map();
    required.forEach((qtyReq, key)=>{
      const have = Number(barnMap.get(key) || 0);
      const short = Math.max(0, qtyReq - have);
      if(short > 0) missing.set(key, short);
    });
    return missing;
  }
  function shouldAllowPriorityAction({transport, action, requestIdOrIndex, items=null}){
    const current = normalizeSettings(state.settings);
    state.settings = current;
    const priority = String(current.transportPriority || "none");
    if(priority==="none" || priority===transport){
      return true;
    }
    const normalizedItems = (Array.isArray(items) ? items : [])
      .map(it=>({
        key: normalizeItemKey(it?.item),
        qty: Math.max(0, Math.floor(Number(it?.qty || 0))),
      }))
      .filter(it=>it.key && it.qty > 0);
    if(normalizedItems.length){
      const shortageMap = getPriorityShortageMap(priority);
      if(shortageMap instanceof Map){
        const conflicts = normalizedItems.some(it=>Number(shortageMap.get(it.key) || 0) > 0);
        if(!conflicts) return true;
      }
    }
    const actionKey = `${String(transport||"")}::${String(action||"")}::${String(requestIdOrIndex||"")}`;
    const override = (current.priorityOverride && typeof current.priorityOverride==="object")
      ? current.priorityOverride
      : {key:"", expiresMs:0};
    const t = nowMs();
    if(String(override.key || "")===actionKey && Number(override.expiresMs || 0) > t){
      state.settings = normalizeSettings({
        ...current,
        priorityOverride: { key:"", expiresMs:0 },
      });
      save();
      return true;
    }
    state.settings = normalizeSettings({
      ...current,
      priorityOverride: { key: actionKey, expiresMs: t + 10000 },
    });
    save();
    const priorityName = priority==="trains"
      ? "train"
      : (priority==="plane"
        ? "plane"
        : (priority==="helicopter" ? "helicopter" : "ship"));
    openModal({
      title: "Priority",
      primaryText: "OK",
      bodyHtml: `<div>Needed for ${escapeHtml(priorityName)}. Click again to override.</div>`,
      onSave: ()=>{},
    });
    return false;
  }
  function shipIngotItemName(ingotType){
    const t = ["Bronze","Silver","Gold","Platinum"].includes(String(ingotType || "")) ? String(ingotType) : "Bronze";
    return `${t} Ingot`;
  }
  function startShipTrip(shipId){
    const ship = (state.ships || []).find(s=>s.id===shipId);
    if(!ship || ship.status!=="Idle") return;
    const hours = Math.max(0, Math.floor(Number(ship.returnHours || 0)));
    const minutes = Math.max(0, Math.min(59, Math.floor(Number(ship.returnMinutes || 0))));
    const totalMin = (hours * 60) + minutes;
    ship.returnHours = hours;
    ship.returnMinutes = minutes;
    if(totalMin<=0){
      ship.status = "Ready";
      ship.endMs = null;
      ship.notifiedComplete = true;
    }else{
      ship.status = "Sailing";
      ship.endMs = nowMs() + minsToMs(totalMin);
      ship.notifiedComplete = false;
    }
    save();
    drawShips();
  }
  function useShipIngot(shipId){
    const ship = (state.ships || []).find(s=>s.id===shipId);
    if(!ship || ship.status!=="Idle" || ship.ingotUsed) return;
    const itemName = shipIngotItemName(ship.ingotType);
    const qtyReq = Math.max(1, Math.floor(Number(ship.ingotQty || 1) || 1));
    if(!shouldAllowPriorityAction({
      transport:"ships",
      action:"ingot",
      requestIdOrIndex:ship.id,
      items:[{item:itemName, qty:qtyReq}],
    })) return;
    const barnMap = buildBarnQtyMap();
    const have = getBarnQty(itemName, barnMap);
    if(have < qtyReq){
      const missingQty = Math.max(0, qtyReq - have);
      openModal({
        title: `Missing ${missingQty}`,
        primaryText: "OK",
        bodyHtml: `<div>${escapeHtml(itemName)}: need ${qtyReq}, have ${have}.</div>`,
        onSave: ()=>{},
      });
      return;
    }
    const itemKey = normalizeItemKey(itemName);
    let remaining = qtyReq;
    for(const b of (state.barn || [])){
      if(remaining<=0) break;
      if(normalizeItemKey(b?.name)!==itemKey) continue;
      const available = Math.max(0, Number(b?.qty || 0));
      const take = Math.min(available, remaining);
      if(take<=0) continue;
      b.qty = available - take;
      remaining -= take;
    }
    if(remaining > 0) return;
    ship.ingotUsed = { item: itemName, qty: qtyReq };
    save();
    drawShips();
  }
  function undoShipIngot(shipId){
    const ship = (state.ships || []).find(s=>s.id===shipId);
    if(!ship || ship.status!=="Sailing" || !ship.ingotUsed) return;
    upsertBarnItem(String(ship.ingotUsed.item || shipIngotItemName(ship.ingotType)), "Materials", Math.max(1, Number(ship.ingotUsed.qty || 1)));
    ship.ingotUsed = null;
    save();
    drawShips();
  }
  function cancelShipTrip(shipId){
    const ship = (state.ships || []).find(s=>s.id===shipId);
    if(!ship || ship.status!=="Sailing") return;
    openModal({
      title: "Cancel trip?",
      primaryText: "Cancel trip",
      cancelText: "Keep sailing",
      bodyHtml: `<div>This will stop the trip. Any used ingot will be returned to inventory.</div>`,
      onSave: ()=>{
        if(ship.ingotUsed){
          upsertBarnItem(
            String(ship.ingotUsed.item || shipIngotItemName(ship.ingotType)),
            "Materials",
            Math.max(1, Number(ship.ingotUsed.qty || 1))
          );
          ship.ingotUsed = null;
        }
        ship.status = "Idle";
        ship.endMs = null;
        ship.notifiedComplete = false;
        save();
        drawShips();
      }
    });
  }
  function collectShipCargo(shipId){
    const ship = (state.ships || []).find(s=>s.id===shipId);
    if(!ship || ship.status!=="Ready") return;
    const cargo = ship.returnCargo || {};
    const peach = Math.max(0, Math.floor(Number(cargo.peach || 0)));
    const plum = Math.max(0, Math.floor(Number(cargo.plum || 0)));
    const watermelon = Math.max(0, Math.floor(Number(cargo.watermelon || 0)));
    if(peach>0) upsertBarnItem("Peach", "Island", peach);
    if(plum>0) upsertBarnItem("Plum", "Island", plum);
    if(watermelon>0) upsertBarnItem("Watermelon", "Island", watermelon);
    ship.returnCargo = { peach: 0, plum: 0, watermelon: 0 };
    ship.status = "Idle";
    ship.endMs = null;
    ship.notifiedComplete = false;
    ship.ingotUsed = null;
    save();
    drawShips();
  }
  function drawShips(){
    section.innerHTML = "";
    const ships = state.ships || [];
    const shipBarnMap = buildBarnQtyMap();
    const wrap = document.createElement("div");
    wrap.className = "content";
    wrap.innerHTML = ships.map((ship, idx)=>{
      const statusClass = ship.status==="Ready" ? "ready" : (ship.status==="Sailing" ? "progress" : "pending");
      const statusText = ship.status==="Sailing"
        ? `Returning in <span data-end-ms="${Number(ship.endMs || 0)}" data-timer-kind="countdown">${fmtCountdown(ship.endMs)}</span>`
        : (ship.status==="Ready" ? "Ready" : "Idle");
      const ingotLocked = !!ship.ingotUsed || ship.status==="Sailing" || ship.status==="Ready";
      const ingotUsedText = ship.ingotUsed
        ? `<div class="small" style="margin-top:6px"><span class="pill progress">Ingot used: ${escapeHtml(ship.ingotUsed.item)} × ${Math.max(1, Number(ship.ingotUsed.qty || 1))}</span></div>`
        : ``;
      const bronzeHave = getBarnQty("Bronze Ingot", shipBarnMap);
      const silverHave = getBarnQty("Silver Ingot", shipBarnMap);
      const goldHave = getBarnQty("Gold Ingot", shipBarnMap);
      const platinumHave = getBarnQty("Platinum Ingot", shipBarnMap);
      const cargo = ship.returnCargo || {peach:0, plum:0, watermelon:0};
      return `
        <div class="card" id="ship-card-${escapeAttr(ship.id)}">
          <div class="card-head">
            <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap; width:100%">
              <div class="card-title">${escapeHtml(ship.name || `Ship ${idx+1}`)}</div>
              <span class="pill ${statusClass}">${statusText}</span>
              <div class="spacer"></div>
              <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
                <span class="small">Return</span>
                <input data-ship-hours="${ship.id}" type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(ship.returnHours||0)))}" ${ship.status!=="Idle" ? "disabled" : ""} style="width:110px" />
                <span class="small">h</span>
                <input data-ship-minutes="${ship.id}" type="number" min="0" max="59" step="1" value="${Math.max(0, Math.min(59, Math.floor(Number(ship.returnMinutes||0))))}" ${ship.status!=="Idle" ? "disabled" : ""} style="width:110px" />
                <span class="small">m</span>
              </div>
            </div>
          </div>
          <div class="row" style="margin-top:10px; gap:12px; align-items:center; flex-wrap:wrap">
            <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
              <div class="card-title" style="font-size:inherit">Island</div>
              <div class="row" style="gap:6px; align-items:center">
                <select data-ship-island="${ship.id}" ${ship.status!=="Idle" ? "disabled" : ""}>
                  <option value="Fructus Isle" ${ship.island==="Fructus Isle" ? "selected" : ""}>Fructus Isle</option>
                </select>
              </div>
            </div>
            <div class="spacer"></div>
            <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
              <span class="small">Ingot booster</span>
              <label class="field" style="min-width:160px; margin:0">Type
                <select data-ship-ingot-type="${ship.id}" ${ingotLocked ? "disabled" : ""}>
                  <option value="Bronze" class="${bronzeHave===0 ? "ingot-none" : ""}" ${ship.ingotType==="Bronze" ? "selected" : ""}>Bronze (${Math.max(0, Number(bronzeHave || 0))})</option>
                  <option value="Silver" class="${silverHave===0 ? "ingot-none" : ""}" ${ship.ingotType==="Silver" ? "selected" : ""}>Silver (${Math.max(0, Number(silverHave || 0))})</option>
                  <option value="Gold" class="${goldHave===0 ? "ingot-none" : ""}" ${ship.ingotType==="Gold" ? "selected" : ""}>Gold (${Math.max(0, Number(goldHave || 0))})</option>
                  <option value="Platinum" class="${platinumHave===0 ? "ingot-none" : ""}" ${ship.ingotType==="Platinum" ? "selected" : ""}>Platinum (${Math.max(0, Number(platinumHave || 0))})</option>
                </select>
              </label>
              <label class="field" style="width:110px; margin:0">Qty
                <input data-ship-ingot-qty="${ship.id}" type="number" min="1" step="1" value="${Math.max(1, Math.floor(Number(ship.ingotQty||1)))}" ${ingotLocked ? "disabled" : ""} />
              </label>
              <button class="secondary" data-ship-use-ingot="${ship.id}" ${ingotLocked ? "disabled" : ""}>Use ingot</button>
              ${ship.status==="Sailing" && ship.ingotUsed ? `<button class="secondary" data-ship-undo-ingot="${ship.id}">Undo ingot</button>` : ``}
            </div>
          </div>
          ${ingotUsedText}
          ${ship.status==="Ready" ? `
            <div style="margin-top:12px">
              <div class="row" style="align-items:center; gap:10px; flex-wrap:wrap">
                <div class="small">Return cargo:</div>
                <label class="row small" style="gap:6px; align-items:center; margin:0">Peach
                  <input data-ship-cargo-peach="${ship.id}" type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(cargo.peach||0)))}" style="width:86px" />
                </label>
                <label class="row small" style="gap:6px; align-items:center; margin:0">Plum
                  <input data-ship-cargo-plum="${ship.id}" type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(cargo.plum||0)))}" style="width:86px" />
                </label>
                <label class="row small" style="gap:6px; align-items:center; margin:0">Watermelon
                  <input data-ship-cargo-watermelon="${ship.id}" type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(cargo.watermelon||0)))}" style="width:86px" />
                </label>
                <div class="spacer"></div>
                <button class="primary" data-ship-collect="${ship.id}">Collect</button>
              </div>
            </div>
          ` : ``}
          <div class="row" style="margin-top:12px">
            ${ship.status==="Idle" ? `<button class="primary" data-ship-start="${ship.id}">Start Trip</button>` : ``}
            ${ship.status==="Sailing" ? `<button class="secondary" data-ship-cancel="${ship.id}">Cancel Trip</button>` : ``}
          </div>
        </div>
      `;
    }).join("");
    section.appendChild(wrap);

    $$("[data-ship-island]", wrap).forEach(el=>el.onchange=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipIsland);
      if(!ship || ship.status!=="Idle") return;
      ship.island = "Fructus Isle";
      save();
    });
    $$("[data-ship-hours]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipHours);
      if(!ship || ship.status!=="Idle") return;
      ship.returnHours = Math.max(0, Math.floor(Number(el.value || 0)));
      save();
    });
    $$("[data-ship-minutes]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipMinutes);
      if(!ship || ship.status!=="Idle") return;
      ship.returnMinutes = Math.max(0, Math.min(59, Math.floor(Number(el.value || 0))));
      save();
    });
    $$("[data-ship-ingot-type]", wrap).forEach(el=>el.onchange=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipIngotType);
      if(!ship || ship.status!=="Idle" || ship.ingotUsed) return;
      ship.ingotType = ["Bronze","Silver","Gold","Platinum"].includes(String(el.value || "")) ? String(el.value) : "Bronze";
      save();
    });
    $$("[data-ship-ingot-qty]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipIngotQty);
      if(!ship || ship.status!=="Idle" || ship.ingotUsed) return;
      ship.ingotQty = Math.max(1, Math.floor(Number(el.value || 1) || 1));
      save();
    });
    $$("[data-ship-use-ingot]", wrap).forEach(btn=>btn.onclick=()=>useShipIngot(btn.dataset.shipUseIngot));
    $$("[data-ship-undo-ingot]", wrap).forEach(btn=>btn.onclick=()=>undoShipIngot(btn.dataset.shipUndoIngot));
    $$("[data-ship-start]", wrap).forEach(btn=>btn.onclick=()=>startShipTrip(btn.dataset.shipStart));
    $$("[data-ship-cancel]", wrap).forEach(btn=>btn.onclick=()=>cancelShipTrip(btn.dataset.shipCancel));
    $$("[data-ship-collect]", wrap).forEach(btn=>btn.onclick=()=>collectShipCargo(btn.dataset.shipCollect));
    $$("[data-ship-cargo-peach]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipCargoPeach);
      if(!ship || ship.status!=="Ready") return;
      ship.returnCargo.peach = Math.max(0, Math.floor(Number(el.value || 0)));
      save();
    });
    $$("[data-ship-cargo-plum]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipCargoPlum);
      if(!ship || ship.status!=="Ready") return;
      ship.returnCargo.plum = Math.max(0, Math.floor(Number(el.value || 0)));
      save();
    });
    $$("[data-ship-cargo-watermelon]", wrap).forEach(el=>el.oninput=()=>{
      const ship = (state.ships || []).find(s=>s.id===el.dataset.shipCargoWatermelon);
      if(!ship || ship.status!=="Ready") return;
      ship.returnCargo.watermelon = Math.max(0, Math.floor(Number(el.value || 0)));
      save();
    });
  }
  function recomputeTrainChecks(train){
    let changed = false;
    const barnMap = buildBarnQtyMap();
    train.checkResults = train.requests.map((req, idx)=>{
      const item = String(req.item||"").trim();
      const qty = parseInt(req.qty, 10);
      const next = (!item || !Number.isFinite(qty) || qty<=0) ? null : (getBarnQty(item, barnMap) >= qty ? "ready" : "missing");
      if((train.checkResults?.[idx] ?? null) !== next) changed = true;
      return next;
    });
    return changed;
  }

  function syncTrainCheckUI(trainId){
    const train = state.trains.find(t=>t.id===trainId);
    if(!train) return;
    const barnMap = buildBarnQtyMap();
    train.requests.forEach((req, idx)=>{
      const row = $(`[data-train-row="${trainId}:${idx}"]`, section);
      let status = $(`[data-train-row-status="${trainId}:${idx}"]`, section);
      if(!row || !status) return;
      const result = train.checkResults?.[idx] || null;
      const statusKey = `${trainId}:${idx}`;
      const wantsButton = req?.done !== true && result==="ready";
      if(wantsButton && status.tagName!=="BUTTON"){
        const next = document.createElement("button");
        next.type = "button";
        next.dataset.trainRowStatus = statusKey;
        status.replaceWith(next);
        status = next;
      }else if(!wantsButton && status.tagName!=="SPAN"){
        const next = document.createElement("span");
        next.dataset.trainRowStatus = statusKey;
        status.replaceWith(next);
        status = next;
      }
      row.classList.remove("train-req-ready", "train-req-missing");
      if(req?.done === true){
        status.className = "pill progress";
        status.textContent = "Done";
        delete status.dataset.trainRowReady;
      }else if(result==="ready"){
        row.classList.add("train-req-ready");
        status.className = "pill ready";
        status.textContent = "Ready";
        status.dataset.trainRowReady = statusKey;
      }else if(result==="missing"){
        row.classList.add("train-req-missing");
        status.className = "pill missing";
        delete status.dataset.trainRowReady;
        const qtyReq = parseInt(req?.qty, 10);
        const itemName = String(req?.item || "").trim();
        const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
          ? 0
          : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
        status.textContent = missingQty > 0 ? `Missing ${missingQty}` : "Missing";
      }else{
        status.className = "pill";
        status.textContent = "-";
        delete status.dataset.trainRowReady;
      }
    });
  }

  function completeTrainRequest(trainId, rowIdx){
    const train = state.trains.find(t=>t.id===trainId);
    if(!train) return;
    const idx = Math.max(0, Math.floor(Number(rowIdx || 0)));
    const req = train.requests?.[idx];
    if(!req || req.done === true) return;

    const item = String(req?.item || "").trim();
    const qtyReq = parseInt(req?.qty, 10);
    if(!item || !Number.isFinite(qtyReq) || qtyReq<=0) return;

    if((train.checkResults?.[idx] || null) !== "ready") return;

    const barnMap = buildBarnQtyMap();
    const itemKey = normalizeItemKey(item);
    const barnQty = Number(barnMap.get(itemKey) || 0);
    if(barnQty < qtyReq){
      toast(`Not enough ${item} in Inventory.`);
      return;
    }

    let remaining = qtyReq;
    for(const b of (state.barn || [])){
      if(remaining<=0) break;
      if(normalizeItemKey(b?.name)!==itemKey) continue;
      const available = Math.max(0, Number(b?.qty||0));
      const take = Math.min(available, remaining);
      if(take<=0) continue;
      const nextQty = available - take;
      if(nextQty < 0) return;
      b.qty = nextQty;
      remaining -= take;
    }
    if(remaining > 0){
      return;
    }

    req.done = true;
    recomputeTrainChecks(train);
    save();
    drawTrains();
  }

  function sendTrain(trainId){
    const train = state.trains.find(t=>t.id===trainId);
    if(!train) return;

    const barnMap = buildBarnQtyMap();
    const requestedRows = [];
    const missing = [];

    for(const req of (train.requests || [])){
      if(req?.done === true) continue;
      const item = String(req?.item || "").trim();
      if(!item) continue;

      const qtyReq = parseInt(req?.qty, 10);
      if(!Number.isFinite(qtyReq) || qtyReq<=0){
        toast("Qty must be > 0");
        return;
      }

      const itemKey = normalizeItemKey(item);
      const barnQty = Number(barnMap.get(itemKey) || 0);
      if(barnQty < qtyReq){
        missing.push(`${item} needs ${qtyReq - barnQty} more`);
      }

      requestedRows.push({item, itemKey, qtyReq});
    }

    if(missing.length){
      toast(missing[0] || "Not enough items in Inventory.");
      return;
    }

    requestedRows.forEach(req=>{
      let remaining = req.qtyReq;
      for(const b of (state.barn || [])){
        if(remaining<=0) break;
        if(normalizeItemKey(b?.name)!==req.itemKey) continue;
        const available = Math.max(0, Number(b?.qty||0));
        const take = Math.min(available, remaining);
        if(take<=0) continue;
        b.qty = Math.max(0, available - take);
        remaining -= take;
      }
    });

    train.requests = defaultTrainRequests();
    train.checkResults = Array(5).fill(null);
    incrementPlanProgress("trainsSent", 1);
    save();
    drawTrains();
  }
  function startTrainTimer(trainId){
    const train = state.trains.find(t=>t.id===trainId);
    if(!train) return;
    const hours = Math.max(0, Math.floor(Number(train.returnHours||0)));
    const minutes = Math.max(0, Math.min(59, Math.floor(Number(train.returnMinutes||0))));
    const totalMin = (hours * 60) + minutes;
    train.returnHours = hours;
    train.returnMinutes = minutes;
    if(totalMin<=0){
      train.status = "Ready";
      train.endMs = null;
      train.notifiedComplete = true;
      save();
      drawTrains();
      return;
    }
    train.status = "Running";
    train.endMs = nowMs() + minsToMs(totalMin);
    train.notifiedComplete = false;
    save();
    drawTrains();
  }
  function resetTrain(trainId){
    const train = state.trains.find(t=>t.id===trainId);
    if(!train) return;
    train.requests = defaultTrainRequests();
    train.checkResults = Array(5).fill(null);
    train.status = "Idle";
    train.endMs = null;
    train.notifiedComplete = false;
    save();
    drawTrains();
  }

  function drawTrains(){
    section.innerHTML = "";
    let changed = false;
    state.trains.forEach(train=>{
      if(recomputeTrainChecks(train)) changed = true;
    });
    if(changed) save();
    const barnMap = buildBarnQtyMap();

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.innerHTML = state.trains.map(train=>{
      const pillClass = train.status==="Ready" ? "ready" : (train.status==="Running" ? "progress" : "pending");
      const statusText = train.status==="Running"
        ? `Returning in <span data-end-ms="${Number(train.endMs || 0)}" data-timer-kind="countdown">${fmtCountdown(train.endMs)}</span>`
        : (train.status==="Ready" ? "Ready" : "Idle");

      const rowsHtml = train.requests.map((req, idx)=>{
        const result = train.checkResults?.[idx] || null;
        const rowClass = req?.done === true
          ? ""
          : (result==="ready" ? "train-req-ready" : (result==="missing" ? "train-req-missing" : ""));
        const qtyReq = parseInt(req?.qty, 10);
        const itemName = String(req?.item || "").trim();
        const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
          ? 0
          : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
        const statusHtml = req?.done === true
          ? `<span class="pill progress" data-train-row-status="${train.id}:${idx}">Done</span>`
          : (result==="ready"
            ? `<button type="button" class="pill ready" data-train-row-status="${train.id}:${idx}" data-train-row-ready="${train.id}:${idx}">Ready</button>`
            : `<span class="${result==="missing" ? "pill missing" : "pill"}" data-train-row-status="${train.id}:${idx}">${result==="missing" ? (missingQty > 0 ? `Missing ${missingQty}` : "Missing") : "-"}</span>`);
        return `
          <div class="row train-req-row ${rowClass}" id="train-req-${escapeAttr(train.id)}-${idx}" data-train-row="${train.id}:${idx}" style="margin-top:8px; padding:8px; border:1px solid var(--border); border-radius:10px">
            <input data-train-item="${train.id}" data-row="${idx}" data-item-input="true" type="text" placeholder="Item" value="${escapeAttr(req.item||"")}" style="flex:1; min-width:180px" />
            <input data-train-qty="${train.id}" data-row="${idx}" type="number" min="0" step="1" placeholder="Qty" value="${req.qty==="" ? "" : Number(req.qty||0)}" style="width:110px" />
            ${statusHtml}
          </div>
        `;
      }).join("");

      return `
        <div class="card" id="train-card-${escapeAttr(train.id)}" style="grid-column:span 4">
          <div class="card-head">
            <div>
              <div class="row" style="align-items:center; gap:10px">
                <div class="card-title">${escapeHtml(train.name)}</div>
                <div class="spacer"></div>
                <label class="row small" style="gap:6px; align-items:center; margin:0">
                  Return time
                  <input data-train-hours="${train.id}" type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(train.returnHours||0)))}" style="width:90px" />
                  <span class="small">h</span>
                  <input data-train-minutes="${train.id}" type="number" min="0" max="59" step="1" value="${Math.max(0, Math.min(59, Math.floor(Number(train.returnMinutes||0))))}" style="width:90px" />
                  <span class="small">m</span>
                </label>
              </div>
              <div class="row" style="margin-top:6px">
                <span class="pill ${pillClass}">${statusText}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:10px">
            <div class="small">Requests</div>
            ${rowsHtml}
          </div>

          <div class="row" style="margin-top:12px">
            <button class="secondary" data-start-train="${train.id}">Start Timer</button>
            <button class="primary" data-send-train="${train.id}">Send Train</button>
            <button class="secondary" data-reset-train="${train.id}">Reset</button>
          </div>
        </div>
      `;
    }).join("");

    section.appendChild(grid);

    $$("[data-train-hours]").forEach(input=>input.oninput=()=>{
      const train = state.trains.find(t=>t.id===input.dataset.trainHours);
      if(!train) return;
      train.returnHours = Math.max(0, Math.floor(Number(input.value||0)));
      save();
    });
    $$("[data-train-minutes]").forEach(input=>input.oninput=()=>{
      const train = state.trains.find(t=>t.id===input.dataset.trainMinutes);
      if(!train) return;
      train.returnMinutes = Math.max(0, Math.min(59, Math.floor(Number(input.value||0))));
      save();
    });
    $$("[data-train-item]").forEach(input=>input.oninput=()=>{
      const train = state.trains.find(t=>t.id===input.dataset.trainItem);
      if(!train) return;
      const row = Number(input.dataset.row||0);
      if(!train.requests[row]) return;
      train.requests[row].item = input.value;
      train.requests[row].done = false;
      recomputeTrainChecks(train);
      save();
      syncTrainCheckUI(train.id);
    });
    $$("[data-train-qty]").forEach(input=>input.oninput=()=>{
      const train = state.trains.find(t=>t.id===input.dataset.trainQty);
      if(!train) return;
      const row = Number(input.dataset.row||0);
      if(!train.requests[row]) return;
      train.requests[row].qty = input.value==="" ? "" : Math.max(0, Number(input.value||0));
      train.requests[row].done = false;
      recomputeTrainChecks(train);
      save();
      syncTrainCheckUI(train.id);
    });
    $$("[data-train-row-ready]").forEach(btn=>btn.onclick=()=>{
      const [trainId, rowIdx] = String(btn.dataset.trainRowReady || "").split(":");
      const train = state.trains.find(t=>t.id===trainId);
      const req = train?.requests?.[Number(rowIdx || 0)];
      if(!shouldAllowPriorityAction({
        transport:"trains",
        action:"ready",
        requestIdOrIndex:`${trainId}:${rowIdx}`,
        items: req ? [{item:req.item, qty:req.qty}] : [],
      })) return;
      completeTrainRequest(trainId, Number(rowIdx || 0));
    });

    $$("[data-start-train]").forEach(btn=>btn.onclick=()=>startTrainTimer(btn.dataset.startTrain));
    $$("[data-send-train]").forEach(btn=>btn.onclick=()=>{
      const trainId = String(btn.dataset.sendTrain || "");
      const train = state.trains.find(t=>t.id===trainId);
      const items = (train?.requests || [])
        .filter(req=>req?.done !== true)
        .map(req=>({item:req?.item, qty:req?.qty}));
      if(!shouldAllowPriorityAction({transport:"trains", action:"send", requestIdOrIndex:trainId, items})) return;
      sendTrain(btn.dataset.sendTrain);
    });
    $$("[data-reset-train]").forEach(btn=>btn.onclick=()=>resetTrain(btn.dataset.resetTrain));
  }
  function recomputePlaneChecks(plane){
    let changed = false;
    const barnMap = buildBarnQtyMap();
    plane.rows.forEach((row, rowIdx)=>{
      row.checkResults = row.slots.map((slot, slotIdx)=>{
        const item = String(slot.item||"").trim();
        const qty = parseInt(slot.qty, 10);
        const next = (!item || !Number.isFinite(qty) || qty<=0) ? null : (getBarnQty(item, barnMap) >= qty ? "ready" : "missing");
        if((plane.rows?.[rowIdx]?.checkResults?.[slotIdx] ?? null) !== next) changed = true;
        return next;
      });
    });
    return changed;
  }
  function syncPlaneCheckUI(){
    const plane = state.plane;
    if(!plane) return;
    const barnMap = buildBarnQtyMap();
    plane.rows.forEach((rowData, rowIdx)=>{
      rowData.slots.forEach((slotData, slotIdx)=>{
        const slot = $(`[data-plane-slot="${rowIdx}:${slotIdx}"]`, section);
        let status = $(`[data-plane-slot-status="${rowIdx}:${slotIdx}"]`, section);
        if(!slot || !status) return;
        const result = plane.rows?.[rowIdx]?.checkResults?.[slotIdx] || null;
        const statusKey = `${rowIdx}:${slotIdx}`;
        const wantsButton = slotData?.done !== true && result==="ready";
        if(wantsButton && status.tagName!=="BUTTON"){
          const next = document.createElement("button");
          next.type = "button";
          next.dataset.planeSlotStatus = statusKey;
          status.replaceWith(next);
          status = next;
        }else if(!wantsButton && status.tagName!=="SPAN"){
          const next = document.createElement("span");
          next.dataset.planeSlotStatus = statusKey;
          status.replaceWith(next);
          status = next;
        }
        slot.classList.remove("train-req-ready", "train-req-missing");
        if(slotData?.done === true){
          status.className = "pill progress";
          status.textContent = "Done";
          delete status.dataset.planeSlotReady;
        }else if(result==="ready"){
          slot.classList.add("train-req-ready");
          status.className = "pill ready";
          status.textContent = "Ready";
          status.dataset.planeSlotReady = statusKey;
        }else if(result==="missing"){
          slot.classList.add("train-req-missing");
          status.className = "pill missing";
          delete status.dataset.planeSlotReady;
          const qtyReq = parseInt(slotData?.qty, 10);
          const itemName = String(slotData?.item || "").trim();
          const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
            ? 0
            : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
          status.textContent = missingQty > 0 ? `Missing ${missingQty}` : "Missing";
        }else{
          status.className = "pill";
          status.textContent = "-";
          delete status.dataset.planeSlotReady;
        }
      });
    });
  }
  function completePlaneRequest(rowIdx, slotIdx){
    const plane = state.plane;
    if(!plane) return;
    const rIdx = Math.max(0, Math.floor(Number(rowIdx || 0)));
    const sIdx = Math.max(0, Math.floor(Number(slotIdx || 0)));
    const row = plane.rows?.[rIdx];
    const slot = row?.slots?.[sIdx];
    if(!row || !slot || slot.done === true) return;

    const item = String(slot?.item || "").trim();
    const qtyReq = parseInt(slot?.qty, 10);
    if(!item || !Number.isFinite(qtyReq) || qtyReq<=0) return;
    if((plane.rows?.[rIdx]?.checkResults?.[sIdx] || null) !== "ready") return;

    const barnMap = buildBarnQtyMap();
    const itemKey = normalizeItemKey(item);
    const barnQty = Number(barnMap.get(itemKey) || 0);
    if(barnQty < qtyReq){
      toast(`Not enough ${item} in Inventory.`);
      return;
    }

    let remaining = qtyReq;
    for(const b of (state.barn || [])){
      if(remaining<=0) break;
      if(normalizeItemKey(b?.name)!==itemKey) continue;
      const available = Math.max(0, Number(b?.qty||0));
      const take = Math.min(available, remaining);
      if(take<=0) continue;
      const nextQty = available - take;
      if(nextQty < 0) return;
      b.qty = nextQty;
      remaining -= take;
    }
    if(remaining > 0) return;

    slot.done = true;
    recomputePlaneChecks(plane);
    save();
    drawPlane();
  }
  function startPlaneTimer(){
    const plane = state.plane;
    if(!plane) return;
    const hours = Math.max(0, Math.floor(Number(plane.returnHours||0)));
    const minutes = Math.max(0, Math.min(59, Math.floor(Number(plane.returnMinutes||0))));
    const totalMin = (hours*60) + minutes;
    plane.returnHours = hours;
    plane.returnMinutes = minutes;
    if(totalMin<=0){
      plane.status = "Ready";
      plane.endMs = null;
      plane.notifiedComplete = true;
      save();
      drawPlane();
      return;
    }
    plane.status = "Running";
    plane.endMs = nowMs() + minsToMs(totalMin);
    plane.notifiedComplete = false;
    save();
    drawPlane();
  }
  function startPlaneTaskTimer(){
    const plane = state.plane;
    if(!plane) return;
    const hours = Math.max(0, Math.floor(Number(plane.taskHours||0)));
    const minutes = Math.max(0, Math.min(59, Math.floor(Number(plane.taskMinutes||0))));
    const totalMin = (hours * 60) + minutes;
    plane.taskHours = hours;
    plane.taskMinutes = minutes;
    plane.taskNotifiedComplete = false;
    if(totalMin<=0){
      plane.taskStatus = "Ready";
      plane.taskEndMs = null;
      plane.taskNextHourlyNotifyMs = null;
      plane.taskNotifiedComplete = true;
      save();
      drawPlane();
      return;
    }
    const startMs = nowMs();
    plane.taskStatus = "Running";
    plane.taskEndMs = startMs + minsToMs(totalMin);
    plane.taskNextHourlyNotifyMs = startMs + (60 * 60 * 1000);
    save();
    drawPlane();
  }
  function sendPlane(){
    const plane = state.plane;
    if(!plane) return;

    const barnMap = buildBarnQtyMap();
    const requestedRows = [];
    const missing = [];
    const includedRowIndexes = new Set();

    for(let rowIdx=0; rowIdx<(plane.rows || []).length; rowIdx++){
      const row = plane.rows[rowIdx];
      const nonEmptySlots = (row.slots || []).filter(s=>String(s?.item||"").trim()!=="");
      if(nonEmptySlots.length===0) continue;
      includedRowIndexes.add(rowIdx);

      for(const slot of (row.slots || [])){
        if(slot?.done === true) continue;
        const item = String(slot?.item || "").trim();
        if(!item) continue;

        const qtyReq = parseInt(slot?.qty, 10);
        if(!Number.isFinite(qtyReq) || qtyReq<=0){
          toast("Qty must be > 0");
          return;
        }

        const itemKey = normalizeItemKey(item);
        const barnQty = Number(barnMap.get(itemKey) || 0);
        if(barnQty < qtyReq){
          missing.push(`${item} needs ${qtyReq - barnQty} more`);
        }
        requestedRows.push({rowIdx, itemKey, qtyReq});
      }
    }
    if(includedRowIndexes.size===0){
      toast("No items entered.");
      return;
    }
    if(missing.length){
      toast(missing[0] || "Not enough items in Inventory.");
      return;
    }

    requestedRows.forEach(req=>{
      let remaining = req.qtyReq;
      for(const b of (state.barn || [])){
        if(remaining<=0) break;
        if(normalizeItemKey(b?.name)!==req.itemKey) continue;
        const available = Math.max(0, Number(b?.qty||0));
        const take = Math.min(available, remaining);
        if(take<=0) continue;
        b.qty = Math.max(0, available - take);
        remaining -= take;
      }
    });

    includedRowIndexes.forEach(rowIdx=>{
      const row = plane.rows[rowIdx];
      if(!row) return;
      row.slots = Array.from({length:3}, ()=>({item:"", qty:"", done:false}));
      row.checkResults = Array(3).fill(null);
    });
    incrementPlanProgress("planesSent", 1);
    save();
    drawPlane();
  }
  function resetPlaneRequests(){
    const plane = state.plane;
    if(!plane) return;
    (plane.rows || []).forEach(row=>{
      row.slots = Array.from({length:3}, ()=>({item:"", qty:"", done:false}));
      row.checkResults = Array(3).fill(null);
    });
    plane.status = "Idle";
    plane.endMs = null;
    plane.notifiedComplete = false;
    save();
    drawPlane();
  }
  function resetPlaneTaskTimer(){
    const plane = state.plane;
    if(!plane) return;
    plane.taskStatus = "Idle";
    plane.taskEndMs = null;
    plane.taskNotifiedComplete = false;
    plane.taskNextHourlyNotifyMs = null;
    save();
    drawPlane();
  }
  function drawPlane(){
    section.innerHTML = "";
    const plane = state.plane;
    if(!plane) return;

    let changed = applyPlaneRowMirror(plane);
    if(recomputePlaneChecks(plane)) changed = true;
    if(changed) save();
    const barnMap = buildBarnQtyMap();

    const card = document.createElement("div");
    card.className = "card";
    card.id = "plane-card-main";
    const pillClass = plane.status==="Ready" ? "ready" : (plane.status==="Running" ? "progress" : "pending");
    const statusText = plane.status==="Running"
      ? `Returning in <span data-end-ms="${Number(plane.endMs || 0)}" data-timer-kind="countdown">${fmtCountdown(plane.endMs)}</span>`
      : (plane.status==="Ready" ? "Ready" : "Idle");
    const taskPillClass = plane.taskStatus==="Running" ? "progress" : (plane.taskStatus==="Ready" ? "needed" : "pill");
    const taskStatusLine = plane.taskStatus==="Running"
      ? `Task expires in <span data-end-ms="${Number(plane.taskEndMs || 0)}" data-timer-kind="countdown">${fmtCountdown(plane.taskEndMs)}</span>`
      : (plane.taskStatus==="Ready" ? "Task timer complete" : "Idle");

    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${escapeHtml(plane.name)}</div>
          <div class="small">Rows 2 and 3 mirror Row 1</div>
          <div class="row" style="margin-top:6px">
            <span class="pill ${pillClass}">${statusText}</span>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:10px; gap:12px; align-items:center; flex-wrap:wrap">
        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
          <span class="small">Return</span>
          <input data-plane-hours type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(plane.returnHours||0)))}" style="width:110px" />
          <span class="small">h</span>
          <input data-plane-minutes type="number" min="0" max="59" step="1" value="${Math.max(0, Math.min(59, Math.floor(Number(plane.returnMinutes||0))))}" style="width:110px" />
          <span class="small">m</span>
        </div>
        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
          <button class="secondary" data-start-plane-task>Start</button>
          <span class="small">Expiry</span>
          <input data-plane-task-hours type="number" min="0" step="1" value="${Math.max(0, Math.floor(Number(plane.taskHours||0)))}" style="width:110px" />
          <span class="small">h</span>
          <input data-plane-task-minutes type="number" min="0" max="59" step="1" value="${Math.max(0, Math.min(59, Math.floor(Number(plane.taskMinutes||0))))}" style="width:110px" />
          <span class="small">m</span>
          <button class="secondary" data-reset-plane-task>Reset</button>
        </div>
      </div>
      <div class="row" style="margin-top:8px">
        <span class="pill ${taskPillClass}">${taskStatusLine}</span>
      </div>
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px">
        ${plane.rows.map((rowData, rowIdx)=>`
          <div class="card" style="background:rgba(255,255,255,0.02)">
            <div class="card-title">${escapeHtml(rowData.name)}</div>
            <div class="row" style="margin-top:8px; gap:8px; align-items:stretch">
              ${rowData.slots.map((slot, slotIdx)=>{
                const result = plane.rows?.[rowIdx]?.checkResults?.[slotIdx] || null;
                const slotClass = slot?.done === true
                  ? ""
                  : (result==="ready" ? "train-req-ready" : (result==="missing" ? "train-req-missing" : ""));
                const qtyReq = parseInt(slot?.qty, 10);
                const itemName = String(slot?.item || "").trim();
                const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
                  ? 0
                  : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
                const statusHtml = slot?.done === true
                  ? `<span class="pill progress" data-plane-slot-status="${rowIdx}:${slotIdx}">Done</span>`
                  : (result==="ready"
                    ? `<button type="button" class="pill ready" data-plane-slot-status="${rowIdx}:${slotIdx}" data-plane-slot-ready="${rowIdx}:${slotIdx}">Ready</button>`
                    : `<span class="${result==="missing" ? "pill missing" : "pill"}" data-plane-slot-status="${rowIdx}:${slotIdx}">${result==="missing" ? (missingQty > 0 ? `Missing ${missingQty}` : "Missing") : "-"}</span>`);
                return `
                  <div class="train-req-row ${slotClass}" id="plane-req-${rowIdx}-${slotIdx}" data-plane-slot="${rowIdx}:${slotIdx}" style="flex:1; min-width:220px; padding:8px; border:1px solid var(--border); border-radius:10px">
                    <div class="row" style="gap:8px; align-items:center">
                      <input data-plane-item="${rowIdx}:${slotIdx}" data-item-input="true" type="text" placeholder="Item" value="${escapeAttr(slot.item||"")}" ${rowIdx>0 ? "readonly" : ""} style="flex:1; min-width:110px" />
                      <input data-plane-qty="${rowIdx}:${slotIdx}" type="number" min="0" step="1" placeholder="Qty" value="${slot.qty==="" ? "" : Number(slot.qty||0)}" ${rowIdx>0 ? "readonly" : ""} style="width:90px" />
                    </div>
                    <div class="row" style="margin-top:6px">
                      ${statusHtml}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
      <div class="row" style="margin-top:12px">
        <button class="secondary" data-start-plane>Start Timer</button>
        <button class="primary" data-send-plane>Send Plane</button>
        <button class="secondary" data-reset-plane>Reset</button>
      </div>
    `;

    section.appendChild(card);

    $("[data-plane-hours]", card).oninput = (ev)=>{
      plane.returnHours = Math.max(0, Math.floor(Number(ev.target.value||0)));
      save();
    };
    $("[data-plane-minutes]", card).oninput = (ev)=>{
      plane.returnMinutes = Math.max(0, Math.min(59, Math.floor(Number(ev.target.value||0))));
      save();
    };
    $("[data-plane-task-hours]", card).oninput = (ev)=>{
      plane.taskHours = Math.max(0, Math.floor(Number(ev.target.value||0)));
      save();
    };
    $("[data-plane-task-minutes]", card).oninput = (ev)=>{
      plane.taskMinutes = Math.max(0, Math.min(59, Math.floor(Number(ev.target.value||0))));
      save();
    };
    $$("[data-plane-item]", card).forEach(input=>input.oninput=()=>{
      const [rowIdx, slotIdx] = String(input.dataset.planeItem||"0:0").split(":").map(n=>Number(n||0));
      if(rowIdx!==0) return;
      const row = plane.rows?.[rowIdx];
      if(!row || !row.slots?.[slotIdx]) return;
      row.slots[slotIdx].item = input.value;
      (plane.rows || []).forEach(r=>{
        if(r?.slots?.[slotIdx]) r.slots[slotIdx].done = false;
      });
      applyPlaneRowMirror(plane);
      recomputePlaneChecks(plane);
      save();
      requestAnimationFrame(()=>drawPlane());
    });
    $$("[data-plane-qty]", card).forEach(input=>input.oninput=()=>{
      const [rowIdx, slotIdx] = String(input.dataset.planeQty||"0:0").split(":").map(n=>Number(n||0));
      if(rowIdx!==0) return;
      const row = plane.rows?.[rowIdx];
      if(!row || !row.slots?.[slotIdx]) return;
      row.slots[slotIdx].qty = input.value==="" ? "" : Math.max(0, Number(input.value||0));
      (plane.rows || []).forEach(r=>{
        if(r?.slots?.[slotIdx]) r.slots[slotIdx].done = false;
      });
      applyPlaneRowMirror(plane);
      recomputePlaneChecks(plane);
      save();
      requestAnimationFrame(()=>drawPlane());
    });
    $$("[data-plane-slot-ready]", card).forEach(btn=>btn.onclick=()=>{
      const [rowIdx, slotIdx] = String(btn.dataset.planeSlotReady || "").split(":");
      const slot = plane.rows?.[Number(rowIdx || 0)]?.slots?.[Number(slotIdx || 0)];
      if(!shouldAllowPriorityAction({
        transport:"plane",
        action:"ready",
        requestIdOrIndex:`${rowIdx}:${slotIdx}`,
        items: slot ? [{item:slot.item, qty:slot.qty}] : [],
      })) return;
      completePlaneRequest(Number(rowIdx || 0), Number(slotIdx || 0));
    });
    $("[data-start-plane]", card).onclick = ()=>startPlaneTimer();
    $("[data-send-plane]", card).onclick = ()=>{
      const items = (plane.rows || []).flatMap(row=>
        (row?.slots || [])
          .filter(slot=>slot?.done !== true)
          .map(slot=>({item:slot?.item, qty:slot?.qty}))
      );
      if(!shouldAllowPriorityAction({transport:"plane", action:"send", requestIdOrIndex:"plane", items})) return;
      sendPlane();
    };
    $("[data-reset-plane]", card).onclick = ()=>resetPlaneRequests();
    $("[data-start-plane-task]", card).onclick = ()=>startPlaneTaskTimer();
    $("[data-reset-plane-task]", card).onclick = ()=>resetPlaneTaskTimer();
  }
  function recomputeHelicopterOrderChecks(order, barnMap){
    let changed = false;
    order.checkResults = order.slots.map((slot, idx)=>{
      const item = String(slot.item||"").trim();
      const qty = parseInt(slot.qty, 10);
      const next = (!item || !Number.isFinite(qty) || qty<=0) ? null : (getBarnQty(item, barnMap) >= qty ? "ready" : "missing");
      if((order.checkResults?.[idx] ?? null) !== next) changed = true;
      return next;
    });
    return changed;
  }
  function recomputeHelicopterChecks(){
    const barnMap = buildBarnQtyMap();
    let changed = false;
    (state.helicopterOrders || []).forEach(order=>{
      if(order.status!=="Active") return;
      if(recomputeHelicopterOrderChecks(order, barnMap)) changed = true;
    });
    return changed;
  }
  function syncHelicopterOrderUI(orderIdx){
    const order = (state.helicopterOrders || [])[Number(orderIdx||0)];
    if(!order) return;
    const barnMap = buildBarnQtyMap();
    order.slots.forEach((slotData, slotIdx)=>{
      const slot = $(`[data-heli-slot="${orderIdx}:${slotIdx}"]`, section);
      const status = $(`[data-heli-slot-status="${orderIdx}:${slotIdx}"]`, section);
      if(!slot || !status) return;
      const result = order.checkResults?.[slotIdx] || null;
      slot.classList.remove("train-req-ready", "train-req-missing");
      if(result==="ready"){
        slot.classList.add("train-req-ready");
        status.className = "pill ready";
        status.textContent = "Ready";
      }else if(result==="missing"){
        slot.classList.add("train-req-missing");
        status.className = "pill missing";
        const qtyReq = parseInt(slotData?.qty, 10);
        const itemName = String(slotData?.item || "").trim();
        const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
          ? 0
          : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
        status.textContent = missingQty > 0 ? `Missing ${missingQty}` : "Missing";
      }else{
        status.className = "pill";
        status.textContent = "-";
      }
    });
  }
  function sendHelicopterOrder(orderIdx){
    const idx = Number(orderIdx||0);
    if(idx<0) return;
    const order = state.helicopterOrders[idx];
    if(order.status!=="Active") return;

    const barnMap = buildBarnQtyMap();
    const missing = [];
    const requested = [];
    for(const slot of (order.slots || [])){
      const item = String(slot?.item || "").trim();
      if(!item) continue;
      const qtyReq = parseInt(slot?.qty, 10);
      if(!Number.isFinite(qtyReq) || qtyReq<=0){
        toast("Qty must be > 0");
        return;
      }
      const itemKey = normalizeItemKey(item);
      const barnQty = Number(barnMap.get(itemKey) || 0);
      if(barnQty < qtyReq){
        missing.push(`${item} needs ${qtyReq - barnQty} more`);
      }
      requested.push({itemKey, qtyReq});
    }
    if(requested.length===0){
      toast("No items entered.");
      return;
    }
    if(missing.length){
      toast(missing[0]);
      return;
    }

    requested.forEach(req=>{
      let remaining = req.qtyReq;
      for(const b of (state.barn || [])){
        if(remaining<=0) break;
        if(normalizeItemKey(b?.name)!==req.itemKey) continue;
        const available = Math.max(0, Number(b?.qty||0));
        const take = Math.min(available, remaining);
        if(take<=0) continue;
        b.qty = Math.max(0, available - take);
        remaining -= take;
      }
    });

    // Consume this slot and replace with a new blank order (keeps exactly 9 visible slots).
    state.helicopterOrders[idx] = blankHelicopterOrder(idx);
    incrementPlanProgress("heliOrdersDone", 1);
    save();
    drawHelicopter();
  }
  function dumpHelicopterOrder(orderIdx){
    const order = (state.helicopterOrders || [])[Number(orderIdx||0)];
    if(!order || order.status!=="Active") return;
    order.status = "Refreshing";
    order.refreshEndMs = nowMs() + minsToMs(30);
    order.slots = Array.from({length:6}, ()=>({item:"", qty:""}));
    order.checkResults = Array(6).fill(null);
    save();
    drawHelicopter();
  }
  function resetHelicopterOrder(orderIdx){
    const idx = Number(orderIdx || 0);
    const order = (state.helicopterOrders || [])[idx];
    if(!order) return;
    order.status = "Active";
    order.refreshEndMs = null;
    order.slots = Array.from({length:6}, ()=>({item:"", qty:""}));
    order.checkResults = Array(6).fill(null);
    save();
    drawHelicopter();
  }
  function drawHelicopter(){
    section.innerHTML = "";
    const orders = state.helicopterOrders || [];
    const changed = recomputeHelicopterChecks();
    if(changed) save();
    const barnMap = buildBarnQtyMap();
    const collapsibleOrderIndexes = orders
      .map((order, idx)=>({order, idx}))
      .filter(x=>x.order?.status!=="Refreshing")
      .map(x=>x.idx);
    const anyHeliExpanded = collapsibleOrderIndexes.some(idx=>helicopterOrderCollapsed[String(idx)] !== true);

    const wrap = document.createElement("div");
    wrap.className = "content";
    wrap.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center">
        <div class="small">Helicopter orders</div>
        ${collapsibleOrderIndexes.length ? `<button class="secondary" data-heli-toggle-all>${anyHeliExpanded ? "Collapse all" : "Expand all"}</button>` : ``}
      </div>
      ${orders.length===0 ? `<div class="card"><div class="small">No active helicopter orders.</div></div>` : `
      <div class="heli-orders-grid" style="gap:10px">
        ${orders.map((order, orderIdx)=>{
          if(order.status==="Refreshing"){
            return `
              <div class="card">
                <div class="card-title">Heli ${orderIdx+1}</div>
                <div class="row" style="margin-top:8px">
                  <span class="pill progress">Refreshing in <span data-end-ms="${Number(order.refreshEndMs || 0)}" data-timer-kind="countdown">${fmtCountdown(order.refreshEndMs)}</span></span>
                </div>
                <div class="row" style="margin-top:10px">
                  <button class="secondary" data-heli-reset="${orderIdx}">Reset</button>
                </div>
              </div>
            `;
          }
          const isCollapsed = helicopterOrderCollapsed[String(orderIdx)] === true;
          const readyCount = (order.checkResults || []).filter(v=>v==="ready").length;
          const missingCount = (order.checkResults || []).filter(v=>v==="missing").length;
          return `
            <div class="card" id="heli-card-${orderIdx}">
              <div class="card-head" data-heli-collapse-toggle="${orderIdx}" style="cursor:pointer">
                <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
                  <span class="small" aria-hidden="true">${isCollapsed ? "▶" : "▼"}</span>
                  <div class="card-title">Heli ${orderIdx+1}</div>
                  <div class="spacer"></div>
                  ${isCollapsed
                    ? `<span class="pill ready">Ready: ${readyCount}</span><span class="pill missing">Missing: ${missingCount}</span>`
                    : `<span class="small">Ready: ${readyCount}</span><span class="small">Missing: ${missingCount}</span>`
                  }
                </div>
              </div>
              <div style="margin-top:8px; ${isCollapsed ? "display:none;" : ""}" data-heli-collapse-body="${orderIdx}">
                ${(order.slots || []).map((slot, slotIdx)=>{
                  const result = order.checkResults?.[slotIdx] || null;
                  const slotClass = result==="ready" ? "train-req-ready" : (result==="missing" ? "train-req-missing" : "");
                  const qtyReq = parseInt(slot?.qty, 10);
                  const itemName = String(slot?.item || "").trim();
                  const missingQty = (!itemName || !Number.isFinite(qtyReq) || qtyReq<=0)
                    ? 0
                    : Math.max(0, qtyReq - getBarnQty(itemName, barnMap));
                  return `
                    <div class="row train-req-row ${slotClass}" id="heli-req-${orderIdx}-${slotIdx}" data-heli-slot="${orderIdx}:${slotIdx}" style="margin-top:6px; padding:8px; border:1px solid var(--border); border-radius:10px">
                      <input data-heli-item-order="${orderIdx}" data-heli-item-slot="${slotIdx}" data-item-input="true" type="text" placeholder="Item" value="${escapeAttr(slot.item||"")}" style="flex:1; min-width:120px" />
                      <input data-heli-qty-order="${orderIdx}" data-heli-qty-slot="${slotIdx}" type="number" min="0" step="1" placeholder="Qty" value="${slot.qty==="" ? "" : Number(slot.qty||0)}" style="width:90px" />
                      <span class="${result==="ready" ? "pill ready" : (result==="missing" ? "pill missing" : "pill")}" data-heli-slot-status="${orderIdx}:${slotIdx}">${result==="ready" ? "Ready" : (result==="missing" ? (missingQty > 0 ? `Missing ${missingQty}` : "Missing") : "-")}</span>
                    </div>
                  `;
                }).join("")}
              </div>
              <div class="row" style="margin-top:10px">
                <button class="primary" data-heli-send="${orderIdx}">Send Order</button>
                <button class="secondary" data-heli-dump="${orderIdx}">Dump Order</button>
                <button class="secondary" data-heli-reset="${orderIdx}">Reset</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>`}
    `;
    section.appendChild(wrap);
    $$("[data-heli-toggle-all]", wrap).forEach(btn=>btn.onclick=()=>{
      const collapseAll = anyHeliExpanded;
      collapsibleOrderIndexes.forEach(idx=>{
        helicopterOrderCollapsed[String(idx)] = collapseAll;
      });
      drawHelicopter();
    });
    $$("[data-heli-collapse-toggle]", wrap).forEach(head=>head.onclick=()=>{
      const key = String(head.dataset.heliCollapseToggle || "");
      if(key==="") return;
      helicopterOrderCollapsed[key] = !(helicopterOrderCollapsed[key] === true);
      drawHelicopter();
    });

    $$("[data-heli-item-order]", wrap).forEach(input=>input.oninput=()=>{
      const orderIdx = Number(input.dataset.heliItemOrder || 0);
      const order = (state.helicopterOrders || [])[orderIdx];
      const slotIdx = Number(input.dataset.heliItemSlot || 0);
      if(!order || !order.slots?.[slotIdx]) return;
      order.slots[slotIdx].item = input.value;
      recomputeHelicopterOrderChecks(order, buildBarnQtyMap());
      save();
      syncHelicopterOrderUI(orderIdx);
    });
    $$("[data-heli-qty-order]", wrap).forEach(input=>input.oninput=()=>{
      const orderIdx = Number(input.dataset.heliQtyOrder || 0);
      const order = (state.helicopterOrders || [])[orderIdx];
      const slotIdx = Number(input.dataset.heliQtySlot || 0);
      if(!order || !order.slots?.[slotIdx]) return;
      order.slots[slotIdx].qty = input.value==="" ? "" : Math.max(0, Number(input.value||0));
      recomputeHelicopterOrderChecks(order, buildBarnQtyMap());
      save();
      syncHelicopterOrderUI(orderIdx);
    });
    $$("[data-heli-send]", wrap).forEach(btn=>btn.onclick=()=>{
      const orderIdx = String(btn.dataset.heliSend || "");
      const order = (state.helicopterOrders || [])[Number(orderIdx || 0)];
      const items = (order?.slots || []).map(slot=>({item:slot?.item, qty:slot?.qty}));
      if(!shouldAllowPriorityAction({transport:"helicopter", action:"send", requestIdOrIndex:orderIdx, items})) return;
      sendHelicopterOrder(orderIdx);
    });
    $$("[data-heli-dump]", wrap).forEach(btn=>btn.onclick=()=>dumpHelicopterOrder(btn.dataset.heliDump));
    $$("[data-heli-reset]", wrap).forEach(btn=>btn.onclick=()=>resetHelicopterOrder(btn.dataset.heliReset));
  }

  function editTransport(id){
    const t = state.transport.find(x=>x.id===id);
    if(!t) return;
    openModal({
      title:"Edit Transport",
      bodyHtml: transportFormHtml(t),
      onSave: ()=>{
        Object.assign(t, readTransportForm());
        save();
        render();
      }
    });
  }

  function addTransportReq(id){
    const t = state.transport.find(x=>x.id===id);
    if(!t) return;
    openModal({
      title:`Add requested item (${t.mode})`,
      primaryText:"Add",
      bodyHtml: `
        <label class="field">Item name
          <input id="reqName" data-item-input="true" type="text" />
        </label>
        <label class="field">Quantity
          <input id="reqQty" type="number" min="1" step="1" value="1" />
        </label>
      `,
      onSave: ()=>{
        const name = $("#reqName").value.trim();
        const qty = Number($("#reqQty").value||1);
        if(!name) throw new Error("Name required");
        t.requests = t.requests || [];
        t.requests.push({id: uid(), name, qty});
        save();
        drawGeneralTransport();
      }
    });
  }

  function sendTransport(id){
    const t = state.transport.find(x=>x.id===id);
    if(!t) return;
    t.status = "In Progress";
    save();
    createJob({type:"Transport", sourceName:t.mode, itemName:`${t.mode} Dispatch`, qty:1, durationMin:t.etaMin||0});
    toast("Transport sent.");
    drawGeneralTransport();
  }

  content.innerHTML = "";
  content.appendChild(top);
  content.appendChild(section);

  const favorableVoyageToggle = $("#toggleFavorableVoyage", top);
  if(favorableVoyageToggle){
    favorableVoyageToggle.onchange = ()=>{
      setBoosterEnabled("favorableVoyage", !!favorableVoyageToggle.checked);
      render();
    };
  }

  $$("[data-transport-tab]", top).forEach(btn=>btn.onclick=()=>{
    transportTab = btn.dataset.transportTab;
    render();
  });
  $$("[data-tfilter]", top).forEach(b=>{
    b.onclick = ()=>{
      transportFilter = b.dataset.tfilter;
      render();
    };
  });

  const addBtn = $("#btnAddTransport");
  if(addBtn){
    addBtn.onclick = ()=>openModal({
      title:"Add Transport",
      primaryText:"Add",
      bodyHtml: transportFormHtml({mode:"Train", status:"Pending", etaMin:120, notes:"", requests:[]}),
      onSave: ()=>{
        const v = readTransportForm();
        state.transport.push({id: uid(), ...v, requests:[]});
        save();
        render();
      }
    });
  }

  if(transportTab==="trains") drawTrains();
  else if(transportTab==="plane") drawPlane();
  else if(transportTab==="helicopter") drawHelicopter();
  else if(transportTab==="ships") drawShips();
  else drawGeneralTransport();
}

function transportFormHtml(t){
  return `
    <label class="field">Mode
      <select id="tMode">
        <option ${t.mode==="Train"?"selected":""} value="Train">Train</option>
        <option ${t.mode==="Helicopter"?"selected":""} value="Helicopter">Helicopter</option>
        <option ${t.mode==="Airplane"?"selected":""} value="Airplane">Airplane</option>
        <option ${t.mode==="Islands"?"selected":""} value="Islands">Islands</option>
      </select>
    </label>
    <label class="field">Status
      <select id="tStatus">
        <option ${t.status==="Pending"?"selected":""} value="Pending">Pending</option>
        <option ${t.status==="In Progress"?"selected":""} value="In Progress">In Progress</option>
        <option ${t.status==="Ready"?"selected":""} value="Ready">Ready</option>
        <option ${t.status==="Completed"?"selected":""} value="Completed">Completed</option>
      </select>
    </label>
    <label class="field">ETA (minutes)
      <input id="tEta" type="number" min="0" step="1" value="${Number(t.etaMin||0)}" />
    </label>
    <label class="field">Notes
      <input id="tNotes" type="text" value="${escapeAttr(t.notes||"")}" />
    </label>
  `;
}
function readTransportForm(){
  return {
    mode: $("#tMode").value,
    status: $("#tStatus").value,
    etaMin: Number($("#tEta").value||0),
    notes: $("#tNotes").value.trim(),
  };
}

function fmtEndClock(ms){
  if(!ms) return "-";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function renderPlan(){
  const content = $("#content");
  state.plan = normalizePlan(state.plan);
  ensurePlanDayBoundary(false);
  const plan = state.plan;
  const dayKey = getPlanDayKey();
  content.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Daily Plan</div>
          <div class="small">Day boundary: 06:00 Europe/London • Current plan day: <b>${escapeHtml(dayKey)}</b></div>
        </div>
        <button id="btnPlanResetNow" class="secondary">Reset progress now</button>
      </div>
    </div>
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Goal</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Trains to send</td>
            <td><input data-plan-goal="trains" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.trains || 0))}" style="max-width:110px" /></td>
            <td><span class="small"><b>${Math.max(0, Number(plan.progress.trainsSent || 0))}</b> / ${Math.max(0, Number(plan.goals.trains || 0))}</span></td>
          </tr>
          <tr>
            <td>Planes to send</td>
            <td><input data-plan-goal="planes" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.planes || 0))}" style="max-width:110px" /></td>
            <td><span class="small"><b>${Math.max(0, Number(plan.progress.planesSent || 0))}</b> / ${Math.max(0, Number(plan.goals.planes || 0))}</span></td>
          </tr>
          <tr>
            <td>Helicopter orders to complete</td>
            <td><input data-plan-goal="helicopters" type="number" min="0" step="1" value="${Math.max(0, Number(plan.goals.helicopters || 0))}" style="max-width:110px" /></td>
            <td><span class="small"><b>${Math.max(0, Number(plan.progress.heliOrdersDone || 0))}</b> / ${Math.max(0, Number(plan.goals.helicopters || 0))}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  $$("[data-plan-goal]").forEach(input=>input.onchange=()=>{
    const key = String(input.dataset.planGoal || "");
    if(!["trains","planes","helicopters"].includes(key)) return;
    state.plan = normalizePlan(state.plan);
    state.plan.goals[key] = Math.max(0, Math.floor(Number(input.value || 0)));
    save();
    renderPlan();
  });
  const resetBtn = $("#btnPlanResetNow", content);
  if(resetBtn){
    resetBtn.onclick = ()=>{
      state.plan = normalizePlan(state.plan);
      state.plan.progress = {trainsSent:0, planesSent:0, heliOrdersDone:0};
      state.plan.lastResetKey = getPlanDayKey();
      save();
      renderPlan();
    };
  }
}

function renderSettings(){
  const content = $("#content");
  const settings = normalizeSettings(state.settings);
  state.settings = settings;
  content.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Town Profile</div>
          <div class="small">Profile values used by planner views.</div>
        </div>
      </div>
      <div class="row" style="margin-top:10px; gap:12px">
        <label class="field" style="max-width:220px">
          Number of Field Plots
          <input id="settingsFieldPlots" type="number" min="1" step="1" value="${Math.max(1, Math.floor(Number(settings.fieldPlots || 12)))}" />
        </label>
        <label class="field" style="max-width:220px">
          Game Level
          <input id="settingsGameLevel" type="number" min="1" step="1" value="${Math.max(1, Math.floor(Number(settings.gameLevel || 1)))}" />
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">UI Preferences</div>
          <div class="small">Display-only preferences.</div>
        </div>
      </div>
      <div class="row" style="margin-top:10px; gap:14px">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="settingsCompactMode" type="checkbox" ${settings.compactMode ? "checked" : ""} />
          Compact mode
        </label>
        <label class="field" style="max-width:220px">
          Time Format
          <select id="settingsTimeFormat">
            <option value="hms" ${settings.timeFormat==="hms" ? "selected" : ""}>hms</option>
            <option value="minutes" ${settings.timeFormat==="minutes" ? "selected" : ""}>minutes</option>
          </select>
        </label>
        <label class="field" style="max-width:220px">
          Transport priority
          <select id="settingsTransportPriority">
            <option value="none" ${settings.transportPriority==="none" ? "selected" : ""}>None</option>
            <option value="trains" ${settings.transportPriority==="trains" ? "selected" : ""}>Trains</option>
            <option value="plane" ${settings.transportPriority==="plane" ? "selected" : ""}>Plane</option>
            <option value="helicopter" ${settings.transportPriority==="helicopter" ? "selected" : ""}>Helicopter</option>
            <option value="ships" ${settings.transportPriority==="ships" ? "selected" : ""}>Ships</option>
          </select>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Sound</div>
          <div class="small">Timer completion sound preferences.</div>
        </div>
      </div>
      <div class="row" style="margin-top:10px; gap:14px">
        <label class="row small" style="gap:6px; align-items:center; margin:0">
          <input id="settingsMuteSounds" type="checkbox" ${settings.muteSounds ? "checked" : ""} />
          Mute sounds
        </label>
        <label class="field" style="max-width:260px; min-width:220px">
          Volume
          <input id="settingsSoundVolume" type="range" min="0" max="100" step="1" value="${Math.max(0, Math.min(100, Number(settings.soundVolume ?? 50)))}" />
          <span class="small" id="settingsSoundVolumeValue">${Math.max(0, Math.min(100, Number(settings.soundVolume ?? 50)))}%</span>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Boosters</div>
          <div class="small">Manage toggles directly in Crops, Farm Buildings, Factories, Foundries, and Transport pages.</div>
        </div>
      </div>
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px">
          ${(() => {
            const active = [];
            if(settings.boosters?.superHarvest?.enabled) active.push(`Super-Harvest${getBoosterEndsInLabel("superHarvest", settings) ? ` (${getBoosterEndsInLabel("superHarvest", settings)})` : ""}`);
            if(settings.boosters?.advancedFarming?.enabled) active.push(`Advanced Farming${getBoosterEndsInLabel("advancedFarming", settings) ? ` (${getBoosterEndsInLabel("advancedFarming", settings)})` : ""}`);
            if(settings.boosters?.highSpeedProduction?.enabled) active.push(`High-Speed Production${getBoosterEndsInLabel("highSpeedProduction", settings) ? ` (${getBoosterEndsInLabel("highSpeedProduction", settings)})` : ""}`);
            if(settings.boosters?.efficientSmelting?.enabled) active.push(`Efficient Smelting${getBoosterEndsInLabel("efficientSmelting", settings) ? ` (${getBoosterEndsInLabel("efficientSmelting", settings)})` : ""}`);
            if(settings.boosters?.favorableVoyage?.enabled) active.push(`Favorable Voyage${getBoosterEndsInLabel("favorableVoyage", settings) ? ` (${getBoosterEndsInLabel("favorableVoyage", settings)})` : ""}`);
            if(settings.boosters?.richFields?.enabled) active.push(`Rich Fields${getBoosterEndsInLabel("richFields", settings) ? ` (${getBoosterEndsInLabel("richFields", settings)})` : ""}`);
            if(settings.boosters?.extraPairOfHands?.enabled) active.push(`Extra Pair of Hands${getBoosterEndsInLabel("extraPairOfHands", settings) ? ` (${getBoosterEndsInLabel("extraPairOfHands", settings)})` : ""}`);
            return active.length
              ? active.map(name=>`<div class="small">${escapeHtml(name)}</div>`).join("")
              : `<div class="small">No active boosters.</div>`;
          })()}
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Data</div>
          <div class="small">Backup, restore, and reset tools.</div>
        </div>
      </div>
      <div class="row" style="margin-top:10px; gap:10px">
        <button id="settingsExportData" class="secondary">Export Data</button>
        <label class="file" style="min-width:180px">
          Import Data
          <input id="settingsImportData" type="file" accept="application/json" />
        </label>
        <button id="settingsResetAll" class="danger">Reset All Data</button>
      </div>
      <div id="settingsResetConfirmWrap" style="margin-top:10px; display:none">
        <div class="small">Type RESET to confirm</div>
        <div class="row" style="margin-top:6px; gap:8px">
          <input id="settingsResetConfirmInput" type="text" placeholder="RESET" style="max-width:220px" />
          <button id="settingsResetConfirmBtn" class="danger" disabled>Confirm Reset</button>
          <button id="settingsResetCancelBtn" class="secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;

  const fieldPlotsInput = $("#settingsFieldPlots", content);
  const gameLevelInput = $("#settingsGameLevel", content);
  const compactModeInput = $("#settingsCompactMode", content);
  const timeFormatInput = $("#settingsTimeFormat", content);
  const transportPriorityInput = $("#settingsTransportPriority", content);
  const muteSoundsInput = $("#settingsMuteSounds", content);
  const soundVolumeInput = $("#settingsSoundVolume", content);
  const soundVolumeValue = $("#settingsSoundVolumeValue", content);
  function persistTownProfile(){
    const current = normalizeSettings(state.settings);
    const fieldPlots = Math.max(1, Math.floor(Number(fieldPlotsInput?.value || current.fieldPlots) || current.fieldPlots));
    const gameLevel = Math.max(1, Math.floor(Number(gameLevelInput?.value || current.gameLevel) || current.gameLevel));
    const compactMode = !!compactModeInput?.checked;
    const timeFormat = String(timeFormatInput?.value || current.timeFormat) === "minutes" ? "minutes" : "hms";
    const transportPriority = ["none","trains","plane","helicopter","ships"].includes(String(transportPriorityInput?.value || current.transportPriority))
      ? String(transportPriorityInput?.value || current.transportPriority)
      : "none";
    const muteSounds = !!muteSoundsInput?.checked;
    const soundVolume = Math.max(0, Math.min(100, Math.floor(Number(soundVolumeInput?.value ?? current.soundVolume) || 0)));
    if(fieldPlotsInput) fieldPlotsInput.value = String(fieldPlots);
    if(gameLevelInput) gameLevelInput.value = String(gameLevel);
    if(soundVolumeInput) soundVolumeInput.value = String(soundVolume);
    if(soundVolumeValue) soundVolumeValue.textContent = `${soundVolume}%`;
    state.settings = normalizeSettings({
      ...current,
      fieldPlots,
      gameLevel,
      compactMode,
      timeFormat,
      transportPriority,
      priorityOverride: current.priorityOverride,
      muteSounds,
      soundVolume,
      boosters: current.boosters,
      boosterExpiry: current.boosterExpiry,
    });
    save();
    applyUiPreferences();
  }
  if(fieldPlotsInput) fieldPlotsInput.onchange = persistTownProfile;
  if(gameLevelInput) gameLevelInput.onchange = persistTownProfile;
  if(compactModeInput) compactModeInput.onchange = ()=>{ persistTownProfile(); render(); };
  if(timeFormatInput) timeFormatInput.onchange = ()=>{ persistTownProfile(); render(); };
  if(transportPriorityInput) transportPriorityInput.onchange = ()=>{ persistTownProfile(); renderSettings(); };
  if(muteSoundsInput) muteSoundsInput.onchange = persistTownProfile;
  if(soundVolumeInput) soundVolumeInput.oninput = persistTownProfile;
  const exportBtn = $("#settingsExportData", content);
  if(exportBtn) exportBtn.onclick = handleExportData;
  const importInput = $("#settingsImportData", content);
  if(importInput){
    importInput.onchange = handleImportDataChange;
  }
  const resetBtn = $("#settingsResetAll", content);
  const resetConfirmWrap = $("#settingsResetConfirmWrap", content);
  const resetConfirmInput = $("#settingsResetConfirmInput", content);
  const resetConfirmBtn = $("#settingsResetConfirmBtn", content);
  const resetCancelBtn = $("#settingsResetCancelBtn", content);
  function closeResetConfirm(){
    if(resetConfirmInput) resetConfirmInput.value = "";
    if(resetConfirmBtn) resetConfirmBtn.disabled = true;
    if(resetConfirmWrap) resetConfirmWrap.style.display = "none";
  }
  if(resetBtn){
    resetBtn.onclick = ()=>{
      if(!resetConfirmWrap) return;
      resetConfirmWrap.style.display = "block";
      if(resetConfirmInput){
        resetConfirmInput.value = "";
        resetConfirmInput.focus();
      }
      if(resetConfirmBtn) resetConfirmBtn.disabled = true;
    };
  }
  if(resetConfirmInput && resetConfirmBtn){
    resetConfirmInput.oninput = ()=>{
      resetConfirmBtn.disabled = resetConfirmInput.value !== "RESET";
    };
  }
  if(resetCancelBtn) resetCancelBtn.onclick = closeResetConfirm;
  if(resetConfirmBtn){
    resetConfirmBtn.onclick = ()=>{
      if(resetConfirmInput?.value !== "RESET") return;
      clearAllDataAndReload();
    };
  }
}

/* export/import/reset */
function handleExportData(){
  const snapshot = readPersistedStateForBackup() || state;
  const dateStamp = new Date().toISOString().slice(0,10);
  downloadJson(`township-planner-backup-${dateStamp}.json`, snapshot);
  toast("Backup exported.");
}
async function handleImportDataChange(ev){
  const f = ev.target.files?.[0];
  if(!f) return;
  try{
    const txt = await f.text();
    const data = JSON.parse(txt);
    if(!isCompatibleBackupState(data)){
      throw new Error("This file is not a compatible Township Planner backup.");
    }
    state = Object.assign(defaultData(), data);
    state.jobs = normalizeJobs(state.jobs);
    state.opsRecent = normalizeOpsRecent(state.opsRecent);
    state.factories = normalizeFactories(state.factories);
    state.trains = normalizeTrains(state.trains);
    state.plane = normalizePlane(state.plane);
    state.helicopterOrders = normalizeHelicopterOrders(state.helicopterOrders);
    state.farm = normalizeFarm(state.farm, state.farms, state.farmBuildings);
    state.settings = normalizeSettings(state.settings);
    state.plan = normalizePlan(state.plan);
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    toast("Backup imported. Reloading...");
    window.location.reload();
  }catch(err){
    const msg = err?.message ? String(err.message) : "Import failed (invalid JSON).";
    toast(`Import failed: ${msg}`);
  }finally{
    ev.target.value = "";
  }
}
function clearAllDataAndReload(){
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(DASHBOARD_SETTINGS_KEY);
  toast("Reset complete. Reloading...");
  window.location.reload();
}

/* nav */
$$(".nav-item").forEach(btn=>{
  btn.onclick = ()=>{
    setRoute(btn.dataset.route);
    if(window.innerWidth <= 900){
      document.body.classList.remove("sidebar-expanded");
      const t = $("#btnSidebarToggle");
      if(t) t.setAttribute("aria-expanded", "false");
    }
  };
});
const sidebarToggle = $("#btnSidebarToggle");
if(sidebarToggle){
  sidebarToggle.onclick = ()=>{
    const expanded = !document.body.classList.contains("sidebar-expanded");
    document.body.classList.toggle("sidebar-expanded", expanded);
    sidebarToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  };
  window.addEventListener("resize", ()=>{
    if(window.innerWidth > 900){
      document.body.classList.remove("sidebar-expanded");
      sidebarToggle.setAttribute("aria-expanded", "false");
    }
  });
}

/* helpers */
function escapeHtml(s){
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("'","&#39;"); }
function isEditingAnyInput(){
  const el = document.activeElement;
  const appRoot = $(".app");
  if(!el || !appRoot) return false;
  const isFormField = !!el.matches?.("input, select, textarea");
  const isEditable = !!el.isContentEditable;
  if(!isFormField && !isEditable) return false;
  return appRoot.contains(el);
}
function updateTimerTextNodes(){
  const nodes = $$("[data-end-ms][data-timer-kind]");
  if(!nodes.length) return;
  nodes.forEach(node=>{
    const endMs = Number(node.dataset.endMs || 0);
    if(!Number.isFinite(endMs) || endMs <= 0) return;
    const kind = String(node.dataset.timerKind || "left");
    let nextText = "";
    if(kind==="countdown") nextText = fmtCountdown(endMs);
    else if(kind==="endclock") nextText = fmtEndClock(endMs);
    else nextText = fmtLeft(endMs);
    if(node.textContent !== nextText) node.textContent = nextText;
  });
}
function isEditingTransportInput(){
  if(route!=="transport") return false;
  const el = document.activeElement;
  if(!el) return false;
  return el.matches?.("[data-train-item], [data-train-qty], [data-train-hours], [data-train-minutes], [data-plane-item], [data-plane-qty], [data-plane-hours], [data-plane-minutes], [data-heli-item-order], [data-heli-qty-order]");
}
function isEditingCropsInput(){
  if(route!=="crops") return false;
  const el = document.activeElement;
  if(!el) return false;
  if(el.matches?.("[data-crops-input]")) return true;
  if(!el.matches?.("input, select, textarea")) return false;
  if(el.closest?.("#content")) return true;
  if(el.closest?.("#modal")) return true;
  return false;
}
function isEditingDashboardInput(){
  if(route!=="home") return false;
  const el = document.activeElement;
  if(!el) return false;
  if(!el.matches?.("input, select, textarea")) return false;
  return !!el.closest?.("#content");
}
function isEditingFarmInput(){
  if(route!=="farm") return false;
  const el = document.activeElement;
  if(!el) return false;
  if(!el.matches?.("input, select, textarea")) return false;
  return !!el.closest?.("#content");
}

/* init */
render();
initItemAutocomplete();
let pendingTickRender = false;
window.addEventListener("focus", ()=>{
  const planReset = ensurePlanDayBoundary();
  const boosterExpired = ensureBoosterExpiryState();
  if(planReset || boosterExpired){
    render();
  }
});
setInterval(()=>{
  if(ensureBoosterExpiryState()){
    if(isEditingAnyInput()){
      pendingTickRender = true;
      return;
    }
    render();
  }
}, 60 * 1000);
setInterval(()=>{
  // Always update statuses first.
  const tick = updateJobStatuses();
  const editing = isEditingAnyInput();

  // Defer visual re-render while user is actively editing.
  if(tick?.changed){
    if(editing){
      pendingTickRender = true;
      return;
    }
    pendingTickRender = false;
    render();
    return;
  }
  if(editing) return;
  if(pendingTickRender){
    pendingTickRender = false;
    render();
    return;
  }
  updateTimerTextNodes();
}, 1000);
// Mobile navigation improvements
function initMobileNav() {
  const isMobile = window.innerWidth <= 768;
  
  // Hide sidebar toggle on mobile
  const toggleBtn = $("#btnSidebarToggle");
  if (toggleBtn) {
    toggleBtn.style.display = isMobile ? 'none' : 'inline-flex';
  }
  
  // Make sure body doesn't have sidebar-expanded class on mobile
  if (isMobile) {
    document.body.classList.remove("sidebar-expanded");
  }
}

// Call on load and resize
initMobileNav();
window.addEventListener('resize', initMobileNav);