/* racine.ia — application d'une école, connexion à Supabase.
   Ce fichier fournit à l'application les mêmes services que la version Claude
   (base de données en temps réel, utilisateur, assistant IA, téléchargements),
   et affiche l'écran de connexion. */
(function () {
  'use strict';
  const CFG = window.CLR_CONFIG || {};
  /* École de l'utilisateur (gardée après la connexion) : nom, devise, logo */
  try { const e = JSON.parse(localStorage.getItem('racine-ecole') || 'null'); if (e && e.code) { window.ECOLE = e; document.title = e.nom; } } catch (e) {}
  const EC = window.ECOLE;
  /* ---------- Couleurs de l'école (thème choisi par la direction) ---------- */
  const THEMES = [['violet', 'Violet', 262, 1], ['nuit', 'Bleu nuit', 226, 1], ['ocean', 'Océan', 198, 1], ['emeraude', 'Émeraude', 158, .9], ['foret', 'Forêt', 126, .75],
    ['ambre', 'Ambre', 30, 1], ['rubis', 'Rubis', 356, 1], ['grenat', 'Grenat', 338, .9], ['prune', 'Prune', 300, .85], ['ardoise', 'Ardoise', 215, .22]];
  const BASE_GRAD = 'linear-gradient(135deg,#1d0f3d,#533989 55%,#8363c6)';
  const hx = n => n.toString(16).padStart(2, '0');
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
  function hsl2rgb(h, s, l) { h /= 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (!s) return [l * 255, l * 255, l * 255].map(Math.round); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255)); }
  function shift(r, g, b, H, SF) { const [h, s, l] = rgb2hsl(r, g, b); if (h < 232 || h > 302 || s < .12) return null; return hsl2rgb(H, Math.min(1, s * SF), l); }
  function recolor(txt, H, SF) {
    return txt.replace(/#([0-9a-fA-F]{6})\b/g, (m, x) => { const c = shift(parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), H, SF); return c ? '#' + c.map(hx).join('') : m; })
      .replace(/rgba\((\d+),\s*(\d+),\s*(\d+)/g, (m, r, g, b) => { const c = shift(+r, +g, +b, H, SF); return c ? `rgba(${c.join(',')}` : m; });
  }
  const themeOf = k => THEMES.find(t => t[0] === k) || THEMES[0];
  const gradOf = k => { const t = themeOf(k); return t[0] === 'violet' ? BASE_GRAD : recolor(BASE_GRAD, t[2], t[3]); };
  window.applyTheme = function (k) {
    if (k !== undefined) window.__theme = k;
    const t = themeOf(window.__theme);
    document.querySelectorAll('style').forEach(st => {
      if (st.dataset.orig === undefined) st.dataset.orig = st.textContent;
      st.textContent = t[0] === 'violet' ? st.dataset.orig : recolor(st.dataset.orig, t[2], t[3]);
    });
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t[0] === 'violet' ? '#1d0f3d' : recolor('#1d0f3d', t[2], t[3]);
  };
  window.__theme = (EC && EC.theme) || 'violet';
  document.addEventListener('DOMContentLoaded', () => window.applyTheme());

  function themePicker(first) {
    const cur = window.__theme || 'violet'; let pick = cur;
    const ov = document.createElement('div'); ov.id = 'tpick';
    ov.innerHTML = `<div class="tp-box"><h2>${first ? 'Choisissez les couleurs de votre école' : 'Couleurs de l’application'}</h2>
      <p>Ces couleurs s’appliquent à toute l’application de l’école, pour la direction et pour tous les enseignants.</p>
      <div class="tp-grid">${THEMES.map(t => `<button type="button" class="tp-sw" data-k="${t[0]}" aria-pressed="${t[0] === cur}"><span class="tp-g" style="background:${gradOf(t[0])}"></span><b>${t[1]}</b></button>`).join('')}</div>
      <div class="tp-msg" id="tp-msg"></div>
      <button type="button" class="tp-ok">Valider ces couleurs</button><button type="button" class="tp-no">${first ? 'Plus tard' : 'Annuler'}</button></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.tp-sw').forEach(b => b.onclick = () => { pick = b.dataset.k; ov.querySelectorAll('.tp-sw').forEach(x => x.setAttribute('aria-pressed', x === b)); window.applyTheme(pick); });
    ov.querySelector('.tp-no').onclick = () => { window.applyTheme(cur); ov.remove(); };
    ov.querySelector('.tp-ok').onclick = async () => {
      const msg = ov.querySelector('#tp-msg'); msg.textContent = 'Enregistrement…';
      const { error } = await sb.rpc('racine_set_theme', { t: pick, couleur: gradOf(pick) });
      if (error) { msg.textContent = 'Enregistrement impossible. Réessayez.'; return; }
      try { const e = JSON.parse(localStorage.getItem('racine-ecole') || '{}'); e.theme = pick; localStorage.setItem('racine-ecole', JSON.stringify(e)); if (window.ECOLE) window.ECOLE.theme = pick; } catch (x) {}
      ov.remove();
    };
  }
  window.themePicker = themePicker;

  const sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'clr-ecole-auth' }
  });
  window.CLR_SB = sb;

  /* ---------- téléphone → identifiant de connexion (identique au serveur) ---------- */
  function normPhone(v) {
    let p = String(v || '').replace(/\D/g, '');
    if (p.startsWith('00')) p = p.slice(2);
    if (p.length === 10 && p.startsWith('0')) p = '243' + p.slice(1);
    if (p.length === 9) p = '243' + p;
    return p;
  }
  const emailOf = d => d + '@tel.college-la-riviere.github.io';

  /* ---------- état ---------- */
  let ME = null;          // { uid, member }
  let readyResolve;
  const ready = new Promise(r => (readyResolve = r));
  const cache = {};       // col -> Map(id -> data)
  const subs = {};        // col -> Set({cb, err})
  const pending = {};     // 'col/id' -> nombre d'écritures en cours
  let loaded = false, channel = null, hiddenAt = 0;

  const mapOf = col => (cache[col] = cache[col] || new Map());
  function emit(col) {
    if (!loaded) return;
    const m = mapOf(col);
    const snap = { docs: [...m].map(([id, d]) => ({ id, data: () => d, exists: true })), size: m.size, empty: !m.size };
    (subs[col] || new Set()).forEach(s => { try { s.cb(snap) } catch (e) { console.error(e) } });
  }
  const emitAll = () => Object.keys(subs).forEach(emit);

  /* ---------- copie locale (IndexedDB) : démarrage rapide et téléchargement des seuls changements ---------- */
  const IDB = {
    db: null,
    open() {
      if (this.db) return this.db;
      return (this.db = new Promise((ok, ko) => {
        try { const r = indexedDB.open('clr-ecole', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }
        catch (e) { ko(e); }
      }));
    },
    async get(k) { try { const d = await this.open(); return await new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const d = await this.open(); await new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} },
    async clear() { try { const d = await this.open(); await new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} }
  };
  const ckey = () => 'cache:' + ME.uid + ':' + ME.member.school_id;
  let since = null, saveT = 0;
  const myClasses = () => JSON.stringify(((mapOf('affectations').get(ME.member.profile_id) || {}).classes || []).slice().sort());
  const finger = () => ME.member.role + '|' + ME.member.profile_id + '|' + (ME.member.role === 'admin' ? '' : myClasses());
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const rows = {}; for (const [c, m] of Object.entries(cache)) rows[c] = Object.fromEntries(m);
      IDB.set(ckey(), { rows, since, finger: finger(), full: fullAt });
    }, 1500);
  }
  let fullAt = 0;
  async function fetchRows(after) {
    const sid = ME.member.school_id, rows = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from('ecole_docs').select('col,id,data,updated_at').eq('school_id', sid);
      if (after) q = q.gt('updated_at', after);
      const { data, error } = await q.order('updated_at').order('col').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }
  const back = iso => new Date(new Date(iso).getTime() - 120000).toISOString();   // marge de 2 minutes

  async function fullLoad() {
    const rows = await fetchRows(null);
    const fresh = {};
    for (const r of rows) (fresh[r.col] = fresh[r.col] || new Map()).set(r.id, r.data);
    for (const col of new Set([...Object.keys(cache), ...Object.keys(fresh)])) {
      const m = fresh[col] || new Map();
      for (const [id, d] of mapOf(col)) if (pending[col + '/' + id]) m.set(id, d);   // écriture locale en cours
      cache[col] = m;
    }
    since = rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), since || '1970-01-01T00:00:00Z');
    fullAt = Date.now();
  }
  async function deltaLoad() {
    const sid = ME.member.school_id, after = back(since);
    const rows = await fetchRows(after);
    const { data: gone, error } = await sb.from('ecole_deleted').select('col,id,at').eq('school_id', sid).gt('at', after).limit(5000);
    if (error) throw error;
    for (const g of gone) if (!pending[g.col + '/' + g.id]) mapOf(g.col).delete(g.id);
    for (const r of rows) if (!pending[r.col + '/' + r.id]) mapOf(r.col).set(r.id, r.data);
    since = rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), since);
  }

  let loading = null;
  function loadAll() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const before = loaded ? finger() : null;
        if (!since || Date.now() - fullAt > 7 * 86400000) await fullLoad();
        else {
          await deltaLoad();
          // nouvelle classe attribuée à l'enseignant : tout recharger pour recevoir ses anciens documents
          if (ME.member.role !== 'admin' && before !== null && before !== finger()) await fullLoad();
        }
        loaded = true; emitAll(); saveSoon();
      } finally { loading = null; }
    })();
    return loading;
  }
  async function restoreLocal() {
    const c = await IDB.get(ckey());
    if (!c || !c.rows) return false;
    for (const [col, obj] of Object.entries(c.rows)) cache[col] = new Map(Object.entries(obj));
    since = c.since; fullAt = c.full || 0;
    if (c.finger !== finger()) { since = null; }   // rôle ou classes changés : rechargement complet
    loaded = true; emitAll();
    return true;
  }

  function listen() {
    const sid = ME.member.school_id;
    let first = true;
    channel = sb.channel('ecole-' + sid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ecole_docs', filter: 'school_id=eq.' + sid }, p => {
        const row = p.eventType === 'DELETE' ? p.old : p.new;
        if (!row || !row.col) return;
        if (pending[row.col + '/' + row.id]) return;
        if (p.eventType === 'DELETE') mapOf(row.col).delete(row.id);
        else mapOf(row.col).set(row.id, row.data);
        if (row.updated_at && since && row.updated_at > since) since = row.updated_at;
        emit(row.col); saveSoon();
      })
      .subscribe(st => {
        if (st === 'SUBSCRIBED') { if (!first) loadAll().catch(() => {}); first = false; }
      });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (ME && loaded && hiddenAt && Date.now() - hiddenAt > 45000) loadAll().catch(() => {});
  });

  const errCode = e => ({ code: e && (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) ? 'permission_denied' : 'unavailable', message: e && e.message });
  const rid = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', b = crypto.getRandomValues(new Uint8Array(20)); return [...b].map(x => a[x % 62]).join(''); };

  function docRef(col, id) {
    const key = () => col + '/' + id;
    return {
      id,
      async set(data) {
        const m = mapOf(col), had = m.has(id), prev = m.get(id);
        const clean = JSON.parse(JSON.stringify(data ?? {}));
        m.set(id, clean); pending[key()] = (pending[key()] || 0) + 1; emit(col);
        try {
          const { data: out, error } = await sb.from('ecole_docs')
            .upsert({ school_id: ME.member.school_id, col, id, data: clean, updated_by: ME.uid })
            .select('data').maybeSingle();
          if (error) throw error;
          if (out && pending[key()] === 1) m.set(id, out.data);
          saveSoon();
        } catch (e) {
          if (pending[key()] === 1) { had ? m.set(id, prev) : m.delete(id); }
          throw errCode(e);
        } finally { pending[key()]--; if (!pending[key()]) delete pending[key()]; emit(col); }
      },
      async get() { const d = mapOf(col).get(id); return { id, exists: d !== undefined, data: () => d }; },
      async delete() {
        const m = mapOf(col), had = m.has(id), prev = m.get(id);
        m.delete(id); pending[key()] = (pending[key()] || 0) + 1; emit(col);
        try {
          const { error } = await sb.from('ecole_docs').delete().eq('school_id', ME.member.school_id).eq('col', col).eq('id', id);
          if (error) throw error;
          saveSoon();
        } catch (e) { if (had) m.set(id, prev); throw errCode(e); }
        finally { pending[key()]--; if (!pending[key()]) delete pending[key()]; emit(col); }
      }
    };
  }

  const db = {
    collection(col) {
      return {
        doc: id => docRef(col, id || rid()),
        onSnapshot(cb, err) {
          const s = { cb, err }; (subs[col] = subs[col] || new Set()).add(s);
          if (loaded) setTimeout(() => emit(col), 0);
          return () => subs[col].delete(s);
        }
      };
    }
  };

  const user = {
    id: async () => ME.uid,
    canEdit: async () => ME.member.role === 'admin',
    name: async () => ME.member.nom || ''
  };

  /* ---------- Assistant IA (Gemini, via la fonction « ecole-ia ») ---------- */
  async function askIA(prompt, asJson, opts) {
    const signal = opts && opts.signal;
    if (signal && signal.aborted) throw { code: 'cancelled' };
    const call = sb.functions.invoke('ecole-ia', { body: { prompt: String(prompt), json: !!asJson } });
    const res = await (signal ? Promise.race([call, new Promise((_, ko) => signal.addEventListener('abort', () => ko({ code: 'cancelled' })))]) : call);
    if (res.error) {
      let code = 'unavailable';
      try { const j = await res.error.context.json(); code = j.code || code; } catch (e) {}
      throw { code };
    }
    return String(res.data && res.data.text || '');
  }
  function parseJSON(t) {
    const s = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    const m = s.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return [s];
  }
  const sample = {
    text: (p, o) => askIA(p, false, o),
    json: async (p, o) => parseJSON(await askIA(p, true, o))
  };

  /* ---------- Téléchargements : partage direct (WhatsApp…) ou enregistrement ---------- */
  const downloads = {
    async save({ filename, data, text }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share(text ? { files: [file], title: filename, text } : { files: [file], title: filename }); return; }
        catch (e) { if (e && e.name === 'AbortError') throw { code: 'declined' }; }
      }
      const url = URL.createObjectURL(file), a = document.createElement('a');
      a.href = url; a.download = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, '-'); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  };

  const API = { db, user, sample, downloads };
  window.claude = { use: name => API[name] ? ready.then(() => API[name]) : Promise.reject({ code: 'not_available' }) };

  /* ---------- Écran de connexion ---------- */
  const css = `
  #auth{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;overflow:auto;
    background:radial-gradient(circle at 25% 15%,#533989 0%,#3a1e72 40%,#0f0820 100%);color:#fff;font-family:Outfit,system-ui,sans-serif}
  #auth[hidden]{display:none!important}
  #auth .box{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px}
  #auth .lg{width:112px;height:112px;margin:0 auto -4px;filter:drop-shadow(0 12px 22px rgba(0,0,0,.4))}
  #auth h1{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:30px;letter-spacing:.5px;margin:0;text-align:center}
  #auth p{margin:0;text-align:center;color:rgba(255,255,255,.78);font-size:14.5px;line-height:1.45}
  #auth .tabs{display:grid;grid-template-columns:1fr 1fr;background:rgba(0,0,0,.28);border-radius:16px;padding:4px}
  #auth .tabs button{border:0;background:none;color:#fff;font:600 14.5px Outfit,sans-serif;padding:11px;border-radius:12px;cursor:pointer}
  #auth .tabs button.on{background:#fff;color:#3a1e72}
  #auth form{display:flex;flex-direction:column;gap:11px}
  #auth label{font-size:13px;font-weight:600;color:rgba(255,255,255,.8);display:flex;flex-direction:column;gap:6px}
  #auth input{font:500 17px Outfit,sans-serif;padding:14px 15px;border-radius:14px;border:1.5px solid rgba(255,255,255,.22);background:rgba(0,0,0,.25);color:#fff;outline:none;width:100%;box-sizing:border-box}
  #auth input:focus{border-color:#fff}
  #auth input.code{letter-spacing:.45em;text-align:center;font-weight:800;font-size:22px}
  #auth .go{border:0;border-radius:16px;padding:15px;font:700 16px Outfit,sans-serif;background:#fff;color:#3a1e72;cursor:pointer;margin-top:4px}
  #auth .go:disabled{opacity:.6}
  #auth .msg{min-height:20px;font-size:14px;text-align:center;color:#e2d6fb}
  #auth .msg.ok{color:#bff0d3}
  #auth .lnk{background:none;border:0;color:#fff;text-decoration:underline;font:500 14px Outfit,sans-serif;cursor:pointer;padding:6px}
  #auth .apk{display:block;text-align:center;margin-top:6px;padding:13px;border-radius:16px;border:1.5px solid rgba(255,255,255,.35);color:#fff;text-decoration:none;font:600 15px Outfit,sans-serif}
  #auth .apk[hidden]{display:none}
  #auth .note{font-size:12.5px;color:rgba(255,255,255,.6);text-align:center}
  #tpick{position:fixed;inset:0;z-index:2147483001;background:rgba(5,3,12,.72);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;font-family:Outfit,system-ui,sans-serif;color:#fff}
  #tpick .tp-box{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:#140d26;border-radius:30px 30px 0 0;padding:24px max(18px,env(safe-area-inset-left,0px)) calc(22px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:14px;animation:tpup .35s cubic-bezier(.2,1,.3,1)}
  @keyframes tpup{from{transform:translateY(40px);opacity:0}}
  #tpick h2{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:26px;margin:0;text-transform:uppercase;line-height:1.05}
  #tpick p{margin:0;color:rgba(255,255,255,.72);font-size:14px}
  #tpick .tp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  #tpick .tp-sw{display:flex;flex-direction:column;gap:8px;align-items:flex-start;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:20px;padding:8px 8px 10px;cursor:pointer;color:#fff;font:600 14px Outfit,sans-serif}
  #tpick .tp-sw[aria-pressed="true"]{border-color:#fff;background:rgba(255,255,255,.1)}
  #tpick .tp-g{display:block;width:100%;height:64px;border-radius:14px;position:relative;overflow:hidden}
  #tpick .tp-g::after{content:"";position:absolute;width:90px;height:90px;border-radius:50%;right:-30px;bottom:-50px;border:14px solid rgba(255,255,255,.14)}
  #tpick .tp-sw b{padding-left:4px}
  #tpick .tp-ok{border:0;border-radius:16px;padding:15px;background:#fff;color:#111;font:700 16px Outfit,sans-serif;cursor:pointer}
  #tpick .tp-no{border:0;background:none;color:rgba(255,255,255,.75);font:600 14px Outfit,sans-serif;padding:8px;cursor:pointer}
  #tpick .tp-msg{min-height:18px;font-size:13.5px;color:#ffd7a8}
  #sigfs{position:fixed;inset:0;z-index:2147483002;background:#fff;color:#111;display:flex;flex-direction:column;font-family:Outfit,system-ui,sans-serif;padding:calc(10px + env(safe-area-inset-top,0px)) 0 calc(10px + env(safe-area-inset-bottom,0px))}
  #sigfs .sf-top{padding:8px 18px;display:flex;flex-direction:column;gap:2px}#sigfs .sf-top b{font-size:20px}#sigfs .sf-top span{font-size:13.5px;color:#666}
  #sigfs canvas{flex:1;width:100%;min-height:0;touch-action:none;display:block;cursor:crosshair}
  #sigfs .sf-line{position:absolute;left:24px;right:24px;bottom:calc(120px + env(safe-area-inset-bottom,0px));border-top:2px dashed #c9c9c9;pointer-events:none}
  #sigfs .sf-bot{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 16px}
  #sigfs .sf-bot button{border:0;border-radius:16px;padding:14px;font:700 15px Outfit,sans-serif;background:#eee;color:#111;cursor:pointer}
  #sigfs .sf-ok{grid-column:1/-1;background:#111!important;color:#fff!important}
  .sf-open{position:absolute;inset:0;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;font:600 14.5px Outfit,sans-serif;color:#555}
  .sf-open span{background:rgba(255,255,255,.92);border-radius:999px;padding:9px 14px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
  .sigpad.sf-done .sf-open span{font-size:12px;padding:5px 10px;position:absolute;right:8px;top:8px}
  .sigpad.sf-done .sigline{display:none}
  .clr-acc{display:flex;align-items:center;gap:12px;margin:18px 0 6px;padding:14px 16px;border-radius:18px;background:var(--surface,#1a1033);border:1px solid var(--line,#2e1d55);color:var(--ink,#fff);font-family:var(--f-b,Outfit,sans-serif)}
  .clr-acc span{flex:1;min-width:0;font-size:14px;line-height:1.35}.clr-acc small{display:block;color:var(--muted,rgba(255,255,255,.7))}
  .clr-acc button{border:1px solid var(--line,#2e1d55);background:transparent;color:inherit;font:600 14px var(--f-b,Outfit,sans-serif);padding:10px 14px;border-radius:12px;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const box = document.createElement('div'); box.id = 'auth'; box.hidden = true;
  box.innerHTML = `<div class="box">
    <img class="lg" src="${EC && EC.code !== 'CLR' ? (EC.logo || '../racine-192.png') : 'icon-192-v3.png'}" alt="" style="${EC && EC.code !== 'CLR' && EC.logo ? 'border-radius:50%;background:#fff;padding:8px' : ''}">
    <h1>${EC ? EC.nom.replace(/[<>&]/g, '') : 'racine.ia'}</h1>
    <p id="a-sub">Connectez-vous avec votre numéro de téléphone.</p>
    <div class="tabs" role="tablist"><button type="button" data-t="in" class="on">Se connecter</button><button type="button" data-t="up">Première fois</button></div>
    <form id="a-in" autocomplete="on">
      <label>Numéro de téléphone<input name="tel" type="tel" inputmode="tel" autocomplete="username" placeholder="08x xxx xxxx" required></label>
      <label>Mot de passe<input name="pw" type="password" autocomplete="current-password" required></label>
      <button class="go" type="submit">Se connecter</button>
      <button class="lnk" type="button" data-t="up">Mot de passe oublié ?</button>
    </form>
    <form id="a-up" hidden>
      <p>Utilisez le code personnel à 4 chiffres donné par la direction. Il relie ce téléphone à votre profil.</p>
      <label>Code de l’école<input name="school" autocapitalize="characters" required value="${((EC && EC.code) || '').replace(/"/g, '')}" placeholder="Ex. CLR"></label>
      <label>Code personnel (4 chiffres)<input class="code" name="code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="one-time-code" required></label>
      <label>Numéro de téléphone<input name="tel" type="tel" inputmode="tel" autocomplete="username" placeholder="08x xxx xxxx" required></label>
      <label>Choisissez un mot de passe<input name="pw" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="go" type="submit">Créer mon accès</button>
      <p class="note">Mot de passe oublié : refaites cette étape avec le même téléphone et votre code ; le nouveau mot de passe remplace l’ancien.</p>
    </form>
    <div class="msg" id="a-msg" role="status"></div>
    <a class="apk" id="a-apk" href="../racine.apk" download hidden>⬇ Télécharger l’application Android</a>
  </div>`;
  const mount = () => document.body.appendChild(box);
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  const $a = s => box.querySelector(s);
  // Bouton d'installation : seulement sur Android, dans le navigateur (pas dans l'application déjà installée)
  try {
    const installed = matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://');
    if (/Android/i.test(navigator.userAgent) && !installed) $a('#a-apk').hidden = false;
  } catch (e) {}
  const msg = (t, ok) => { const m = $a('#a-msg'); m.textContent = t || ''; m.className = 'msg' + (ok ? ' ok' : ''); };
  function tab(t) {
    box.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $a('#a-in').hidden = t !== 'in'; $a('#a-up').hidden = t !== 'up';
    $a('#a-sub').textContent = t === 'in' ? 'Connectez-vous avec votre numéro de téléphone.' : 'Créer votre accès (ou changer de mot de passe).';
    msg('');
  }
  box.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) tab(b.dataset.t); });
  const busy = (f, on) => { const b = f.querySelector('.go'); b.disabled = on; };

  $a('#a-in').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; const tel = normPhone(f.tel.value);
    if (tel.length < 11) return msg('Numéro de téléphone invalide.');
    busy(f, true); msg('Connexion…', true);
    const { error } = await sb.auth.signInWithPassword({ email: emailOf(tel), password: f.pw.value });
    busy(f, false);
    if (error) return msg(/invalid/i.test(error.message) ? 'Téléphone ou mot de passe incorrect.' : 'Connexion impossible. Vérifiez internet.');
    msg(''); start();
  });
  $a('#a-up').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; const tel = normPhone(f.tel.value);
    if (tel.length < 11) return msg('Numéro de téléphone invalide.');
    busy(f, true); msg('Vérification du code…', true);
    let out = {};
    try {
      const r = await fetch(CFG.url + '/functions/v1/ecole-compte', {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: CFG.anonKey, authorization: 'Bearer ' + CFG.anonKey },
        body: JSON.stringify({ school: f.school.value, code: f.code.value, phone: tel, password: f.pw.value })
      });
      out = await r.json().catch(() => ({}));
      if (!r.ok) { busy(f, false); return msg(out.error || 'Création impossible. Réessayez.'); }
    } catch (err) { busy(f, false); return msg('Pas de connexion internet.'); }
    const { error } = await sb.auth.signInWithPassword({ email: out.email || emailOf(tel), password: f.pw.value });
    busy(f, false);
    if (error) return msg('Accès créé, mais la connexion a échoué. Touchez « Se connecter ».');
    msg(''); start();
  });

  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { box.hidden = false; return; }
    const { data: member, error } = await sb.from('ecole_members').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) {
      box.hidden = false;
      return msg(/does not exist|relation/i.test(error.message) ? 'La base de données de l’école n’est pas encore installée.' : 'Connexion au serveur impossible. Vérifiez internet puis rouvrez l’application.');
    }
    if (!member) { await sb.auth.signOut(); box.hidden = false; tab('up'); return msg('Ce compte n’est relié à aucun profil. Utilisez votre code personnel.'); }
    try {
      const { data: st } = await sb.rpc('racine_mon_ecole');
      const e = Array.isArray(st) ? st[0] : st;
      if (e && e.code) {
        const info = { code: e.code, nom: e.nom, devise: e.devise || '', logo: e.logo || '', theme: e.theme || '' };
        const prev = window.ECOLE;
        try { localStorage.setItem('racine-ecole', JSON.stringify(info)); } catch (x) {}
        const changed = !prev ? e.code !== 'CLR' : (prev.code !== info.code || prev.nom !== info.nom || prev.logo !== info.logo || prev.devise !== info.devise || (prev.theme || '') !== info.theme);
        if (changed && !sessionStorage.getItem('racine-reload')) { try { sessionStorage.setItem('racine-reload', '1'); } catch (x) {} location.reload(); return; }
        window.ECOLE = info; document.title = info.nom; window.__theme = info.theme || 'violet'; window.applyTheme();
        if (member.role === 'admin' && !info.theme) { const wait = () => { const it = document.getElementById('intro'); if (it && !it.hidden) return setTimeout(wait, 600); setTimeout(() => themePicker(true), 400); }; setTimeout(wait, 800); } try { sessionStorage.removeItem('racine-reload'); } catch (x) {}
      }
      if (e && e.actif === false) {
        box.hidden = false;
        box.querySelector('.box').innerHTML = `<img class="lg" src="icon-192-v3.png" alt=""><h1>Accès suspendu</h1>
          <p>L’accès de <b>${(e.nom || 'votre école').replace(/[<>&]/g, '')}</b> est suspendu par racine.ia. Vos données sont conservées. La direction doit régulariser l’abonnement pour rouvrir l’accès.</p>
          <button class="go" type="button" id="a-out">Se déconnecter</button><a class="lnk" href="../" style="text-align:center">Retour à racine.ia</a>`;
        box.querySelector('#a-out').onclick = () => window.appLogout();
        return;
      }
    } catch (err) {}
    if (ME) return;
    ME = { uid: session.user.id, member, phone: session.user.email.split('@')[0] };
    box.hidden = true;
    const had = await restoreLocal();
    if (had) { readyResolve(); loadAll().catch(() => {}); listen(); return; }
    try { await loadAll(); } catch (e) { loaded = true; emitAll(); }
    listen();
    readyResolve();
  }

  async function backup() {
    try { await loadAll(); } catch (e) {}
    const rows = {}; for (const [c, m] of Object.entries(cache)) rows[c] = Object.fromEntries(m);
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify({ ecole: (window.ECOLE && window.ECOLE.nom) || 'École', date: new Date().toISOString(), version: 1, donnees: rows })], { type: 'application/json' });
    try { await downloads.save({ filename: `Sauvegarde ${(window.ECOLE && window.ECOLE.nom) || 'école'} ${date}.json`, data: blob }); } catch (e) {}
  }

  window.appLogout = async () => {
    try { if (channel) await sb.removeChannel(channel); } catch (e) {}
    await IDB.clear();
    try { localStorage.removeItem('racine-ecole'); sessionStorage.removeItem('racine-reload'); } catch (e) {}
    await sb.auth.signOut();
    try { localStorage.removeItem('clr-intro'); } catch (e) {}
    location.reload();
  };

  /* Bloc « Mon compte » ajouté dans Gestion (direction) et sur le profil (enseignant) */
  function accountBlock() {
    if (!ME) return;
    const inS = typeof S !== 'undefined';
    const host = (inS && S.view === 'gestion' && document.querySelector('[data-act="go"][data-v="presence"]')?.parentElement)
      || (inS && S.view === 'prof' && (S.pid === ME.member.profile_id || S.pid === ME.uid) && document.querySelector('.pf-page .prof'));
    if (!host || host.querySelector(':scope > .clr-acc')) return;
    const d = document.createElement('div'); d.className = 'clr-acc';
    const tel = '+' + ME.phone;
    d.innerHTML = `<span><b>${(ME.member.nom || 'Mon compte').replace(/[<>&]/g, '')}</b><small>Connecté avec ${tel} · ${ME.member.role === 'admin' ? 'Direction' : 'Enseignant'}</small></span><button type="button">Se déconnecter</button>`;
    d.querySelector('button').onclick = () => window.appLogout();
    host.appendChild(d);
    if (ME.member.role === 'admin' && S.view === 'gestion') {
      const tc = document.createElement('div'); tc.className = 'clr-acc';
      tc.innerHTML = `<span><b>Couleurs de l’application</b><small>Thème actuel : ${themeOf(window.__theme)[1]} · pour toute l’école</small></span><button type="button">Changer</button>`;
      tc.querySelector('button').onclick = () => themePicker(false);
      host.insertBefore(tc, d);
      const k = document.createElement('div'); k.className = 'clr-acc';
      k.innerHTML = `<span><b>Sauvegarde des données</b><small>Une copie de toutes les données de l’école (élèves, cotes, appels, rapports…). À faire chaque vendredi et à garder en lieu sûr.</small></span><button type="button">Sauvegarder</button>`;
      k.querySelector('button').onclick = backup;
      host.insertBefore(k, d);
    }
  }
  addEventListener('load', () => {
    if (typeof window.render === 'function') {
      const r = window.render;
      window.render = function () { const out = r.apply(this, arguments); try { accountBlock(); } catch (e) {} try { histSync(); } catch (e) {} return out; };
    }
    histInit();
  });


  /* ---------- Signature en plein écran (présence, parents, enseignants) ---------- */
  function sigFull(pad) {
    const small = pad.querySelector('canvas'); if (!small) return;
    const ov = document.createElement('div'); ov.id = 'sigfs';
    ov.innerHTML = `<div class="sf-top"><b>Signez ici avec le doigt</b><span>Utilisez toute la surface blanche</span></div><canvas></canvas><div class="sf-line"></div>
      <div class="sf-bot"><button type="button" class="sf-c">Effacer</button><button type="button" class="sf-x">Annuler</button><button type="button" class="sf-ok">Valider la signature</button></div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'); const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; c.lineWidth = 4.2;
    let draw = false, last = null, ink = false, box = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const grow = p => { box = box ? [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])] : [p[0], p[1], p[0], p[1]]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); draw = true; last = pos(e); grow(last); c.beginPath(); c.arc(last[0], last[1], 2, 0, 6.283); c.fillStyle = '#111'; c.fill(); ink = true; });
    cv.addEventListener('pointermove', e => { if (!draw) return; const p = pos(e); c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke(); last = p; grow(p); });
    const up = () => { draw = false; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    ov.querySelector('.sf-c').onclick = () => { c.clearRect(0, 0, W, H); ink = false; box = null; };
    ov.querySelector('.sf-x').onclick = () => ov.remove();
    ov.querySelector('.sf-ok').onclick = () => {
      if (!ink) { ov.querySelector('.sf-top span').textContent = 'Signez d’abord dans la zone blanche.'; return; }
      const pad0 = 12, bx = Math.max(0, box[0] - pad0), by = Math.max(0, box[1] - pad0), bw = Math.min(W, box[2] + pad0) - bx, bh = Math.min(H, box[3] + pad0) - by;
      const sc = small.getContext('2d'); sc.save(); sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, small.width, small.height);
      const k = Math.min(small.width * .92 / bw, small.height * .8 / bh); const dw = bw * k, dh = bh * k;
      sc.drawImage(cv, bx * dpr, by * dpr, bw * dpr, bh * dpr, (small.width - dw) / 2, (small.height - dh) / 2, dw, dh); sc.restore();
      small.dataset.ink = '1'; pad.classList.add('sf-done'); const lb = pad.querySelector('.sf-open span'); if (lb) lb.textContent = '✍️ Refaire la signature'; ov.remove();
    };
  }
  function sigWatch() {
    document.querySelectorAll('.sigpad:not([data-fs])').forEach(pad => {
      pad.dataset.fs = '1';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sf-open';
      b.innerHTML = '<span>✍️ Touchez pour signer en plein écran</span>';
      b.onclick = () => sigFull(pad); pad.appendChild(b);
    });
  }
  new MutationObserver(() => sigWatch()).observe(document.documentElement, { childList: true, subtree: true });
  /* ---------- Bouton retour du téléphone : revenir à l'écran précédent ---------- */
  const HK = ['view', 'cid', 'ctab', 'pid', 'pBack', 'pTab', 'aVue', 'pDate'];
  let overlay = null, restoring = false;
  const snap = () => { const o = {}; if (typeof S === 'undefined') return o; HK.forEach(k => { o[k] = S[k] === undefined ? null : S[k]; }); return o; };
  const same = (a, b) => HK.every(k => (a && a[k]) === (b && b[k]));
  function histSync() {
    if (restoring || overlay) return;
    const cur = snap(), top = history.state && history.state.racine;
    if (!top) { history.replaceState({ racine: cur }, ''); return; }
    if (!same(top, cur)) history.pushState({ racine: cur }, '');
  }
  function histInit() {
    if (typeof S === 'undefined') return;
    history.replaceState({ racine: snap() }, '');
    const wrapOpen = (name, kind) => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const out = f.apply(this, arguments); if (!overlay) { overlay = kind; history.pushState({ racine: snap(), overlay: kind }, ''); } return out; }; };
    const wrapClose = (name, kind) => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const was = overlay === kind; overlay = null; const out = f.apply(this, arguments); if (was && history.state && history.state.overlay) history.replaceState({ racine: snap() }, ''); return out; }; };
    wrapOpen('openSheet', 'sheet'); wrapClose('closeSheet', 'sheet');
    wrapOpen('openBulFS', 'fs'); wrapClose('closeBulFS', 'fs');
    addEventListener('popstate', ev => {
      if (overlay === 'sheet') { overlay = null; try { closeSheet(); } catch (e) {} return; }
      if (overlay === 'fs') { overlay = null; try { closeBulFS(); } catch (e) {} return; }
      const st = ev.state && ev.state.racine; if (!st) return;
      if (same(st, snap())) { history.back(); return; }   // doublon : on recule encore
      restoring = true; try { Object.assign(S, st); render(); scrollTo(0, 0); } finally { restoring = false; }
    });
  }

  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && ME) location.reload(); });
  start().catch(() => { box.hidden = false; msg('Connexion au serveur impossible. Vérifiez internet.'); });
})();
