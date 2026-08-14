const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...JSON_HEADERS, ...headers },
});

const corsHeaders = (origin, allowedOrigin) => ({
  "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const validTrackId = (value) => typeof value === "string"
  && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  && value.length <= 80;

const validListenerId = (value) => typeof value === "string"
  && /^[a-zA-Z0-9_-]{20,100}$/.test(value);

const hmac = async (secret, value) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const dateParts = (date = new Date()) => {
  const iso = date.toISOString();
  return {
    month: iso.slice(0, 7),
    day: iso.slice(0, 10),
    bucket: Math.floor(date.getUTCHours() / 6),
    iso,
  };
};

const originAllowed = (request, env) => request.headers.get("Origin") === env.ALLOWED_ORIGIN;

const handleListen = async (request, env) => {
  if (!originAllowed(request, env)) return json({ error: "Origin not allowed." }, 403);
  if (!env.ANALYTICS_HASH_SECRET || env.ANALYTICS_HASH_SECRET.length < 24) return json({ error: "Analytics secret is not configured." }, 503);
  const length = Number(request.headers.get("Content-Length")) || 0;
  if (length > 2048) return json({ error: "Request is too large." }, 413);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!validTrackId(payload?.trackId) || !validListenerId(payload?.listenerId)) return json({ error: "Invalid listening event." }, 400);

  const now = dateParts();
  const network = request.headers.get("CF-Connecting-IP") || "unknown";
  const [listenerHash, networkHash] = await Promise.all([
    hmac(env.ANALYTICS_HASH_SECRET, `${now.month}:${payload.listenerId}`),
    hmac(env.ANALYTICS_HASH_SECRET, `${now.day}:${network}`),
  ]);

  const networkUsage = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM qualified_listens WHERE network_hash = ? AND day = ?"
  ).bind(networkHash, now.day).first();
  if ((Number(networkUsage?.count) || 0) >= 120) return json({ error: "Daily listening limit reached." }, 429);

  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO qualified_listens
      (month, day, time_bucket, track_id, listener_hash, network_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(now.month, now.day, now.bucket, payload.trackId, listenerHash, networkHash, now.iso).run();

  return json({ counted: Number(result.meta?.changes) === 1, month: now.month }, 202, { "Cache-Control": "no-store" });
};

const handleMonthlyChart = async (request, env) => {
  const url = new URL(request.url);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : currentMonth;
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  const result = await env.DB.prepare(
    `SELECT track_id AS trackId, COUNT(*) AS plays
       FROM qualified_listens
      WHERE month = ?
      GROUP BY track_id
      ORDER BY plays DESC, track_id ASC
      LIMIT ?`
  ).bind(month, limit).all();
  return json({ month, tracks: result.results || [] }, 200, { "Cache-Control": "public, max-age=300" });
};

const handleRequest = async (request, env) => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (request.method === "OPTIONS") {
    if (!originAllowed(request, env)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  let response;
  if (request.method === "GET" && url.pathname === "/v1/health") response = json({ ok: true, service: "xotiic-song-stats" });
  else if (request.method === "GET" && url.pathname === "/v1/charts/monthly") response = await handleMonthlyChart(request, env);
  else if (request.method === "POST" && url.pathname === "/v1/listens") response = await handleListen(request, env);
  else response = json({ error: "Not found." }, 404);
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch {
      const response = json({ error: "Service temporarily unavailable." }, 503);
      const origin = request.headers.get("Origin") || "";
      for (const [key, value] of Object.entries(corsHeaders(origin, env.ALLOWED_ORIGIN))) response.headers.set(key, value);
      return response;
    }
  },
  scheduled(_controller, env, context) {
    context.waitUntil(env.DB.prepare("DELETE FROM qualified_listens WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-400 days')").run());
  },
};
