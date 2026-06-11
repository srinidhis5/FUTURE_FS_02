const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const INITIAL_USER = process.env.INITIAL_USER || "";
const INITIAL_PASSWORD = process.env.INITIAL_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ROOT_DIR = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT_DIR, "data", "crm.json");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const seedLeads = [
  {
    id: crypto.randomUUID(),
    name: "Aarav Mehta",
    email: "aarav@mehtastudio.in",
    phone: "+91 98765 43210",
    company: "Mehta Design Studio",
    source: "Website Contact Form",
    status: "new",
    message: "Needs a website refresh and monthly maintenance plan.",
    notes: [
      {
        id: crypto.randomUUID(),
        text: "Lead came from the pricing page.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString()
      }
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Nidhi Sharma",
    email: "nidhi@urbanbakes.com",
    phone: "+91 91234 56789",
    company: "Urban Bakes",
    source: "Instagram Campaign",
    status: "contacted",
    message: "Asked for ecommerce setup and lead capture forms.",
    notes: [
      {
        id: crypto.randomUUID(),
        text: "Called once. Wants proposal by Friday.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString()
      }
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Rohan Iyer",
    email: "rohan@iyerconsulting.com",
    phone: "+91 99887 77665",
    company: "Iyer Consulting",
    source: "Referral",
    status: "converted",
    message: "Booked CRM setup for his consulting team.",
    notes: [
      {
        id: crypto.randomUUID(),
        text: "Converted after demo call. Send onboarding checklist.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
      }
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
  }
];

function ensureDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    writeDatabase({ leads: seedLeads, users: initialUsers() });
    return;
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  let changed = false;
  if (!Array.isArray(db.leads)) {
    db.leads = seedLeads;
    changed = true;
  }
  if (!Array.isArray(db.users)) {
    db.users = initialUsers();
    changed = true;
  } else if (db.users.length === 0 && initialUsers().length > 0) {
    db.users = initialUsers();
    changed = true;
  }
  if (changed) {
    writeDatabase(db);
  }
}

function initialUsers() {
  return INITIAL_USER && INITIAL_PASSWORD ? [createUser(INITIAL_USER, INITIAL_PASSWORD)] : [];
}

function readDatabase() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDatabase(data) {
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, DB_PATH);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function createUser(username, password) {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);
  return {
    id: crypto.randomUUID(),
    username: String(username || "").trim().toLowerCase(),
    passwordHash,
    createdAt: now,
    updatedAt: now
  };
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.salt || !passwordHash.hash) return false;
  const attempted = hashPassword(password, passwordHash.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(attempted, "hex"), Buffer.from(passwordHash.hash, "hex"));
}

function sanitizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function validateUserCredentials(username, password) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return "Username must be 3-32 characters and use letters, numbers, dots, dashes, or underscores.";
  }
  if (String(password || "").length < 6) {
    return "Password must be at least 6 characters.";
  }
  return "";
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSessionCookie(user) {
  const payload = JSON.stringify({
    userId: user.id,
    username: user.username,
    exp: Date.now() + 1000 * 60 * 60 * 8
  });
  const token = Buffer.from(payload).toString("base64url");
  return `${token}.${sign(token)}`;
}

function getSession(req) {
  const { crm_session: session } = parseCookies(req.headers.cookie);
  if (!session) return null;

  const [token, signature] = session.split(".");
  if (!token || !signature || sign(token) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return payload.userId && payload.username && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function sanitizeLead(input) {
  const text = (value) => String(value || "").trim();
  const priority = ["low", "medium", "high"].includes(text(input.priority).toLowerCase())
    ? text(input.priority).toLowerCase()
    : "medium";
  return {
    name: text(input.name),
    email: text(input.email).toLowerCase(),
    phone: text(input.phone),
    company: text(input.company),
    source: text(input.source) || "Website Contact Form",
    message: text(input.message),
    priority,
    nextFollowUp: text(input.nextFollowUp)
  };
}

function validateLead(lead) {
  if (!lead.name) return "Name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return "A valid email is required.";
  if (!lead.message) return "Message is required.";
  return "";
}

function leadStats(leads) {
  const total = leads.length;
  const converted = leads.filter((lead) => lead.status === "converted").length;
  const contacted = leads.filter((lead) => lead.status === "contacted").length;
  const fresh = leads.filter((lead) => lead.status === "new").length;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const followUpsDue = leads.filter((lead) => {
    if (!lead.nextFollowUp || lead.status === "converted") return false;
    return new Date(lead.nextFollowUp) <= today;
  }).length;
  const highPriority = leads.filter((lead) => lead.priority === "high").length;
  return {
    total,
    new: fresh,
    contacted,
    converted,
    followUpsDue,
    highPriority,
    conversionRate: total ? Math.round((converted / total) * 100) : 0
  };
}

function normalizeLead(lead) {
  return {
    priority: "medium",
    nextFollowUp: "",
    ...lead,
    notes: Array.isArray(lead.notes) ? lead.notes : []
  };
}

function filterLeads(leads, url) {
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const status = url.searchParams.get("status") || "all";
  const source = (url.searchParams.get("source") || "").toLowerCase();
  const priority = (url.searchParams.get("priority") || "all").toLowerCase();

  return leads
    .map(normalizeLead)
    .filter((lead) => status === "all" || lead.status === status)
    .filter((lead) => !source || lead.source.toLowerCase() === source)
    .filter((lead) => priority === "all" || lead.priority === priority)
    .filter((lead) => {
      if (!search) return true;
      return [lead.name, lead.email, lead.company, lead.source, lead.message, lead.phone]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404);
          return res.end("Not found");
        }

        res.writeHead(200, {
          "Content-Type": mimeTypes[".html"]
        });
        return res.end(fallbackContent);
      });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const username = sanitizeUsername(body.username);
    const password = String(body.password || "");
    const validationError = validateUserCredentials(username, password);
    if (validationError) return sendJson(res, 400, { error: validationError });

    const db = readDatabase();
    if (db.users.some((user) => user.username === username)) {
      return sendJson(res, 409, { error: "That username is already taken." });
    }

    const user = createUser(username, password);
    db.users.push(user);
    writeDatabase(db);
    res.writeHead(201, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `crm_session=${createSessionCookie(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    });
    return res.end(JSON.stringify({ ok: true, user: { id: user.id, username: user.username } }));
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const username = sanitizeUsername(body.username);
    const password = String(body.password || "");
    const db = readDatabase();
    const user = db.users.find((item) => item.username === username);

    if (user && verifyPassword(password, user.passwordHash)) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `crm_session=${createSessionCookie(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
      });
      return res.end(JSON.stringify({ ok: true, user: { id: user.id, username: user.username } }));
    }
    return sendJson(res, 401, { error: "Invalid username or password." });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "crm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === "POST" && url.pathname === "/api/public/leads") {
    const payload = sanitizeLead(await readBody(req));
    const validationError = validateLead(payload);
    if (validationError) return sendJson(res, 400, { error: validationError });

    const db = readDatabase();
    const now = new Date().toISOString();
    const lead = {
      id: crypto.randomUUID(),
      ...payload,
      status: "new",
      notes: [],
      createdAt: now,
      updatedAt: now
    };
    db.leads.push(lead);
    writeDatabase(db);
    return sendJson(res, 201, { ok: true, lead });
  }

  if (url.pathname === "/api/me") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { authenticated: false });

    const db = readDatabase();
    const user = db.users.find((item) => item.id === session.userId);
    if (!user) return sendJson(res, 401, { authenticated: false });

    return sendJson(res, 200, { authenticated: true, user: { id: user.id, username: user.username } });
  }

  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Login required." });

  if (req.method === "GET" && url.pathname === "/api/leads") {
    const db = readDatabase();
    const allLeads = db.leads.map(normalizeLead);
    const leads = filterLeads(allLeads, url);
    return sendJson(res, 200, {
      leads,
      stats: leadStats(allLeads),
      sources: [...new Set(allLeads.map((lead) => lead.source))].sort()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/analytics") {
    const db = readDatabase();
    const leads = db.leads.map(normalizeLead);
    const sourceBreakdown = [...new Set(leads.map((lead) => lead.source))]
      .sort()
      .map((source) => ({
        source,
        count: leads.filter((lead) => lead.source === source).length
      }));

    return sendJson(res, 200, {
      stats: leadStats(leads),
      sourceBreakdown,
      recentActivity: leads
        .flatMap((lead) => [
          {
            type: "lead",
            label: `${lead.name} entered through ${lead.source}`,
            createdAt: lead.createdAt
          },
          ...lead.notes.map((note) => ({
            type: "note",
            label: `${lead.name}: ${note.text}`,
            createdAt: note.createdAt
          }))
        ])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6)
    });
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (req.method === "PATCH" && leadMatch) {
    const db = readDatabase();
    const lead = db.leads.find((item) => item.id === leadMatch[1]);
    if (!lead) return sendJson(res, 404, { error: "Lead not found." });

    const body = await readBody(req);
    if (body.status && !["new", "contacted", "converted"].includes(body.status)) {
      return sendJson(res, 400, { error: "Status must be new, contacted, or converted." });
    }

    const updates = sanitizeLead({ ...lead, ...body });
    const validationError = validateLead(updates);
    if (validationError) return sendJson(res, 400, { error: validationError });

    lead.name = updates.name || lead.name;
    lead.email = updates.email || lead.email;
    lead.phone = updates.phone;
    lead.company = updates.company;
    lead.source = updates.source || lead.source;
    lead.message = updates.message || lead.message;
    lead.priority = updates.priority;
    lead.nextFollowUp = updates.nextFollowUp;
    lead.status = body.status || lead.status;
    lead.updatedAt = new Date().toISOString();
    writeDatabase(db);
    return sendJson(res, 200, { lead: normalizeLead(lead) });
  }

  if (req.method === "DELETE" && leadMatch) {
    const db = readDatabase();
    const leadIndex = db.leads.findIndex((item) => item.id === leadMatch[1]);
    if (leadIndex === -1) return sendJson(res, 404, { error: "Lead not found." });

    const [deleted] = db.leads.splice(leadIndex, 1);
    writeDatabase(db);
    return sendJson(res, 200, { ok: true, deleted: normalizeLead(deleted) });
  }

  const notesMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (req.method === "POST" && notesMatch) {
    const db = readDatabase();
    const lead = db.leads.find((item) => item.id === notesMatch[1]);
    if (!lead) return sendJson(res, 404, { error: "Lead not found." });

    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "Note text is required." });

    lead.notes.unshift({
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString()
    });
    lead.updatedAt = new Date().toISOString();
    writeDatabase(db);
    return sendJson(res, 201, { lead: normalizeLead(lead) });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error." });
  }
});

ensureDatabase();
server.listen(PORT, () => {
  console.log(`Mini CRM running at http://localhost:${PORT}`);
  console.log("Users are loaded from data/crm.json");
});
