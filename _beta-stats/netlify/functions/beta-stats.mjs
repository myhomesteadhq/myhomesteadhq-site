// Private stats view for the /beta tester page.
//   /.netlify/functions/beta-stats?key=SECRET                  -> HTML table
//   ...&format=json                                             -> JSON
//   ...&since=2026-09-28                                        -> only count events on/after that date (UTC)
//   ...&reset=test&confirm=yes                                  -> delete every event recorded for src=test
// The key is the BETA_STATS_KEY environment variable on this Netlify site.
import { getStore } from "@netlify/blobs";

const COLS = ["visit", "session", "step1", "step2", "demo"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sameKey = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function allKeys(store, prefix) {
  const keys = [];
  for await (const page of store.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key);
  return keys;
}

export default async (req) => {
  const url = new URL(req.url);
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!sameKey(url.searchParams.get("key") || "", Netlify.env.get("BETA_STATS_KEY") || "")) {
    return new Response("Not found", { status: 404, headers });
  }
  const store = getStore({ name: "beta-events", consistency: "strong" });

  const reset = url.searchParams.get("reset");
  if (reset) {
    const src = reset.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
    if (!src || url.searchParams.get("confirm") !== "yes") {
      return new Response("Add &confirm=yes to delete every event for that source.", { status: 400, headers });
    }
    const keys = await allKeys(store, `e/${src}/`);
    for (let i = 0; i < keys.length; i += 25) await Promise.all(keys.slice(i, i + 25).map((k) => store.delete(k)));
    return Response.json({ deleted: keys.length, src }, { headers });
  }

  const sinceStr = url.searchParams.get("since");
  const since = sinceStr ? Date.parse(sinceStr) : 0;
  const rows = {};
  let first = null, last = null;
  for (const k of await allKeys(store, "e/")) {
    const [, src, ev, id] = k.split("/");
    const t = parseInt(String(id).split("-")[0], 36);
    if (since && t < since) continue;
    rows[src] ??= Object.fromEntries(COLS.map((c) => [c, 0]));
    if (ev in rows[src]) rows[src][ev]++;
    first = first === null ? t : Math.min(first, t);
    last = last === null ? t : Math.max(last, t);
  }
  const total = Object.fromEntries(COLS.map((c) => [c, Object.values(rows).reduce((n, r) => n + r[c], 0)]));
  const sorted = Object.entries(rows).sort((a, b) => b[1].visit - a[1].visit);
  const iso = (t) => (t === null ? null : new Date(t).toISOString());

  if (url.searchParams.get("format") === "json") {
    return Response.json({ since: sinceStr || null, first: iso(first), last: iso(last), total, bySource: Object.fromEntries(sorted) }, { headers });
  }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");
  const tr = (name, r, tag = "td") =>
    `<tr><${tag}>${esc(name)}</${tag}>${COLS.map((c) => `<${tag}>${r[c]}</${tag}>`).join("")}<${tag}>${pct(r.step1, r.session)}</${tag}><${tag}>${pct(r.step2, r.session)}</${tag}></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>/beta stats</title>
<style>body{font-family:system-ui,sans-serif;background:#f4efe2;color:#3f5236;padding:16px;margin:0}
table{border-collapse:collapse;width:100%;max-width:760px;background:#fbf7ee}th,td{border:1px solid #e2dac6;padding:8px;text-align:right}
th:first-child,td:first-child{text-align:left}thead th{background:#6e8e5e;color:#f4efe2}tfoot th{background:#eaf0e1}
p{color:#6b6a5e;font-size:14px;max-width:760px;line-height:1.5}</style></head><body>
<h1 style="font-family:Georgia,serif">myhomesteadhq.com/beta: visits &amp; taps by source</h1>
<p>${sinceStr ? `Counting events since ${esc(sinceStr)} (UTC). ` : ""}First event: ${iso(first) || "none"} · last event: ${iso(last) || "none"} (UTC).</p>
<div style="overflow-x:auto"><table><thead><tr><th>source</th><th>visits</th><th>sessions</th><th>Step 1 taps</th><th>Step 2 taps</th><th>demo taps</th><th>Step 1 / session</th><th>Step 2 / session</th></tr></thead>
<tbody>${sorted.map(([s, r]) => tr(s, r)).join("") || `<tr><td colspan="8">No events yet.</td></tr>`}</tbody>
<tfoot>${tr("total", total, "th")}</tfoot></table></div>
<p><b>visits</b> = page loads · <b>sessions</b> = first load per browser tab session (closest thing to unique visitors) · <b>Step 1</b> = taps on "Join the tester group" · <b>Step 2</b> = taps on "Get the app on Google Play" · <b>direct</b> = no ?src in the link.
No personal data is stored: only source, event type and time. Add <code>&amp;since=YYYY-MM-DD</code> to ignore older events, <code>&amp;format=json</code> for JSON.</p>
</body></html>`;
  return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
};
