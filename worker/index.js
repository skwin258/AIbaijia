const supportedSites = [
  {
    id: "bc78999",
    name: "BC78999 百家樂",
    url: "https://bc78999.net/",
    embedMode: "blocked",
    isEmbeddable: false,
    fallbackMode: "open-new-tab",
  },
];

const encoder = new TextEncoder();

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...extraHeaders,
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function createToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashPassword(password, salt = createToken()) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 120000, hash: "SHA-256" },
    key,
    256,
  );
  return `${salt}:${[...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  return (await hashPassword(password, salt)).split(":")[1] === hash;
}

function todayIso() {
  return new Date().toISOString();
}

function expiresFromDays(days) {
  const count = Math.max(1, Number(days) || 1);
  return new Date(Date.now() + count * 24 * 60 * 60 * 1000).toISOString();
}

function isUserActive(user) {
  if (!user || !user.enabled) return false;
  if (!user.expiresAt) return true;
  return new Date(user.expiresAt).getTime() > Date.now();
}

async function normalizeAdminStore(store, env) {
  const superUsername = env.SUPERADMIN_USERNAME || "koko85830";
  const superPassword = env.SUPERADMIN_PASSWORD || "change-this-password";
  const admins = Array.isArray(store?.admins) ? store.admins : [];
  if (!admins.some((admin) => admin.username === superUsername)) {
    admins.unshift({
      id: "superadmin",
      username: superUsername,
      passwordHash: await hashPassword(superPassword),
      role: "superadmin",
      enabled: true,
      createdAt: todayIso(),
      updatedAt: todayIso(),
    });
  }
  return {
    admins,
    users: Array.isArray(store?.users) ? store.users : [],
    adminSessions: store?.adminSessions && typeof store.adminSessions === "object" ? store.adminSessions : {},
  };
}

async function readAdminStore(env) {
  const raw = await env.SK_DATA.get("admin-store", "json");
  return normalizeAdminStore(raw || {}, env);
}

async function writeAdminStore(env, store) {
  await env.SK_DATA.put("admin-store", JSON.stringify(await normalizeAdminStore(store, env)));
}

async function readSessionStore(env) {
  return (await env.SK_DATA.get("sessions-store", "json")) || { sessions: {} };
}

async function writeSessionStore(env, store) {
  await env.SK_DATA.put("sessions-store", JSON.stringify(store));
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

async function getCurrentAdmin(request, env) {
  const token = parseCookies(request).sk_admin_session;
  if (!token) return null;
  const store = await readAdminStore(env);
  const session = store.adminSessions[token];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const admin = store.admins.find((item) => item.id === session.adminId && item.enabled);
  return admin ? { admin, store, token } : null;
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    enabled: admin.enabled,
    createdAt: admin.createdAt,
  };
}

function origin(request) {
  return new URL(request.url).origin;
}

function publicUser(user, request) {
  return {
    ...user,
    shortcutUrl: `${origin(request)}/shortcut.html?token=${encodeURIComponent(user.token)}`,
  };
}

function cleanRounds(rounds = []) {
  return rounds
    .map((round) => ({
      result: String(round.result || "").toLowerCase(),
      source: round.source || "manual",
      confidence: Number.isFinite(round.confidence) ? round.confidence : 100,
      createdAt: round.createdAt || todayIso(),
    }))
    .filter((round) => ["banker", "player", "tie"].includes(round.result));
}

function getStreak(nonTieRounds) {
  if (!nonTieRounds.length) return { result: null, count: 0 };
  const result = nonTieRounds[nonTieRounds.length - 1].result;
  let count = 0;
  for (let i = nonTieRounds.length - 1; i >= 0; i -= 1) {
    if (nonTieRounds[i].result !== result) break;
    count += 1;
  }
  return { result, count };
}

function buildRecommendation(rounds = []) {
  const validRounds = cleanRounds(rounds);
  const nonTie = validRounds.filter((round) => round.result !== "tie");
  const recent = nonTie.slice(-12);
  const bankerCount = recent.filter((round) => round.result === "banker").length;
  const playerCount = recent.filter((round) => round.result === "player").length;
  const tieCount = validRounds.slice(-12).filter((round) => round.result === "tie").length;
  const streak = getStreak(nonTie);

  let action = "observe";
  let confidence = 42;
  let riskLevel = "high";
  const reasons = [];

  if (nonTie.length < 6) {
    reasons.push("路單資料偏少，先觀察比進場更穩。");
  } else if (streak.count >= 4) {
    action = streak.result;
    confidence = Math.min(76, 54 + streak.count * 4);
    riskLevel = streak.count >= 6 ? "high" : "medium";
    reasons.push(`目前連續 ${streak.count} 手偏向${streak.result === "banker" ? "莊" : "閒"}，採順勢觀察。`);
  } else {
    const gap = Math.abs(bankerCount - playerCount);
    if (gap >= 3) {
      action = bankerCount < playerCount ? "banker" : "player";
      confidence = Math.min(68, 50 + gap * 4);
      riskLevel = "medium";
      reasons.push("近 12 手莊閒比例拉開，採均值回歸觀察。");
    } else if (streak.count >= 2) {
      action = streak.result;
      confidence = 56 + streak.count * 3;
      riskLevel = "medium";
      reasons.push("短線有連續方向，但差距未大，建議小心跟勢。");
    } else {
      reasons.push("近期莊閒分布接近，沒有明顯優勢訊號。");
    }
  }

  if (tieCount >= 2) {
    confidence = Math.max(35, confidence - 8);
    riskLevel = "high";
    reasons.push("近期和局偏多，路感雜訊較高。");
  }

  if (action === "observe") {
    riskLevel = "high";
    confidence = Math.min(confidence, 48);
  }

  return {
    action,
    confidence,
    riskLevel,
    reasons,
    stats: { totalRounds: validRounds.length, recentWindow: recent.length, bankerCount, playerCount, tieCount, streak },
    disclaimer: "僅供娛樂與統計參考，不保證獲利。",
  };
}

async function handleAdmin(request, env, pathname) {
  if (request.method === "POST" && pathname === "/admin/login") {
    const body = await readJson(request);
    const store = await readAdminStore(env);
    const admin = store.admins.find((item) => item.username === body.username && item.enabled);
    if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
      return json({ error: "帳號或密碼錯誤。" }, 401);
    }
    const token = createToken();
    store.adminSessions[token] = {
      adminId: admin.id,
      createdAt: todayIso(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
    await writeAdminStore(env, store);
    return json({ admin: publicAdmin(admin) }, 200, {
      "set-cookie": `sk_admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=43200`,
    });
  }

  if (request.method === "POST" && pathname === "/admin/logout") {
    const current = await getCurrentAdmin(request, env);
    if (current) {
      delete current.store.adminSessions[current.token];
      await writeAdminStore(env, current.store);
    }
    return json({ ok: true }, 200, {
      "set-cookie": "sk_admin_session=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0",
    });
  }

  const current = await getCurrentAdmin(request, env);
  if (!current) return json({ error: "請先登入。" }, 401);
  const { admin, store } = current;

  if (request.method === "GET" && pathname === "/admin/me") {
    return json({ admin: publicAdmin(admin) });
  }

  if (request.method === "GET" && pathname === "/admin/admins") {
    if (admin.role !== "superadmin") return json({ error: "只有 SUPERADMIN 可以管理管理員。" }, 403);
    return json({ admins: store.admins.map(publicAdmin) });
  }

  if (request.method === "POST" && pathname === "/admin/admins") {
    if (admin.role !== "superadmin") return json({ error: "只有 SUPERADMIN 可以新增管理員。" }, 403);
    const body = await readJson(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    if (!username || !password) return json({ error: "請輸入管理員帳號與密碼。" }, 400);
    if (store.admins.some((item) => item.username === username)) return json({ error: "管理員帳號已存在。" }, 409);
    const newAdmin = {
      id: createId("admin"),
      username,
      passwordHash: await hashPassword(password),
      role: "admin",
      enabled: true,
      createdBy: admin.id,
      createdAt: todayIso(),
      updatedAt: todayIso(),
    };
    store.admins.push(newAdmin);
    await writeAdminStore(env, store);
    return json({ admin: publicAdmin(newAdmin) }, 201);
  }

  if (request.method === "GET" && pathname === "/admin/users") {
    return json({ users: store.users.map((user) => publicUser(user, request)) });
  }

  if (request.method === "POST" && pathname === "/admin/users") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const days = Math.max(1, Number(body.days) || 1);
    if (!name) return json({ error: "請輸入使用者名稱。" }, 400);
    const user = {
      id: createId("user"),
      name,
      token: createToken(),
      enabled: true,
      days,
      startsAt: todayIso(),
      expiresAt: expiresFromDays(days),
      createdBy: admin.id,
      createdAt: todayIso(),
      updatedAt: todayIso(),
    };
    store.users.push(user);
    await writeAdminStore(env, store);
    return json({ user: publicUser(user, request) }, 201);
  }

  const userMatch = pathname.match(/^\/admin\/users\/([^/]+)$/);
  if (userMatch && request.method === "PATCH") {
    const body = await readJson(request);
    const user = store.users.find((item) => item.id === userMatch[1]);
    if (!user) return json({ error: "找不到使用者。" }, 404);
    if (typeof body.name === "string") user.name = body.name.trim() || user.name;
    if (typeof body.enabled === "boolean") user.enabled = body.enabled;
    if (body.days != null) {
      user.days = Math.max(1, Number(body.days) || 1);
      user.expiresAt = expiresFromDays(user.days);
    }
    if (body.resetToken) user.token = createToken();
    user.updatedAt = todayIso();
    await writeAdminStore(env, store);
    return json({ user: publicUser(user, request) });
  }

  return json({ error: "Admin route not found." }, 404);
}

async function handleApi(request, env, pathname) {
  if (pathname.startsWith("/admin/")) return handleAdmin(request, env, pathname);

  if (request.method === "GET" && pathname === "/access/validate") {
    const token = new URL(request.url).searchParams.get("token");
    const store = await readAdminStore(env);
    const user = store.users.find((item) => item.token === token);
    if (!user) return json({ active: false, error: "找不到授權使用者。" }, 404);
    return json({
      active: isUserActive(user),
      user: { id: user.id, name: user.name, enabled: user.enabled, expiresAt: user.expiresAt },
    });
  }

  if (request.method === "GET" && pathname === "/supported-sites") {
    return json({ sites: supportedSites });
  }

  if (request.method === "POST" && pathname === "/sessions") {
    const body = await readJson(request);
    const lineUserId = body.lineUserId || "demo-line-user";
    const store = await readSessionStore(env);
    const existing = store.sessions[lineUserId];
    const session = existing || { id: `session-${Date.now()}`, lineUserId, rounds: [], createdAt: todayIso() };
    session.updatedAt = todayIso();
    store.sessions[lineUserId] = session;
    await writeSessionStore(env, store);
    return json({ session, recommendation: buildRecommendation(session.rounds) });
  }

  if (request.method === "POST" && pathname === "/rounds") {
    const body = await readJson(request);
    const lineUserId = body.lineUserId || "demo-line-user";
    const store = await readSessionStore(env);
    const session = store.sessions[lineUserId] || { id: `session-${Date.now()}`, lineUserId, rounds: [], createdAt: todayIso() };
    if (Array.isArray(body.rounds)) session.rounds = cleanRounds(body.rounds);
    else if (body.result) session.rounds.push(...cleanRounds([{ result: body.result, source: body.source || "manual" }]));
    session.updatedAt = todayIso();
    store.sessions[lineUserId] = session;
    await writeSessionStore(env, store);
    return json({ session, recommendation: buildRecommendation(session.rounds) });
  }

  if (request.method === "POST" && pathname === "/recommendations") {
    const body = await readJson(request);
    return json({ recommendation: buildRecommendation(body.rounds || []) });
  }

  if (request.method === "POST" && pathname === "/screenshots/analyze") {
    const body = await readJson(request);
    const detectedRounds = cleanRounds(body.detectedRounds || []);
    return json({
      rounds: detectedRounds,
      confidence: detectedRounds.length ? Math.min(92, Math.round(body.confidence || 64)) : 0,
      needsReview: true,
      message: detectedRounds.length ? "已完成基礎色點辨識，請先修正再套用。" : "尚未偵測到清楚路單，請手動點選修正。",
    });
  }

  return json({ error: "API route not found." }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname.slice(4));
    }

    return env.ASSETS.fetch(request);
  },
};
