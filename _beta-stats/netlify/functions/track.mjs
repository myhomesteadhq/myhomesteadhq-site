// Records one anonymous event for the /beta tester page.
// Called with navigator.sendBeacon(".../track?ev=visit&src=ig&new=1").
// Stores NO personal data: no IP, no user agent, no cookies, no IDs. Only source + event + time.
// Each event is its own tiny blob (append-only), so simultaneous hits never overwrite each other.
import { getStore } from "@netlify/blobs";

const EVENTS = new Set(["visit", "step1", "step2", "demo"]);
const ALLOWED_ORIGINS = new Set(["https://myhomesteadhq.com", "https://www.myhomesteadhq.com"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const cleanSrc = (s) =>
  (String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24)) || "direct";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") return new Response("method", { status: 405, headers: CORS });

  // Only count hits coming from the real site (browsers always send Origin on beacons/POSTs).
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const ev = String(url.searchParams.get("ev") || "");
  if (!EVENTS.has(ev)) return new Response("bad event", { status: 400, headers: CORS });
  const src = cleanSrc(url.searchParams.get("src"));

  const store = getStore({ name: "beta-events", consistency: "strong" });
  const stamp = Date.now().toString(36);
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const writes = [store.set(`e/${src}/${ev}/${stamp}-${rnd()}`, "1")];
  // first page view of a browser session also counts as a "session" (rough unique-visitor number)
  if (ev === "visit" && url.searchParams.get("new") === "1") {
    writes.push(store.set(`e/${src}/session/${stamp}-${rnd()}`, "1"));
  }
  await Promise.all(writes);
  return new Response(null, { status: 204, headers: CORS });
};
