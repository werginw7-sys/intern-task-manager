const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;
const STAGES = new Set(["Todo", "In Progress", "Done"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ users: [], tasks: [] }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function parseBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempted = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), attempted);
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getAuthToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function serializeUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function getCurrentUser(req, store) {
  const token = getAuthToken(req);
  if (!token) return null;
  const now = Date.now();
  for (const user of store.users) {
    const session = (user.sessions || []).find((item) => item.token === token && item.expiresAt > now);
    if (session) return user;
  }
  return null;
}

function cleanUserSessions(user) {
  const now = Date.now();
  user.sessions = (user.sessions || []).filter((session) => session.expiresAt > now);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function validateTaskInput(input, partial = false) {
  const next = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, "title")) {
    const title = normalizeText(input.title);
    if (title.length < 2) throw new Error("Task title must be at least 2 characters.");
    next.title = title;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "description")) {
    next.description = normalizeText(input.description);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "stage")) {
    const stage = normalizeText(input.stage);
    if (!STAGES.has(stage)) throw new Error("Task stage must be Todo, In Progress, or Done.");
    next.stage = stage;
  }
  return next;
}

async function handleApi(req, res, pathname) {
  try {
    const store = await readStore();

    if (req.method === "POST" && pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const password = String(body.password || "");

      if (name.length < 2) return sendError(res, 400, "Name must be at least 2 characters.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, "Enter a valid email address.");
      if (password.length < 6) return sendError(res, 400, "Password must be at least 6 characters.");
      if (store.users.some((user) => user.email === email)) return sendError(res, 409, "An account with this email already exists.");

      const token = createToken();
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: hashPassword(password),
        sessions: [{ token, expiresAt: Date.now() + SESSION_TTL_MS }],
        createdAt: new Date().toISOString()
      };
      store.users.push(user);
      await writeStore(store);
      return sendJson(res, 201, { token, user: serializeUser(user) });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = normalizeText(body.email).toLowerCase();
      const password = String(body.password || "");
      const user = store.users.find((item) => item.email === email);

      if (!user || !verifyPassword(password, user.passwordHash)) return sendError(res, 401, "Invalid email or password.");
      cleanUserSessions(user);
      const token = createToken();
      user.sessions.push({ token, expiresAt: Date.now() + SESSION_TTL_MS });
      await writeStore(store);
      return sendJson(res, 200, { token, user: serializeUser(user) });
    }

    const currentUser = await getCurrentUser(req, store);
    if (!currentUser) return sendError(res, 401, "Please log in to continue.");

    if (req.method === "GET" && pathname === "/api/me") {
      return sendJson(res, 200, { user: serializeUser(currentUser) });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const token = getAuthToken(req);
      currentUser.sessions = (currentUser.sessions || []).filter((session) => session.token !== token);
      await writeStore(store);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/tasks") {
      const tasks = store.tasks
        .filter((task) => task.userId === currentUser.id)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return sendJson(res, 200, { tasks });
    }

    if (req.method === "POST" && pathname === "/api/tasks") {
      const body = await parseBody(req);
      const input = validateTaskInput(body);
      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        title: input.title,
        description: input.description,
        stage: input.stage,
        createdAt: now,
        updatedAt: now
      };
      store.tasks.push(task);
      await writeStore(store);
      return sendJson(res, 201, { task });
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const task = store.tasks.find((item) => item.id === taskMatch[1] && item.userId === currentUser.id);
      if (!task) return sendError(res, 404, "Task not found.");

      if (req.method === "PATCH") {
        const body = await parseBody(req);
        const input = validateTaskInput(body, true);
        Object.assign(task, input, { updatedAt: new Date().toISOString() });
        await writeStore(store);
        return sendJson(res, 200, { task });
      }

      if (req.method === "DELETE") {
        store.tasks = store.tasks.filter((item) => item.id !== task.id);
        await writeStore(store);
        return sendJson(res, 200, { ok: true });
      }
    }

    return sendError(res, 404, "Route not found.");
  } catch (error) {
    const message = error instanceof SyntaxError ? "Invalid JSON request." : error.message;
    return sendError(res, 400, message || "Something went wrong.");
  }
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const contentType = mimeTypes[path.extname(resolvedPath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }
  await serveStatic(req, res, url.pathname);
});

async function start(port = PORT) {
  await ensureStore();
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Task Manager running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = { server, start };
