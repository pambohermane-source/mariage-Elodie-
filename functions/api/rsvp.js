// Confirmations de présence — stockées dans Cloudflare KV (liaison : MARIAGE)
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!env.MARIAGE) return json({ ok: false, error: "KV non configuré" }, 500);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
  const nom = clean(b.nom, 120);
  const presence = ["tout", "ceremonie", "soiree", "absent"].includes(b.presence) ? b.presence : "";
  if (!nom || !presence) return json({ ok: false, error: "Champs manquants" }, 400);
  const nb = presence === "absent" ? 0 : Math.max(1, Math.min(10, parseInt(b.nb, 10) || 1));
  const entry = { nom, presence, nb, mot: clean(b.mot, 1000), date: new Date().toISOString() };
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await env.MARIAGE.put("rsvp:" + id, JSON.stringify(entry));
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!env.CODE_ADMIN || code !== env.CODE_ADMIN) return json({ ok: false, error: "Code incorrect" }, 401);
  if (!env.MARIAGE) return json({ ok: false, error: "KV non configuré" }, 500);
  const keys = [];
  let cursor;
  do {
    const page = await env.MARIAGE.list({ prefix: "rsvp:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const items = await Promise.all(keys.map(async (k) => {
    const v = await env.MARIAGE.get(k.name, "json");
    return v ? Object.assign({ id: k.name.slice(5) }, v) : null;
  }));
  return json({ ok: true, items: items.filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1)) });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  if (!env.CODE_ADMIN || url.searchParams.get("code") !== env.CODE_ADMIN) return json({ ok: false }, 401);
  const id = url.searchParams.get("id");
  if (id) await env.MARIAGE.delete("rsvp:" + id);
  return json({ ok: true });
}
