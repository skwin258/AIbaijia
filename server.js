import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const dataDir = process.env.DATA_DIR || join(rootDir, "work", "data");
const sessionsFile = join(dataDir, "sessions.json");
const adminStoreFile = join(dataDir, "admin-store.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const superAdminSeed = {
  username: process.env.SUPERADMIN_USERNAME || "koko85830",
  password: process.env.SUPERADMIN_PASSWORD || "change-this-password",
};

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

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(sessionsFile)) {
    await writeFile(sessionsFile, JSON.stringify({ sessions: {} }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  return JSON.parse(await readFile(sessionsFile, "utf8"));
}

async function writeStore(store) {
  await ensureStore();
  await writeFile(sessionsFile, JSON.stringify(store, null, 2));
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120_000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(":")[1];
  const left = Buffer.from(candidate, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function createId(prefix) {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function createToken() {
  return randomBytes(24).toString("base64url");
}

function normalizeAdminStore(store = {}) {
  const now = new Date().toISOString();
  const admins = Array.isArray(store.admins) ? store.admins : [];
  const hasSuperAdmin = admins.some((admin) => admin.username === superAdminSeed.username);
  if (!hasSuperAdmin) {
    admins.unshift({
      id: "superadmin",
      username: superAdminSeed.username,
      passwordHash: hashPassword(superAdminSeed.password),
      role: "superadmin",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return {
    admins,
    users: Array.isArray(store.users) ? store.users : [],
    adminSessions: store.adminSessions && typeof store.adminSessions === "object" ? store.adminSessions : {},
  };
}

async function ensureAdminStore() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(adminStoreFile)) {
    const store = normalizeAdminStore({});
    await writeFile(adminStoreFile, JSON.stringify(store, null, 2));
  }
}

async function readAdminStore() {
  await ensureAdminStore();
  const store = normalizeAdminStore(JSON.parse(await readFile(adminStoreFile, "utf8")));
  return store;
}

async function writeAdminStore(store) {
  await ensureAdminStore();
  await writeFile(adminStoreFile, JSON.stringify(normalizeAdminStore(store), null, 2));
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

async function getCurrentAdmin(req) {
  const token = parseCookies(req).sk_admin_session;
  if (!token) return null;
  const store = await readAdminStore();
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

function publicUser(user, req) {
  return {
    ...user,
    shortcutUrl: `${getOrigin(req)}/shortcut.html?token=${encodeURIComponent(user.token)}`,
  };
}

function getOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = String(req.headers.host || "");
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    const localUrl = getLocalUrls(Number(process.env.PORT || 3000))
      .find((url) => !url.includes("10.14.0.2"));
    if (localUrl) return localUrl;
  }
  return `${protocol}://${host}`;
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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body) return {};
  return JSON.parse(body);
}

function cleanRounds(rounds = []) {
  return rounds
    .map((round) => ({
      result: String(round.result || "").toLowerCase(),
      source: round.source || "manual",
      confidence: Number.isFinite(round.confidence) ? round.confidence : 100,
      createdAt: round.createdAt || new Date().toISOString(),
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

export function buildRecommendation(rounds = []) {
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
    stats: {
      totalRounds: validRounds.length,
      recentWindow: recent.length,
      bankerCount,
      playerCount,
      tieCount,
      streak,
    },
    disclaimer: "僅供娛樂與統計參考，不保證獲利。",
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/admin/login") {
    const body = await readJsonBody(req);
    const store = await readAdminStore();
    const admin = store.admins.find((item) => item.username === body.username && item.enabled);
    if (!admin || !verifyPassword(body.password, admin.passwordHash)) {
      return sendJson(res, 401, { error: "帳號或密碼錯誤。" });
    }
    const token = createToken();
    store.adminSessions[token] = {
      adminId: admin.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
    await writeAdminStore(store);
    res.setHeader("set-cookie", `sk_admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
    return sendJson(res, 200, { admin: publicAdmin(admin) });
  }

  if (req.method === "POST" && pathname === "/admin/logout") {
    const current = await getCurrentAdmin(req);
    if (current) {
      delete current.store.adminSessions[current.token];
      await writeAdminStore(current.store);
    }
    res.setHeader("set-cookie", "sk_admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith("/admin/")) {
    const current = await getCurrentAdmin(req);
    if (!current) return sendJson(res, 401, { error: "請先登入。" });
    const { admin, store } = current;

    if (req.method === "GET" && pathname === "/admin/me") {
      return sendJson(res, 200, { admin: publicAdmin(admin) });
    }

    if (req.method === "GET" && pathname === "/admin/admins") {
      if (admin.role !== "superadmin") return sendJson(res, 403, { error: "只有 SUPERADMIN 可以管理管理員。" });
      return sendJson(res, 200, { admins: store.admins.map(publicAdmin) });
    }

    if (req.method === "POST" && pathname === "/admin/admins") {
      if (admin.role !== "superadmin") return sendJson(res, 403, { error: "只有 SUPERADMIN 可以新增管理員。" });
      const body = await readJsonBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      if (!username || !password) return sendJson(res, 400, { error: "請輸入管理員帳號與密碼。" });
      if (store.admins.some((item) => item.username === username)) return sendJson(res, 409, { error: "管理員帳號已存在。" });
      const newAdmin = {
        id: createId("admin"),
        username,
        passwordHash: hashPassword(password),
        role: "admin",
        enabled: true,
        createdBy: admin.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.admins.push(newAdmin);
      await writeAdminStore(store);
      return sendJson(res, 201, { admin: publicAdmin(newAdmin) });
    }

    if (req.method === "GET" && pathname === "/admin/users") {
      return sendJson(res, 200, { users: store.users.map((user) => publicUser(user, req)) });
    }

    if (req.method === "POST" && pathname === "/admin/users") {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const days = Math.max(1, Number(body.days) || 1);
      if (!name) return sendJson(res, 400, { error: "請輸入使用者名稱。" });
      const user = {
        id: createId("user"),
        name,
        token: createToken(),
        enabled: true,
        days,
        startsAt: new Date().toISOString(),
        expiresAt: expiresFromDays(days),
        createdBy: admin.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.users.push(user);
      await writeAdminStore(store);
      return sendJson(res, 201, { user: publicUser(user, req) });
    }

    const userMatch = pathname.match(/^\/admin\/users\/([^/]+)$/);
    if (userMatch && req.method === "PATCH") {
      const body = await readJsonBody(req);
      const user = store.users.find((item) => item.id === userMatch[1]);
      if (!user) return sendJson(res, 404, { error: "找不到使用者。" });
      if (typeof body.name === "string") user.name = body.name.trim() || user.name;
      if (typeof body.enabled === "boolean") user.enabled = body.enabled;
      if (body.days != null) {
        user.days = Math.max(1, Number(body.days) || 1);
        user.expiresAt = expiresFromDays(user.days);
      }
      if (body.resetToken) user.token = createToken();
      user.updatedAt = new Date().toISOString();
      await writeAdminStore(store);
      return sendJson(res, 200, { user: publicUser(user, req) });
    }

    return sendJson(res, 404, { error: "Admin route not found." });
  }

  if (req.method === "GET" && pathname === "/access/validate") {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    const store = await readAdminStore();
    const user = store.users.find((item) => item.token === token);
    if (!user) return sendJson(res, 404, { active: false, error: "找不到授權使用者。" });
    return sendJson(res, 200, {
      active: isUserActive(user),
      user: {
        id: user.id,
        name: user.name,
        enabled: user.enabled,
        expiresAt: user.expiresAt,
      },
    });
  }

  if (req.method === "GET" && pathname === "/supported-sites") {
    return sendJson(res, 200, { sites: supportedSites });
  }

  if (req.method === "POST" && pathname === "/sessions") {
    const body = await readJsonBody(req);
    const lineUserId = body.lineUserId || "demo-line-user";
    const store = await readStore();
    const existing = store.sessions[lineUserId];
    const session = existing || {
      id: `session-${Date.now()}`,
      lineUserId,
      rounds: [],
      createdAt: new Date().toISOString(),
    };
    session.updatedAt = new Date().toISOString();
    store.sessions[lineUserId] = session;
    await writeStore(store);
    return sendJson(res, 200, { session, recommendation: buildRecommendation(session.rounds) });
  }

  if (req.method === "POST" && pathname === "/rounds") {
    const body = await readJsonBody(req);
    const lineUserId = body.lineUserId || "demo-line-user";
    const store = await readStore();
    const session = store.sessions[lineUserId] || {
      id: `session-${Date.now()}`,
      lineUserId,
      rounds: [],
      createdAt: new Date().toISOString(),
    };

    if (Array.isArray(body.rounds)) {
      session.rounds = cleanRounds(body.rounds);
    } else if (body.result) {
      session.rounds.push(...cleanRounds([{ result: body.result, source: body.source || "manual" }]));
    }

    session.updatedAt = new Date().toISOString();
    store.sessions[lineUserId] = session;
    await writeStore(store);
    return sendJson(res, 200, { session, recommendation: buildRecommendation(session.rounds) });
  }

  if (req.method === "POST" && pathname === "/recommendations") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, { recommendation: buildRecommendation(body.rounds || []) });
  }

  if (req.method === "POST" && pathname === "/screenshots/analyze") {
    const body = await readJsonBody(req);
    const detectedRounds = cleanRounds(body.detectedRounds || []);
    return sendJson(res, 200, {
      rounds: detectedRounds,
      confidence: detectedRounds.length ? Math.min(92, Math.round(body.confidence || 64)) : 0,
      needsReview: true,
      message: detectedRounds.length
        ? "已完成基礎色點辨識，請先修正再套用。"
        : "尚未偵測到清楚路單，請手動點選修正。",
    });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "pragma": "no-cache",
      "expires": "0",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

export const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname.slice(4));
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    const localUrls = getLocalUrls(port);
    console.log(`Baccarat assistant running at http://localhost:${port}`);
    if (localUrls.length) {
      console.log("");
      console.log("Open one of these URLs on your phone while it is on the same Wi-Fi:");
      localUrls.forEach((url) => console.log(`  ${url}`));
    }
  });
}

function getLocalUrls(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => `http://${network.address}:${port}`);
}
