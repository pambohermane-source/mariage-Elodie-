// Site du mariage — pages statiques (dossier public/) + API confirmations & livre d'or (KV : MARIAGE)
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isAdmin = (url, env) => !!env.CODE_ADMIN && url.searchParams.get("code") === env.CODE_ADMIN;

async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

async function rsvp(request, env, url) {
  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
    const nom = clean(b.nom, 120);
    const presence = ["tout", "ceremonie", "soiree", "absent"].includes(b.presence) ? b.presence : "";
    if (!nom || !presence) return json({ ok: false, error: "Champs manquants" }, 400);
    const nb = presence === "absent" ? 0 : Math.max(1, Math.min(10, parseInt(b.nb, 10) || 1));
    await env.MARIAGE.put("rsvp:" + newId(), JSON.stringify({ nom, presence, nb, mot: clean(b.mot, 1000), date: new Date().toISOString() }));
    return json({ ok: true });
  }
  if (!isAdmin(url, env)) return json({ ok: false, error: "Code incorrect" }, 401);
  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (id) await env.MARIAGE.delete("rsvp:" + id);
    return json({ ok: true });
  }
  const keys = await listAll(env.MARIAGE, "rsvp:");
  const items = await Promise.all(keys.map(async (k) => {
    const v = await env.MARIAGE.get(k.name, "json");
    return v ? Object.assign({ id: k.name.slice(5) }, v) : null;
  }));
  return json({ ok: true, items: items.filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1)) });
}

async function livre(request, env, url) {
  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
    const nom = clean(b.nom, 80), texte = clean(b.texte, 600);
    if (!nom || !texte) return json({ ok: false }, 400);
    await env.MARIAGE.put("mot:" + newId(), JSON.stringify({ nom, texte, ts: new Date().toISOString() }));
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    if (!isAdmin(url, env)) return json({ ok: false }, 401);
    const target = url.searchParams.get("ts");
    for (const k of await listAll(env.MARIAGE, "mot:")) {
      const v = await env.MARIAGE.get(k.name, "json");
      if (v && v.ts === target) await env.MARIAGE.delete(k.name);
    }
    return json({ ok: true });
  }
  const keys = await listAll(env.MARIAGE, "mot:");
  const items = await Promise.all(keys.map((k) => env.MARIAGE.get(k.name, "json")));
  return json(items.filter(Boolean).sort((a, b) => (a.ts < b.ts ? 1 : -1)).map((m) => ({
    nom: m.nom, texte: m.texte,
    date: new Date(m.ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Libreville" })
  })));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env.MARIAGE) return json({ ok: false, error: "Stockage KV non configuré" }, 500);
      try {
        if (url.pathname === "/api/rsvp") return await rsvp(request, env, url);
        if (url.pathname === "/api/livre") return await livre(request, env, url);
      } catch (e) {
        return json({ ok: false, error: "Erreur serveur" }, 500);
      }
      return json({ ok: false }, 404);
    }
    if (url.pathname === "/admin") return env.ASSETS.fetch(new Request(new URL("/admin.html", url), request));
    return env.ASSETS.fetch(request);
  }
};
