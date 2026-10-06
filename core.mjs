export const SNAPSHOT_FORMAT = 'seed-library-mobile-v1';
export const INBOX_FORMAT = 'seed-library-inbox-v1';
const str = (v, max = 100000) => typeof v === 'string' ? v.slice(0, max) : '';
export const safeUrl = v => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
export function extractLink(text) {
  for (const match of String(text).matchAll(/https?:\/\/[^\s<>"，。；！？、【】《》]+/g)) {
    const raw = match[0].replace(/[).,;!\]}]+$/, '');
    const u = new URL(raw); if (u.username || u.password) continue;
    const host = u.hostname.replace(/^(www|m|mobile)\./, '');
    let platform, key;
    if (['x.com', 'twitter.com'].includes(host) && /\/status\/\d+/.test(u.pathname)) { platform = 'x'; key = u.pathname.match(/\/status\/(\d+)/)[1]; }
    if (['youtube.com', 'youtu.be'].includes(host)) { platform = 'youtube'; key = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.replace(/^\/(shorts|live)\//, ''); }
    if (['bilibili.com', 'b23.tv'].includes(host)) { platform = 'bilibili'; key = u.pathname.replace(/\/$/, '') + (u.searchParams.get('p') ? '?p=' + u.searchParams.get('p') : ''); }
    if (['xiaohongshu.com', 'xhslink.com', 'xhslink.cn', 'rednote.com'].includes(host)) { platform = 'xiaohongshu'; key = u.pathname.match(/\/(?:explore|item)\/([^/?]+)/)?.[1] || host + u.pathname; }
    if (platform && key) return { url: u.href, platform, key: platform + ':' + key };
  }
  throw Error('请粘贴 X、YouTube、B站或小红书的分享链接。');
}
export function addCapture(queue, input, id = crypto.randomUUID()) {
  const link = extractLink(input.text);
  const existing = queue.find(c => c.key === link.key);
  const capture = { ...existing, ...link, id: existing?.id || id, title: str(input.title || existing?.title || '', 300), note: [...new Set([existing?.note, str(input.note, 3000)].filter(Boolean))].join('\n'), savedAt: existing?.savedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  return [capture, ...queue.filter(c => c.key !== link.key)];
}
function cleanItem(i) {
  return { id: str(i.id, 200), title: str(i.cardLabel || i.title || '未命名资料', 500), platform: str(i.platform, 30), url: safeUrl(i.url), author: str(i.author, 300), text: str(i.text), note: str(i.note), transcript: str(i.transcript, 300000), description: str(i.description, 2000), tags: Array.isArray(i.tags) ? i.tags.filter(t => typeof t === 'string').slice(0, 50).map(t => t.slice(0, 100)) : [], createdAt: str(i.createdAt, 80), cover: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(i.cover || '') && i.cover.length < 300000 ? i.cover : '' };
}
export function makeSnapshot(items) {
  return { format: SNAPSHOT_FORMAT, exportedAt: new Date().toISOString(), items: items.filter(i => !i.deletedAt).map(i => cleanItem({ ...i, description: i.aiDescription?.approvedAt ? i.aiDescription.text : '' })) };
}
export function validateSnapshot(data) {
  if (!data || data.format !== SNAPSHOT_FORMAT || !Array.isArray(data.items) || data.items.length > 10000) throw Error('不是支持的 Seed Library 资料快照（最多 10,000 条）。');
  const ids = new Set();
  const items = data.items.map(i => { if (!i || typeof i.id !== 'string' || !i.id || ids.has(i.id)) throw Error('快照有重复或缺失的资料 ID。'); ids.add(i.id); return cleanItem(i); });
  return { format: SNAPSHOT_FORMAT, exportedAt: str(data.exportedAt, 80), items };
}
export function mergeSnapshot(state, snapshot) {
  const clean = validateSnapshot(snapshot);
  return { ...state, items: clean.items, snapshotAt: clean.exportedAt, importedAt: new Date().toISOString() };
}
export function validateInbox(data) {
  if (data?.format !== INBOX_FORMAT || !Array.isArray(data.captures) || data.captures.length > 10000) throw Error('不是支持的手机收藏清单。');
  return data.captures.reduce((queue, c) => addCapture(queue, { text: c.url, title: c.title, note: c.note }, str(c.id, 200) || crypto.randomUUID()), []);
}
