const crypto = require("crypto");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const clientCache = globalThis.__crmMongoClient || { client: null, promise: null };
globalThis.__crmMongoClient = clientCache;

const COOKIE_NAME = "leadit_session";
const SESSION_HOURS = 8;
const DB_NAME = process.env.MONGODB_DB || "leadit_crm";

app.use(express.json({ limit: "1mb" }));

async function getDb() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!clientCache.promise) {
    clientCache.client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    clientCache.promise = clientCache.client.connect();
  }

  const client = await clientCache.promise;
  return client.db(DB_NAME);
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index === -1) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function setSessionCookie(res, sessionId) {
  const maxAge = SESSION_HOURS * 60 * 60;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function normalizeUsername(username = "") {
  return String(username).trim().toLowerCase();
}

function publicUser(user) {
  return { id: user._id.toString(), username: user.username };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored = "") {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function serializeLead(lead) {
  return {
    id: lead._id.toString(),
    name: lead.name,
    email: lead.email,
    phone: lead.phone || "",
    company: lead.company || "",
    source: lead.source,
    priority: lead.priority,
    status: lead.status,
    nextFollowUp: lead.nextFollowUp || "",
    message: lead.message,
    notes: lead.notes || [],
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

function validateLead(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const message = String(payload.message || "").trim();

  if (!name || !email || !message) {
    return { error: "Name, email, and message are required." };
  }

  return {
    lead: {
      name,
      email,
      phone: String(payload.phone || "").trim(),
      company: String(payload.company || "").trim(),
      source: String(payload.source || "Website Contact Form").trim(),
      priority: ["high", "medium", "low"].includes(payload.priority) ? payload.priority : "medium",
      status: ["new", "contacted", "converted"].includes(payload.status) ? payload.status : "new",
      nextFollowUp: String(payload.nextFollowUp || "").trim(),
      message
    }
  };
}

async function createActivity(db, label, userId = null) {
  await db.collection("activity").insertOne({
    label,
    userId,
    createdAt: new Date().toISOString()
  });
}

async function requireAuth(req, res, next) {
  try {
    const db = await getDb();
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (!sessionId) return res.status(401).json({ error: "Please sign in first." });

    const session = await db.collection("sessions").findOne({
      _id: sessionId,
      expiresAt: { $gt: new Date() }
    });

    if (!session) return res.status(401).json({ error: "Session expired. Please sign in again." });

    const user = await db.collection("users").findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ error: "User not found." });

    req.db = db;
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ ok: true, database: "mongodb" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const db = await getDb();
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: "Use a username of 3+ characters and password of 6+ characters." });
    }

    const existing = await db.collection("users").findOne({ username });
    if (existing) return res.status(409).json({ error: "Username already exists." });

    const userResult = await db.collection("users").insertOne({
      username,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    });

    const sessionId = crypto.randomUUID();
    await db.collection("sessions").insertOne({
      _id: sessionId,
      userId: userResult.insertedId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
    });

    setSessionCookie(res, sessionId);
    res.status(201).json({ user: { id: userResult.insertedId.toString(), username } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const db = await getDb();
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const user = await db.collection("users").findOne({ username });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const sessionId = crypto.randomUUID();
    await db.collection("sessions").insertOne({
      _id: sessionId,
      userId: user._id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
    });

    setSessionCookie(res, sessionId);
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/logout", requireAuth, async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  await req.db.collection("sessions").deleteOne({ _id: cookies[COOKIE_NAME] });
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/leads", requireAuth, async (req, res) => {
  const filter = {};
  if (["new", "contacted", "converted"].includes(req.query.status)) filter.status = req.query.status;
  if (["high", "medium", "low"].includes(req.query.priority)) filter.priority = req.query.priority;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.search) {
    const regex = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }, { source: regex }, { message: regex }];
  }

  const leads = await req.db.collection("leads").find(filter).sort({ updatedAt: -1 }).toArray();
  const sources = await req.db.collection("leads").distinct("source");
  res.json({ leads: leads.map(serializeLead), sources: sources.sort() });
});

app.post("/api/public/leads", async (req, res) => {
  try {
    const db = await getDb();
    const validated = validateLead(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const now = new Date().toISOString();
    const lead = { ...validated.lead, notes: [], createdAt: now, updatedAt: now };
    const result = await db.collection("leads").insertOne(lead);
    const created = { ...lead, _id: result.insertedId };
    await createActivity(db, `New lead captured: ${lead.name}`);
    res.status(201).json({ lead: serializeLead(created) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/leads/:id", requireAuth, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: "Invalid lead id." });

  const allowed = {};
  ["name", "email", "phone", "company", "source", "message", "nextFollowUp"].forEach((field) => {
    if (req.body[field] !== undefined) allowed[field] = String(req.body[field]).trim();
  });
  if (["new", "contacted", "converted"].includes(req.body.status)) allowed.status = req.body.status;
  if (["high", "medium", "low"].includes(req.body.priority)) allowed.priority = req.body.priority;
  if (allowed.email) allowed.email = allowed.email.toLowerCase();
  allowed.updatedAt = new Date().toISOString();

  const result = await req.db.collection("leads").findOneAndUpdate({ _id }, { $set: allowed }, { returnDocument: "after" });
  if (!result) return res.status(404).json({ error: "Lead not found." });
  await createActivity(req.db, `Lead updated: ${result.name}`, req.user._id);
  res.json({ lead: serializeLead(result) });
});

app.post("/api/leads/:id/notes", requireAuth, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const text = String(req.body.text || "").trim();
  if (!_id) return res.status(400).json({ error: "Invalid lead id." });
  if (!text) return res.status(400).json({ error: "Note text is required." });

  const note = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
  const result = await req.db.collection("leads").findOneAndUpdate(
    { _id },
    { $push: { notes: note }, $set: { updatedAt: note.createdAt } },
    { returnDocument: "after" }
  );
  if (!result) return res.status(404).json({ error: "Lead not found." });
  await createActivity(req.db, `Note added for ${result.name}`, req.user._id);
  res.status(201).json({ lead: serializeLead(result) });
});

app.delete("/api/leads/:id", requireAuth, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: "Invalid lead id." });
  const lead = await req.db.collection("leads").findOne({ _id });
  const result = await req.db.collection("leads").deleteOne({ _id });
  if (!result.deletedCount) return res.status(404).json({ error: "Lead not found." });
  await createActivity(req.db, `Lead deleted: ${lead?.name || "Unknown lead"}`, req.user._id);
  res.json({ ok: true });
});

app.get("/api/analytics", requireAuth, async (req, res) => {
  const leads = await req.db.collection("leads").find({}).toArray();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const stats = {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    contacted: leads.filter((lead) => lead.status === "contacted").length,
    converted: leads.filter((lead) => lead.status === "converted").length,
    followUpsDue: leads.filter((lead) => lead.nextFollowUp && lead.status !== "converted" && new Date(lead.nextFollowUp) <= today).length,
    highPriority: leads.filter((lead) => lead.priority === "high").length
  };
  const recentActivity = await req.db.collection("activity").find({}).sort({ createdAt: -1 }).limit(6).toArray();
  res.json({ stats, recentActivity });
});

module.exports = app;
