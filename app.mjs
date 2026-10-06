import { addCapture, mergeSnapshot, validateInbox, validateSnapshot, INBOX_FORMAT, SNAPSHOT_FORMAT } from './core.mjs';
const $ = id => document.getElementById(id);
const platforms = { x: 'X / Twitter', youtube: 'YouTube', bilibili: 'B站', xiaohongshu: '小红书', local: '本地笔记' };
let state = { items: [], captures: [] }, filter = '', toastTimer, db;
const esc = v => String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function transact(mode, fn) { return new Promise((res, rej) => { const tx = db.transaction('app', mode); let value; fn(tx.objectStore('app'), v => value = v); tx.oncomplete = () => res(value); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || Error('保存失败')); }); }
async function save(update) {
  // One read-modify-write transaction also protects against two share windows.
  const next = await new Promise((res, rej) => {
    const tx = db.transaction('app', 'readwrite'), store = tx.objectStore('app'); let value, error;
    const req = store.get('state');
    req.onsuccess = () => { try { value = update(req.result || { items: [], captures: [] }); store.put(value, 'state'); } catch (e) { error = e; tx.abort(); } };
    tx.oncomplete = () => res(value); tx.onerror = tx.onabort = () => rej(error || tx.error || Error('保存失败'));
  }); state = next; render();
}
function page(name) { for (const id of ['library', 'inbox', 'sync']) $(id).hidden = id !== name; document.querySelectorAll('.bottom-nav [data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === name); b.setAttribute('aria-current', b.dataset.page === name ? 'page' : 'false'); }); window.scrollTo(0, 0); }
function openCapture() { $('capture-error').textContent = ''; $('capture-dialog').showModal(); }
function renderLibrary() {
  const query = $('search').value.trim().toLowerCase();
  const items = state.items.filter(i => (!filter || i.platform === filter) && (!query || [i.title, i.text, i.note, i.description, i.author, ...i.tags].join(' ').toLowerCase().includes(query)));
  $('library-meta').textContent = state.items.length ? `${state.items.length} 条资料 · 文字和已导入缩略图可离线浏览` : '从电脑导入，或先留下新的灵感';
  $('cards').innerHTML = items.map(i => `<button class="item-card" data-item="${esc(i.id)}">${i.cover ? `<img class="cover" src="${i.cover}" alt="" loading="lazy">` : ''}<div class="card-body"><div class="card-source"><span>${esc(platforms[i.platform] || '资料')}</span><span>${esc(i.createdAt?.slice(5, 10))}</span></div><h2>${esc(i.title)}</h2>${!i.cover ? `<p>${esc(i.description || i.text || i.note || '已保存来源链接')}</p>` : ''}${i.tags[0] ? `<span class="tag">${esc(i.tags[0])}</span>` : ''}</div></button>`).join('');
  $('empty-library').hidden = state.items.length > 0;
  if (state.items.length && !items.length) $('cards').innerHTML = '<p class="muted">没有匹配的资料，试试其他关键词。</p>';
}
function render() {
  renderLibrary();
  $('inbox-count').textContent = state.captures.length || '';
  $('queue-badge').hidden = !state.captures.length;
  $('empty-inbox').hidden = !!state.captures.length;
  $('inbox-list').innerHTML = state.captures.map(c => `<article class="inbox-card"><span class="card-source">${esc(platforms[c.platform])} · ${esc(c.savedAt?.slice(0, 10))}</span><h2>${esc(c.title || c.url)}</h2>${c.note ? `<p>${esc(c.note)}</p>` : ''}<div class="actions"><span class="inbox-state">● 已保存在此设备</span><button class="remove" data-remove="${esc(c.id)}">移除</button></div></article>`).join('');
  $('export-inbox').disabled = $('sync-export').disabled = !state.captures.length;
  $('snapshot-info').textContent = state.importedAt ? `已导入 ${state.items.length} 条 · ${new Date(state.importedAt).toLocaleString('zh-CN')}` : '只包含文字与小图，不包含大体积视频。';
  storageInfo();
}
function detail(id) {
  const i = state.items.find(i => i.id === id); if (!i) return;
  $('detail-content').innerHTML = `${i.cover ? `<img class="cover" src="${i.cover}" alt="资料封面">` : ''}<h1>${esc(i.title)}</h1><p class="muted">${esc(platforms[i.platform] || '资料')} · ${esc(i.author || '未记录作者')}</p>${i.url ? `<a class="secondary" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">打开原始链接 ↗</a>` : ''}${[['已核验简介', i.description], ['原文', i.text], ['我的笔记', i.note], ['已有文字稿', i.transcript]].filter(([, v]) => v).map(([title, text]) => `<section><h2>${title}</h2><p>${esc(text)}</p></section>`).join('')}<p class="footnote">这是导入的资料快照。此版本不缓存和播放原视频。</p>`;
  $('detail-dialog').showModal();
}
function download(name, data) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
let inboxExport;
function exportInbox() {
  if (!state.captures.length) return toast('手机收藏还是空的');
  const name = 'seed-mobile-inbox-' + new Date().toISOString().slice(0, 10) + '.json';
  const data = { format: INBOX_FORMAT, exportedAt: new Date().toISOString(), captures: state.captures };
  const text = JSON.stringify(data, null, 2), file = new File([text], name, { type: 'application/json' });
  inboxExport = { name, data, text, file };
  $('export-info').textContent = `${state.captures.length} 条收藏 · ${(file.size / 1024).toFixed(1)} KB`;
  $('export-content').value = text;
  $('share-inbox').hidden = !navigator.canShare?.({ files: [file] });
  $('export-dialog').showModal();
}
$('download-inbox').onclick = () => download(inboxExport.name, inboxExport.data);
$('copy-inbox').onclick = async () => { try { await navigator.clipboard.writeText(inboxExport.text); toast('已复制收藏清单'); } catch { $('export-content').focus(); $('export-content').select(); toast('浏览器未允许自动复制，清单已选中，可长按复制。'); } };
$('share-inbox').onclick = () => run(async () => { try { await navigator.share({ files: [inboxExport.file], title: 'Seed Library 手机收藏' }); } catch (e) { if (e.name !== 'AbortError') throw e; } });
async function readImport(file) { if (!file) return null; if (file.size > 35 * 1024 * 1024) throw Error('文件超过 35 MiB，请分批或减少缩略图后再导入。'); return JSON.parse(await file.text()); }
async function storageInfo() { const e = await navigator.storage?.estimate?.(); const persistent = await navigator.storage?.persisted?.(); $('storage-info').textContent = `本机约占用 ${((e?.usage || 0) / 1024 / 1024).toFixed(1)} MB · ${persistent ? '已获准保留数据' : '建议定期导出备份'}`; }
async function run(action) { try { await action(); } catch (e) { console.error('Mobile operation failed', e.name); toast(e.name === 'QuotaExceededError' ? '手机存储空间不足，未保存。请先导出备份。' : e.message || '操作未完成'); } }

document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(b.dataset.page));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
for (const id of ['collect', 'empty-collect', 'inbox-collect']) $(id).onclick = openCapture;
$('filters').innerHTML = [['', '全部'], ...Object.entries(platforms).filter(([id]) => id !== 'local')].map(([id, label]) => `<button class="${id ? '' : 'active'}" data-filter="${id}">${label}</button>`).join('');
$('filters').onclick = e => { const b = e.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; $('filters').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderLibrary(); };
$('search').oninput = renderLibrary;
$('cards').onclick = e => { const b = e.target.closest('[data-item]'); if (b) detail(b.dataset.item); };
$('capture-form').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try { const input = { text: $('share-text').value, title: $('share-title').value, note: $('share-note').value }; await save(s => ({ ...s, captures: addCapture(s.captures, input) })); $('capture-dialog').close(); $('capture-form').reset(); history.replaceState(null, '', location.pathname); toast('已保存到手机，可离线查看'); }
  catch (e) { $('capture-error').textContent = e.name === 'QuotaExceededError' ? '空间不足，收藏未保存。' : e.message; }
  finally { button.disabled = false; }
};
$('inbox-list').onclick = e => { const b = e.target.closest('[data-remove]'); if (b && confirm('从手机移除这条收藏？已导出的清单不受影响。')) run(() => save(s => ({ ...s, captures: s.captures.filter(c => c.id !== b.dataset.remove) }))); };
for (const id of ['export-inbox', 'sync-export']) $(id).onclick = exportInbox;
$('import-snapshot').onchange = e => run(async () => { const data = await readImport(e.target.files[0]); if (!data) return; await save(s => mergeSnapshot(s, data)); e.target.value = ''; page('library'); toast(`已导入 ${state.items.length} 条资料`); });
$('local-import').onclick = () => run(async () => { $('local-import').disabled = true; try { const response = await fetch('./__local/snapshot', { cache: 'no-store' }); if (!response.ok) throw Error('本机导出服务暂不可用'); const data = await response.json(); await save(s => mergeSnapshot(s, data)); page('library'); toast(`已导入 ${state.items.length} 条本机资料`); } finally { $('local-import').disabled = false; } });
$('persist').onclick = () => run(async () => { const ok = await navigator.storage?.persist?.(); await storageInfo(); toast(ok ? '浏览器已同意保留本地数据' : '浏览器暂未批准，请使用导出备份'); });
$('backup').onclick = () => download('seed-mobile-backup-' + new Date().toISOString().slice(0, 10) + '.json', { format: 'seed-library-mobile-backup-v1', snapshot: { format: SNAPSHOT_FORMAT, exportedAt: state.snapshotAt || new Date().toISOString(), items: state.items }, inbox: { format: INBOX_FORMAT, captures: state.captures } });
$('restore').onchange = e => run(async () => { const data = await readImport(e.target.files[0]); if (!data) return; if (data.format !== 'seed-library-mobile-backup-v1') throw Error('不是手机完整备份'); const snapshot = validateSnapshot(data.snapshot); const incoming = validateInbox(data.inbox); await save(s => { let captures = s.captures; for (const c of incoming) captures = addCapture(captures, { text: c.url, title: c.title, note: c.note }, c.id); return mergeSnapshot({ ...s, captures }, snapshot); }); e.target.value = ''; toast('已恢复资料，并合并手机收藏'); });
function connection() { $('offline').textContent = navigator.onLine ? '本地优先' : '离线可用'; $('offline').classList.toggle('offline', !navigator.onLine); }
window.addEventListener('online', connection); window.addEventListener('offline', connection); connection();
try {
  db = await new Promise((res, rej) => { const req = indexedDB.open('seed-library-mobile-lab', 1); req.onupgradeneeded = () => req.result.createObjectStore('app'); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const saved = await transact('readonly', (store, set) => { const req = store.get('state'); req.onsuccess = () => set(req.result); }); if (saved) state = saved; render();
  if (location.hash.startsWith('#share=')) {
    try { const shared = JSON.parse(decodeURIComponent(location.hash.slice(7))); $('share-text').value = [shared.text, shared.url].filter(v => typeof v === 'string').join('\n'); $('share-title').value = typeof shared.title === 'string' ? shared.title.slice(0, 300) : ''; openCapture(); }
    catch { toast('分享内容未识别，请手动粘贴链接。'); }
    history.replaceState(null, '', location.pathname);
  }
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) { try { const r = await fetch('./__local/status', { cache: 'no-store' }); if (r.ok && (await r.json()).snapshotAvailable) $('local-import').hidden = false; } catch {} }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => toast('离线页面缓存未完成，请联网重新打开；本地收藏仍可保存。'));
} catch (e) { toast('本地存储或离线初始化失败：' + e.message); for (const id of ['collect', 'inbox-collect', 'empty-collect']) $(id).disabled = true; }
