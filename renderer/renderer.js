'use strict';

const bridge = window.api;

const SEP_FALLBACK = '#37c0e8';

let config = { theme: {}, language: 'rus', selectedGameId: null, games: [] };
let pendingNewImage = null; // absolute path chosen for the "add game" form
let STR = {};
let LANGUAGES = [];

/* ---------- helpers ---------- */

const $ = (sel) => document.querySelector(sel);

// Looks up a dotted path ("messages.enterGameName") in the loaded strings,
// substituting {placeholders} from `vars`. Falls back to the path itself
// so a missing/incomplete translation is visible instead of blank UI.
function t(dottedPath, vars) {
  let cur = STR;
  for (const part of dottedPath.split('.')) {
    if (!cur || typeof cur !== 'object') { cur = undefined; break; }
    cur = cur[part];
  }
  let str = typeof cur === 'string' ? cur : dottedPath;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.split(`{${k}}`).join(v);
  }
  return str;
}

function applyStaticStrings() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

function populateLanguageSelect() {
  const sel = $('#selLanguage');
  sel.innerHTML = '';
  for (const { code, name } of LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  sel.value = config.language || 'rus';
}

async function setLanguage(lang) {
  config.language = lang;
  await save();
  STR = await bridge.getStrings(lang);
  applyStaticStrings();
  renderAll();
  renderListEditor();
}

const mediaUrl = (name) => `media://img/${encodeURIComponent(name)}`;

const isSep = (it) => !!it && it.type === 'separator';

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    `g-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function selectedGame() {
  const it = config.games.find((g) => g.id === config.selectedGameId);
  return it && !isSep(it) ? it : null;
}

// games that are actually visible in the list (not inside a collapsed group)
function visibleGames() {
  const out = [];
  let collapsed = false;
  for (const it of config.games) {
    if (isSep(it)) { collapsed = !!it.collapsed; continue; }
    if (!collapsed) out.push(it);
  }
  return out;
}

async function save() {
  config = await bridge.saveConfig(config);
}

function mkInput(value, placeholder, onCommit) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value || '';
  el.placeholder = placeholder;
  el.addEventListener('change', () => onCommit(el.value.trim()));
  return el;
}

function mkBtn(cls, text, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', fn);
  return b;
}

/* ---------- in-page alert()/confirm() replacement ----------
 * Electron's native window.alert()/confirm() are known to leave a frameless,
 * sandboxed BrowserWindow unable to receive further input once the dialog is
 * dismissed (the renderer looks alive but nothing is clickable). This modal
 * runs entirely inside the page instead, so it can't get the window stuck. */
function notice(message, { confirmMode = false } = {}) {
  return new Promise((resolve) => {
    const box = $('#notice');
    const okBtn = $('#noticeOk');
    const cancelBtn = $('#noticeCancel');

    $('#noticeText').textContent = message;
    cancelBtn.style.display = confirmMode ? '' : 'none';
    box.classList.remove('hidden');

    const finish = (result) => {
      box.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      box.removeEventListener('mousedown', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === box) finish(!confirmMode); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.stopPropagation(); finish(true); }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    box.addEventListener('mousedown', onBackdrop);
    document.addEventListener('keydown', onKey, true);
    okBtn.focus();
  });
}

const alertMsg = (message) => notice(message);
const confirmMsg = (message) => notice(message, { confirmMode: true });

/* ---------- theme ---------- */

const COLORS = [
  { sel: '#colTitle', key: 'titleColor', cssVar: '--title-color' },
  { sel: '#colPlay', key: 'playColor', cssVar: '--play-color' }
];

function applyTheme() {
  const r = document.documentElement.style;
  for (const { key, cssVar } of COLORS) {
    const v = config.theme && config.theme[key];
    if (v) r.setProperty(cssVar, v);
  }
}

/* ---------- edge fade for a scrollable game list ---------- */

function updateSidebarFade() {
  const el = $('#sidebar');
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  const scrollable = max > 2;
  el.classList.toggle('fade-top', scrollable && el.scrollTop > 4);
  el.classList.toggle('fade-bottom', scrollable && el.scrollTop < max - 4);
}

/* ---------- main view ---------- */

function buildGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card' + (game.id === config.selectedGameId ? ' selected' : '');
  card.tabIndex = 0;
  card.dataset.id = game.id;

  if (game.image) {
    const img = document.createElement('img');
    img.className = 'bg';
    img.src = mediaUrl(game.image);
    img.alt = '';
    img.onerror = () => img.remove();
    card.appendChild(img);
  }

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = game.name || t('common.untitled');
  card.appendChild(name);

  card.addEventListener('click', () => selectGame(game.id));
  card.addEventListener('dblclick', () => launch());
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectGame(game.id); }
  });
  return card;
}

function buildSepRow(sep) {
  const row = document.createElement('div');
  row.className = 'sep-row' + (sep.collapsed ? ' collapsed' : '');
  row.style.setProperty('--sep', sep.color || SEP_FALLBACK);
  row.tabIndex = 0;
  row.dataset.id = sep.id;

  const chev = document.createElement('span');
  chev.className = 'chevron';
  chev.textContent = '▾';

  const name = document.createElement('span');
  name.className = 'sep-name';
  name.textContent = sep.name || t('common.untitled');

  const rule = document.createElement('span');
  rule.className = 'rule';

  row.append(chev, name, rule);
  row.addEventListener('click', () => toggleSeparator(sep.id));
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSeparator(sep.id); }
  });
  return row;
}

function renderSidebar() {
  const box = $('#sidebar');
  box.innerHTML = '';

  if (!config.games.length) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = t('sidebar.empty');
    box.appendChild(hint);
    requestAnimationFrame(updateSidebarFade);
    return;
  }

  let collapsed = false;
  for (const item of config.games) {
    if (isSep(item)) {
      collapsed = !!item.collapsed;
      box.appendChild(buildSepRow(item));
      continue;
    }
    if (collapsed) continue;
    box.appendChild(buildGameCard(item));
  }

  requestAnimationFrame(updateSidebarFade);
}

function renderPreview() {
  const img = $('#previewImg');
  const empty = $('#previewEmpty');
  const game = selectedGame();

  if (game && game.image) {
    img.src = mediaUrl(game.image);
    img.classList.add('show');
  } else {
    img.removeAttribute('src');
    img.classList.remove('show');
  }

  const anyGame = config.games.some((x) => !isSep(x));
  if (!anyGame) empty.textContent = t('preview.noGames');
  else if (!game) empty.textContent = t('preview.selectGame');
  else empty.textContent = t('preview.noImage');
}

function renderPlay() {
  $('#btnPlay').disabled = !selectedGame();
}

function renderAll() {
  applyTheme();
  renderSidebar();
  renderPreview();
  renderPlay();
}

async function selectGame(id) {
  if (config.selectedGameId === id) return;
  config.selectedGameId = id;
  await save();
  renderSidebar();
  renderPreview();
  renderPlay();
}

async function toggleSeparator(id) {
  const sep = config.games.find((x) => x.id === id && isSep(x));
  if (!sep) return;
  sep.collapsed = !sep.collapsed;
  await save();
  renderSidebar();
}

async function launch() {
  const game = selectedGame();
  if (!game) return;
  if (!game.url || !game.url.trim()) {
    await alertMsg(t('messages.noUrlSet'));
    return;
  }
  const res = await bridge.launch(game.url);
  if (!res || !res.ok) {
    await alertMsg(t('messages.launchFailed', { error: (res && res.error) || '' }));
  }
}

/* keyboard navigation of the list */
function moveSelection(delta) {
  const vis = visibleGames();
  if (!vis.length) return;
  const idx = vis.findIndex((g) => g.id === config.selectedGameId);
  const next = Math.max(0, Math.min(vis.length - 1, (idx < 0 ? 0 : idx + delta)));
  selectGame(vis[next].id);
  const el = document.querySelector(`.game-card[data-id="${vis[next].id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

/* ---------- settings ---------- */

function openSettings() {
  for (const { sel, key } of COLORS) {
    $(sel).value = (config.theme && config.theme[key]) || '#000000';
  }
  $('#newName').value = '';
  $('#newUrl').value = '';
  pendingNewImage = null;
  $('#newImgName').textContent = t('common.notSelected');
  $('#newSepName').value = '';
  $('#newSepColor').value = SEP_FALLBACK;
  populateLanguageSelect();
  renderListEditor();
  $('#settings').classList.remove('hidden');
}

function closeSettings() {
  $('#settings').classList.add('hidden');
}

/* ---- drag & drop reordering of the list editor ---- */

let dragId = null;

function rowUnderPointer(y) {
  const rows = [...$('#listEditor').querySelectorAll('.list-row:not(.dragging)')];
  for (const r of rows) {
    const box = r.getBoundingClientRect();
    if (y < box.top + box.height / 2) return r;
  }
  return null; // drop at the end
}

function clearDropMarks() {
  $('#listEditor').querySelectorAll('.drop-before, .drop-end')
    .forEach((el) => el.classList.remove('drop-before', 'drop-end'));
}

function onListDragOver(e) {
  if (dragId == null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDropMarks();
  const target = rowUnderPointer(e.clientY);
  if (target) {
    target.classList.add('drop-before');
  } else {
    const rows = $('#listEditor').querySelectorAll('.list-row:not(.dragging)');
    if (rows.length) rows[rows.length - 1].classList.add('drop-end');
  }
}

function onListDrop(e) {
  if (dragId == null) return;
  e.preventDefault();
  const target = rowUnderPointer(e.clientY);
  reorder(dragId, target ? target.dataset.id : null);
}

async function reorder(id, beforeId) {
  clearDropMarks();
  const from = config.games.findIndex((x) => x.id === id);
  if (from < 0) return;
  const [it] = config.games.splice(from, 1);
  let to = beforeId ? config.games.findIndex((x) => x.id === beforeId) : config.games.length;
  if (to < 0) to = config.games.length;
  config.games.splice(to, 0, it);
  await save();
  renderListEditor();
  renderSidebar();
}

function buildHandle(row) {
  const h = document.createElement('button');
  h.type = 'button';
  h.className = 'drag-handle';
  h.tabIndex = -1;
  h.title = t('settings.list.dragHandle');
  h.innerHTML =
    '<svg viewBox="0 0 10 16" aria-hidden="true">' +
    '<circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/>' +
    '<circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/>' +
    '<circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></svg>';
  h.addEventListener('mousedown', () => { row.draggable = true; });
  h.addEventListener('mouseup', () => { row.draggable = false; });
  return h;
}

function attachRowDrag(row, id) {
  row.dataset.id = id;
  row.addEventListener('dragstart', (e) => {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  row.addEventListener('dragend', () => {
    dragId = null;
    row.draggable = false;
    row.classList.remove('dragging');
    clearDropMarks();
  });
}

function buildGameEditRow(game, groupColor) {
  const row = document.createElement('div');
  row.className = 'list-row game-row';
  if (groupColor) {
    row.classList.add('grouped');
    row.style.setProperty('--grp', groupColor);
  }
  attachRowDrag(row, game.id);
  row.appendChild(buildHandle(row));

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.alt = '';
  if (game.image) thumb.src = mediaUrl(game.image);
  row.appendChild(thumb);

  const rows = document.createElement('div');
  rows.className = 'rows';
  rows.appendChild(mkInput(game.name, t('common.name'), async (v) => {
    game.name = v;
    await save();
    renderSidebar();
  }));
  rows.appendChild(mkInput(game.url, 'steam://rungameid/620', async (v) => {
    game.url = v;
    await save();
  }));
  row.appendChild(rows);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.appendChild(mkBtn('mini', t('settings.list.image'), async () => {
    const picked = await bridge.pickImage();
    if (!picked) return;
    const stored = await bridge.importImage(picked);
    const old = game.image;
    game.image = stored;
    await save();
    if (old) await bridge.deleteImage(old);
    renderListEditor();
    renderSidebar();
    renderPreview();
  }));
  actions.appendChild(mkBtn('mini danger', t('settings.list.delete'), () => deleteItem(game.id)));
  row.appendChild(actions);

  return row;
}

function buildSepEditRow(sep) {
  const row = document.createElement('div');
  row.className = 'list-row sep-row-edit';
  row.style.setProperty('--sep', sep.color || SEP_FALLBACK);
  attachRowDrag(row, sep.id);
  row.appendChild(buildHandle(row));

  const title = document.createElement('div');
  title.className = 'sep-title';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = sep.name || '';
  nameInput.placeholder = t('settings.list.sepNamePlaceholder');
  nameInput.addEventListener('change', async () => {
    sep.name = nameInput.value.trim();
    await save();
    renderSidebar();
  });
  const rule = document.createElement('span');
  rule.className = 'rule';
  title.append(nameInput, rule);
  row.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const color = document.createElement('input');
  color.type = 'color';
  color.value = sep.color || SEP_FALLBACK;
  color.addEventListener('input', () => {
    sep.color = color.value;
    row.style.setProperty('--sep', sep.color);
  });
  color.addEventListener('change', async () => {
    sep.color = color.value;
    await save();
    renderListEditor();
    renderSidebar();
  });
  actions.appendChild(color);
  actions.appendChild(mkBtn('mini round danger', '×', () => deleteItem(sep.id)));
  row.appendChild(actions);

  return row;
}

function renderListEditor() {
  const box = $('#listEditor');
  box.innerHTML = '';

  if (!config.games.length) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = t('settings.list.empty');
    box.appendChild(hint);
    return;
  }

  let groupColor = null; // items before the first separator belong to no group
  for (const item of config.games) {
    if (isSep(item)) {
      groupColor = item.color || SEP_FALLBACK;
      box.appendChild(buildSepEditRow(item));
    } else {
      box.appendChild(buildGameEditRow(item, groupColor));
    }
  }
}

async function deleteItem(id) {
  const item = config.games.find((x) => x.id === id);
  if (!item) return;
  const confirmText = isSep(item)
    ? t('messages.deleteSeparatorConfirm', { name: item.name || '' })
    : t('messages.deleteGameConfirm', { name: item.name || t('messages.untitledGame') });
  if (!(await confirmMsg(confirmText))) return;

  const image = !isSep(item) ? item.image : null;
  const wasSelected = config.selectedGameId === id;
  config.games = config.games.filter((x) => x.id !== id);
  if (wasSelected) {
    const nextGame = config.games.find((x) => !isSep(x));
    config.selectedGameId = nextGame ? nextGame.id : null;
  }
  await save();
  if (image) await bridge.deleteImage(image);
  renderListEditor();
  renderAll();
}

async function addGame() {
  const name = $('#newName').value.trim();
  const url = $('#newUrl').value.trim();
  if (!name) { await alertMsg(t('messages.enterGameName')); return; }

  let image = null;
  if (pendingNewImage) {
    image = await bridge.importImage(pendingNewImage);
  }

  const game = { id: uid(), type: 'game', name, url, image };
  config.games.push(game);
  if (!config.selectedGameId) config.selectedGameId = game.id;
  await save();

  $('#newName').value = '';
  $('#newUrl').value = '';
  pendingNewImage = null;
  $('#newImgName').textContent = t('common.notSelected');

  renderListEditor();
  renderAll();
}

async function addSeparator() {
  const name = $('#newSepName').value.trim();
  const color = $('#newSepColor').value || SEP_FALLBACK;
  if (!name) { await alertMsg(t('messages.enterSeparatorName')); return; }

  config.games.push({ id: uid(), type: 'separator', name, color, collapsed: false });
  await save();

  $('#newSepName').value = '';
  renderListEditor();
  renderSidebar();
}

/* ---------- wiring ---------- */

function wire() {
  $('#btnMin').addEventListener('click', () => bridge.minimize());
  $('#btnClose').addEventListener('click', () => bridge.close());
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCloseSettings').addEventListener('click', closeSettings);
  $('#btnDone').addEventListener('click', closeSettings);
  $('#btnPlay').addEventListener('click', launch);

  $('#settings').addEventListener('mousedown', (e) => {
    if (e.target === $('#settings')) closeSettings();
  });

  for (const { sel, key } of COLORS) {
    $(sel).addEventListener('input', async () => {
      config.theme = config.theme || {};
      config.theme[key] = $(sel).value;
      applyTheme();
      await save();
    });
  }

  $('#btnOpenDir').addEventListener('click', () => bridge.openLauncherDir());
  $('#btnOpenImages').addEventListener('click', () => bridge.openImagesDir());

  $('#selLanguage').addEventListener('change', () => setLanguage($('#selLanguage').value));

  const listEl = $('#listEditor');
  listEl.addEventListener('dragover', onListDragOver);
  listEl.addEventListener('drop', onListDrop);
  listEl.addEventListener('dragleave', (e) => {
    if (!listEl.contains(e.relatedTarget)) clearDropMarks();
  });

  $('#sidebar').addEventListener('scroll', updateSidebarFade, { passive: true });
  window.addEventListener('resize', updateSidebarFade);

  $('#btnPickImg').addEventListener('click', async () => {
    const picked = await bridge.pickImage();
    if (!picked) return;
    pendingNewImage = picked;
    $('#newImgName').textContent = picked.split(/[\\/]/).pop();
  });
  $('#btnAddGame').addEventListener('click', addGame);
  $('#btnAddSep').addEventListener('click', addSeparator);

  document.addEventListener('keydown', (e) => {
    const settingsOpen = !$('#settings').classList.contains('hidden');
    if (e.key === 'Escape' && settingsOpen) { closeSettings(); return; }
    if (settingsOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    if (e.key === 'Enter') { e.preventDefault(); launch(); }
  });
}

/* ---------- boot ---------- */

// Swap the inline SVG of any [data-icon] host for renderer/assets/<name>.svg|.png
// when such a file exists.
async function wireIconOverrides() {
  let files;
  try { files = new Set(await bridge.listAssets()); } catch { return; }

  document.querySelectorAll('[data-icon]').forEach((host) => {
    const name = host.dataset.icon;
    const file = [`${name}.svg`, `${name}.png`].find((f) => files.has(f));
    if (!file) return;
    const src = `assets/${file}`;

    if (host.hasAttribute('data-icon-tint')) {
      // silhouette recoloured via CSS mask + the host's `color`
      const span = document.createElement('span');
      span.className = 'icon-file ok';
      span.style.setProperty('--src', `url("${src}")`);
      host.prepend(span);
    } else {
      // full-colour image
      const img = document.createElement('img');
      img.className = 'icon-file';
      img.alt = '';
      img.addEventListener('load', () => { if (img.naturalWidth) img.classList.add('ok'); });
      img.addEventListener('error', () => img.remove());
      host.prepend(img);
      img.src = src;
    }
  });
}

async function showVersion() {
  try {
    const info = await bridge.getVersionInfo();
    $('#appVersion').textContent = info && info.version ? `v${info.version}` : '';
  } catch { /* ignore */ }
}

(async function init() {
  await wireIconOverrides();
  showVersion();
  config = await bridge.getConfig();
  [STR, LANGUAGES] = await Promise.all([
    bridge.getStrings(config.language),
    bridge.listLanguages()
  ]);
  if (!selectedGame()) {
    const first = visibleGames()[0] || config.games.find((x) => !isSep(x));
    config.selectedGameId = first ? first.id : null;
  }
  applyStaticStrings();
  wire();
  renderAll();
})();
