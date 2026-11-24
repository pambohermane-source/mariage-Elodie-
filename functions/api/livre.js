// Livre d'or partagé — visible par tous les invités (liaison KV : MARIAGE)
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export async function onRequestGet({ env }) {
  if (!env.MARIAGE) return json([]);
  const page = await env.MARIAGE.list({ prefix: "mot:", limit: 300 });
  const items = await Promise.all(page.keys.map((k) => env.MARIAGE.get(k.name, "json")));
  const list = items.filter(Boolean).sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .map((m) => ({ nom: m.nom, texte: m.texte, date: new Date(m.ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Libreville" }) }));
  return json(list);
}

export async function onRequestPost({ request, env }) {
  if (!env.MARIAGE) return json({ ok: false }, 500);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
  const nom = clean(b.nom, 80), texte = clean(b.texte, 600);
  if (!nom || !texte) return json({ ok: false }, 400);
  const ts = new Date().toISOString();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await env.MARIAGE.put("mot:" + id, JSON.stringify({ nom, texte, ts }));
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  if (!env.CODE_ADMIN || url.searchParams.get("code") !== env.CODE_ADMIN) return json({ ok: false }, 401);
  const page = await env.MARIAGE.list({ prefix: "mot:", limit: 300 });
  const target = url.searchParams.get("ts");
  for (const k of page.keys) {
    const v = await env.MARIAGE.get(k.name, "json");
    if (v && v.ts === target) await env.MARIAGE.delete(k.name);
  }
  return json({ ok: true });
}
