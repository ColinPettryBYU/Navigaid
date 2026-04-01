import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pool from "./db.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = [
  "You are NavigAid, a professional government benefits guidance assistant. You help users discover, understand, and apply for government aid programs they may qualify for.",
  "",
  "BEHAVIOR RULES:",
  "- Reference the user's profile fields by name when making recommendations (e.g., 'Based on your household size of 3…').",
  "- Never invent eligibility criteria. Only reference programs from the AVAILABLE PROGRAMS list provided in context.",
  "- Recommend 1–2 programs at a time with clear rationale tied to the user's profile.",
  "- If the user's profile is missing critical eligibility fields, ask about the most important missing field before making recommendations.",
  "- When discussing a specific application the user has started, walk them through one step at a time and reference required documents.",
  "",
  "FORMATTING RULES:",
  "- Use markdown: **bold** for program names and key terms, bullet lists for steps, numbered lists for processes.",
  "- Keep paragraphs short (2–3 sentences max).",
  "- Always end eligibility guidance with: 'Please confirm details on the official program website.'",
  "",
  "RECOMMENDATION FORMAT:",
  "When recommending programs, use ONE marker per program, each on its own line. NEVER combine multiple programs into one marker.",
  "**[RECOMMEND: Program Name]**",
  "Then explain why the user may qualify in 1–2 sentences. Use the exact program name from the catalog.",
  "CORRECT: two programs → two separate markers, each on their own line.",
  "WRONG: **[RECOMMEND: LIHEAP / Weatherization]** — never use slashes or combine names.",
  "",
  "PROFILE QUESTION FORMAT:",
  "When you need to ask about a missing profile field, include this marker on its own line:",
  "**[ASK: field_name]**",
  "Valid field_name values: employment_status, housing_status, disability_status, veteran_status, household_size, income",
  "Then ask the question naturally in a follow-up sentence.",
  "",
  "ONBOARDING:",
  "- If the conversation just started and the user's profile has missing fields, acknowledge what you know, then ask about the most important missing field.",
  "- If the profile is fairly complete, summarize the top 1–2 programs they likely qualify for.",
  "- For guest users with no profile, help them explore programs generally and suggest creating an account for personalized recommendations.",
  "",
  "IMPORTANT: You are not a lawyer or financial advisor. This is general guidance only.",
].join("\n");

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: SYSTEM_PROMPT,
});

app.use(cors());
app.use(express.json());

const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = "sha512";
const PASSWORD_ITERATIONS = 120000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash ?? "").split(":");

  if (!String(storedHash ?? "").includes(":")) {
    return password === String(storedHash ?? "");
  }

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function parseApplicationSteps(text) {
  const s = String(text ?? "").trim();
  if (!s) {
    return [];
  }
  const chunks = s
    .split(/\s*(?=\d+\.\s)/)
    .map((p) => p.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return [s];
  }
  return chunks;
}

function normalizeStepsCompleted(raw, stepCount) {
  const n = Math.max(Number(stepCount) || 0, 1);
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw.map((v) => Boolean(v));
  }
  if (arr.length < n) {
    arr = [...arr, ...Array(n - arr.length).fill(false)];
  } else if (arr.length > n) {
    arr = arr.slice(0, n);
  }
  return arr;
}

function effectiveStepsFromDbStepsText(applicationStepsRaw) {
  const steps = parseApplicationSteps(applicationStepsRaw);
  if (steps.length > 0) {
    return steps;
  }
  return ["Follow the official application process."];
}

function mapUserApplicationRow(r) {
  const steps = effectiveStepsFromDbStepsText(r.applicationStepsRaw);
  const stepsCompleted = normalizeStepsCompleted(r.stepsCompletedRaw, steps.length);
  return {
    userApplicationId: r.userApplicationId,
    status: r.status,
    dateStarted: r.dateStarted,
    lastUpdated: r.lastUpdated,
    applicationId: r.applicationId,
    applicationName: r.applicationName,
    category: r.category,
    description: r.description,
    qualificationSummary: r.qualificationSummary,
    officialUrl: r.officialUrl,
    steps,
    stepsCompleted,
  };
}

const PROFILE_FIELD_CONFIG = {
  employment_status: {
    label: "Employment Status",
    type: "select",
    options: ["Employed full-time", "Part-time", "Self-employed", "Unemployed", "Student", "Retired", "Unable to work"],
  },
  housing_status: {
    label: "Housing Status",
    type: "select",
    options: ["Homeowner", "Renter", "Homeless / Unhoused", "Temporary shelter", "Living with family or friends"],
  },
  disability_status: {
    label: "Disability Status",
    type: "select",
    options: ["No disability reported", "Physical disability", "Mental health disability", "Multiple disabilities"],
  },
  veteran_status: {
    label: "Veteran Status",
    type: "select",
    options: ["Not a veteran", "Active duty", "Veteran", "Disabled veteran"],
  },
  household_size: { label: "Household Size", type: "number", options: [] },
  income: { label: "Annual Income", type: "number", options: [] },
};

async function buildUserContext(userId) {
  const profileResult = await pool.query(
    `SELECT first_name, last_name, email, phone, date_of_birth, city, state, zip_code,
            household_size, income, employment_status, housing_status,
            disability_status, veteran_status
     FROM users WHERE user_id = $1`,
    [userId]
  );
  if (profileResult.rowCount === 0) return null;
  const p = profileResult.rows[0];

  const missingFields = [];
  if (!p.household_size) missingFields.push("household_size");
  if (p.income == null) missingFields.push("income");
  if (!p.employment_status) missingFields.push("employment_status");
  if (!p.housing_status) missingFields.push("housing_status");
  if (!p.disability_status) missingFields.push("disability_status");
  if (!p.veteran_status) missingFields.push("veteran_status");

  const userAppsResult = await pool.query(
    `SELECT ua.status, ua.steps_completed,
            a.application_name, a.application_steps
     FROM user_applications ua
     JOIN applications a ON a.application_id = ua.application_id
     WHERE ua.user_id = $1 AND ua.status <> 'terminated'
     ORDER BY ua.last_updated DESC`,
    [userId]
  );

  const catalogResult = await pool.query(
    "SELECT application_name, category, qualification_summary FROM applications ORDER BY application_name"
  );

  const docsResult = await pool.query(
    `SELECT a.application_name, rd.document_name, rd.required_flag
     FROM required_documents rd
     JOIN applications a ON a.application_id = rd.application_id
     JOIN user_applications ua ON ua.application_id = a.application_id
     WHERE ua.user_id = $1 AND ua.status <> 'terminated'
     ORDER BY a.application_name, rd.required_flag DESC`,
    [userId]
  );

  let ctx = "=== USER PROFILE ===\n";
  ctx += `Name: ${p.first_name} ${p.last_name}\n`;
  if (p.household_size) ctx += `Household size: ${p.household_size}\n`;
  if (p.income != null) ctx += `Annual income: $${Number(p.income).toLocaleString()}\n`;
  if (p.employment_status) ctx += `Employment: ${p.employment_status}\n`;
  if (p.housing_status) ctx += `Housing: ${p.housing_status}\n`;
  if (p.disability_status) ctx += `Disability: ${p.disability_status}\n`;
  if (p.veteran_status) ctx += `Veteran: ${p.veteran_status}\n`;
  if (p.city || p.state) ctx += `Location: ${[p.city, p.state].filter(Boolean).join(", ")}\n`;
  if (missingFields.length > 0) ctx += `Missing profile fields: ${missingFields.join(", ")}\n`;

  if (userAppsResult.rows.length > 0) {
    ctx += "\n=== USER'S CURRENT APPLICATIONS ===\n";
    for (const app of userAppsResult.rows) {
      const steps = parseApplicationSteps(app.application_steps);
      const completed = normalizeStepsCompleted(app.steps_completed, steps.length);
      const doneCount = completed.filter(Boolean).length;
      ctx += `- ${app.application_name} (status: ${app.status}, ${doneCount}/${steps.length} steps done)\n`;
      ctx += `  Steps: ${steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}\n`;
      const appDocs = docsResult.rows.filter((d) => d.application_name === app.application_name);
      if (appDocs.length > 0) {
        ctx += `  Required docs: ${appDocs.map((d) => `${d.document_name}${d.required_flag ? " (required)" : " (optional)"}`).join(", ")}\n`;
      }
    }
  }

  ctx += "\n=== AVAILABLE PROGRAMS ===\n";
  for (const prog of catalogResult.rows) {
    ctx += `- ${prog.application_name} | ${prog.category} | ${prog.qualification_summary}\n`;
  }

  return ctx;
}

async function buildGuestContext() {
  const catalogResult = await pool.query(
    "SELECT application_name, category, qualification_summary FROM applications ORDER BY application_name"
  );
  let ctx = "=== GUEST USER (NOT LOGGED IN) ===\n";
  ctx += "No profile information available. Help them explore programs generally.\n\n";
  ctx += "=== AVAILABLE PROGRAMS ===\n";
  for (const prog of catalogResult.rows) {
    ctx += `- ${prog.application_name} | ${prog.category} | ${prog.qualification_summary}\n`;
  }
  return ctx;
}

async function parseAssistantResponse(rawText, userId) {
  const actions = [];
  const profilePrompts = [];
  const applicationProgress = [];

  const recommendRegex = /\*?\*?\[RECOMMEND:\s*([^\]]+)\]\*?\*?/g;
  let match;
  while ((match = recommendRegex.exec(rawText)) !== null) {
    // Guard against AI combining names: "LIHEAP / Weatherization" → split and handle each
    const rawNames = match[1].trim();
    const programNames = rawNames.split(/\s*[\/|&]\s+|\s+and\s+/i).map((n) => n.trim()).filter(Boolean);

    for (const programName of programNames) {
      const appRow = await pool.query(
        `SELECT application_id, application_name, category, description, official_url
         FROM applications WHERE application_name ILIKE $1`,
        [programName]
      );
      if (appRow.rowCount > 0) {
        const app = appRow.rows[0];
        let alreadyApplied = false;
        if (userId) {
          const uaCheck = await pool.query(
            `SELECT 1 FROM user_applications
             WHERE user_id = $1 AND application_id = $2 AND status <> 'terminated'`,
            [userId, app.application_id]
          );
          alreadyApplied = uaCheck.rowCount > 0;
        }
        actions.push({
          type: "program_recommendation",
          programName: app.application_name,
          applicationId: app.application_id,
          category: app.category,
          description: app.description,
          officialUrl: app.official_url,
          alreadyApplied,
        });
      }
    }
  }

  const askRegex = /\*?\*?\[ASK:\s*([^\]]+)\]\*?\*?/g;
  while ((match = askRegex.exec(rawText)) !== null) {
    const fieldName = match[1].trim();
    const config = PROFILE_FIELD_CONFIG[fieldName];
    if (config) {
      profilePrompts.push({
        field: fieldName,
        label: config.label,
        type: config.type,
        options: config.options,
      });
    }
  }

  if (userId) {
    const userApps = await pool.query(
      `SELECT ua.user_application_id, ua.steps_completed,
              a.application_name, a.application_steps
       FROM user_applications ua
       JOIN applications a ON a.application_id = ua.application_id
       WHERE ua.user_id = $1 AND ua.status NOT IN ('terminated', 'completed')`,
      [userId]
    );
    const textLower = rawText.toLowerCase();
    for (const ua of userApps.rows) {
      if (textLower.includes(ua.application_name.toLowerCase())) {
        const steps = effectiveStepsFromDbStepsText(ua.application_steps);
        const stepsCompleted = normalizeStepsCompleted(ua.steps_completed, steps.length);
        applicationProgress.push({
          userApplicationId: ua.user_application_id,
          applicationName: ua.application_name,
          steps,
          stepsCompleted,
        });
      }
    }
  }

  const cleanText = rawText
    .replace(/\*?\*?\[RECOMMEND:\s*[^\]]+\]\*?\*?\n?/g, "")
    .replace(/\*?\*?\[ASK:\s*[^\]]+\]\*?\*?\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, actions, profilePrompts, applicationProgress };
}

async function selectUserApplicationDetail(clientId, userApplicationId) {
  const { rows } = await pool.query(
    `SELECT
      ua.user_application_id AS "userApplicationId",
      ua.status,
      ua.date_started AS "dateStarted",
      ua.last_updated AS "lastUpdated",
      a.application_id AS "applicationId",
      a.application_name AS "applicationName",
      a.category,
      a.description,
      a.qualification_summary AS "qualificationSummary",
      a.official_url AS "officialUrl",
      a.application_steps AS "applicationStepsRaw",
      ua.steps_completed AS "stepsCompletedRaw"
    FROM user_applications ua
    INNER JOIN applications a ON a.application_id = ua.application_id
    WHERE ua.user_application_id = $1 AND ua.user_id = $2`,
    [userApplicationId, clientId]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapUserApplicationRow(rows[0]);
}

app.get("/", (req, res) => {
  res.json({ message: "Gov Aid Assistance API", status: "ok" });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "unhealthy", database: "disconnected", error: err.message });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { firstName = "", lastName = "", email, password } = req.body ?? {};
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const normalizedPassword = String(password ?? "");

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (normalizedPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const first = String(firstName).trim();
  const last = String(lastName).trim();
  if (!first || !last) {
    return res.status(400).json({ error: "First and last name are required." });
  }

  const existingUser = await pool.query("SELECT user_id FROM users WHERE email = $1", [normalizedEmail]);
  if (existingUser.rowCount > 0) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = hashPassword(normalizedPassword);
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const { rows } = await dbClient.query(
      `INSERT INTO users (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING user_id, first_name, last_name, email`,
      [first, last, normalizedEmail]
    );
    const userId = rows[0].user_id;
    await dbClient.query(
      `INSERT INTO login (user_id, username, password_hash, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [userId, normalizedEmail, passwordHash]
    );
    await dbClient.query("COMMIT");

    return res.status(201).json({
      ok: true,
      user: {
        clientId: userId,
        firstName: rows[0].first_name,
        lastName: rows[0].last_name,
        email: rows[0].email,
      },
    });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return res.status(500).json({ error: "Failed to create account.", details: err.message });
  } finally {
    dbClient.release();
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const normalizedPassword = String(password ?? "");

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, l.password_hash
       FROM users u
       INNER JOIN login l ON l.user_id = u.user_id
       WHERE u.email = $1 AND l.is_active = TRUE`,
      [normalizedEmail]
    );

    if (rows.length === 0 || !verifyPassword(normalizedPassword, rows[0].password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const userId = rows[0].user_id;
    await pool.query(`UPDATE login SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [userId]);

    return res.json({
      ok: true,
      user: {
        clientId: userId,
        firstName: rows[0].first_name,
        lastName: rows[0].last_name,
        email: rows[0].email,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to log in.", details: err.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const clientId = Number.parseInt(req.query.clientId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT user_id, first_name, last_name, email FROM users WHERE user_id = $1",
      [clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({
      ok: true,
      user: {
        clientId: rows[0].user_id,
        firstName: rows[0].first_name,
        lastName: rows[0].last_name,
        email: rows[0].email,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load user.", details: err.message });
  }
});

app.get("/api/clients/:clientId/sessions", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        cs.session_id,
        cs.client_id,
        cs.start_time,
        cs.end_time,
        cs.summary_generated,
        cs.is_starred,
        lm.message_text AS last_message_text,
        lm.sender_type AS last_message_sender,
        COALESCE(mc.message_count, 0) AS message_count
      FROM chat_session cs
      LEFT JOIN LATERAL (
        SELECT cm.message_text, cm.sender_type
        FROM chat_message cm
        WHERE cm.session_id = cs.session_id
        ORDER BY cm.message_id DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN (
        SELECT session_id, COUNT(*)::INT AS message_count
        FROM chat_message
        GROUP BY session_id
      ) mc ON mc.session_id = cs.session_id
      WHERE cs.client_id = $1
      ORDER BY cs.is_starred DESC, cs.session_id DESC`,
      [clientId]
    );

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch sessions.", details: err.message });
  }
});

app.post("/api/clients/:clientId/sessions", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  try {
    const userCheck = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [clientId]);

    if (userCheck.rowCount === 0) {
      return res.status(404).json({ error: "Client not found." });
    }

    const { rows } = await pool.query(
      `INSERT INTO chat_session (client_id, start_time, end_time, summary_generated, is_starred)
       VALUES ($1, CURRENT_TIMESTAMP, NULL, false, false)
       RETURNING session_id, client_id, start_time, end_time, summary_generated, is_starred`,
      [clientId]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Failed to create session.", details: err.message });
  }
});

app.patch("/api/clients/:clientId/sessions/:sessionId", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const { isStarred } = req.body;

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  if (typeof isStarred !== "boolean") {
    return res.status(400).json({ error: "isStarred must be a boolean." });
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE chat_session
       SET is_starred = $1
       WHERE session_id = $2 AND client_id = $3
       RETURNING session_id, client_id, start_time, end_time, summary_generated, is_starred`,
      [isStarred, sessionId, clientId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update session.", details: err.message });
  }
});

app.delete("/api/clients/:clientId/sessions/:sessionId", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  const sessionId = Number.parseInt(req.params.sessionId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM chat_session WHERE session_id = $1 AND client_id = $2",
      [sessionId, clientId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete session.", details: err.message });
  }
});

app.get("/api/sessions/:sessionId/messages", async (req, res) => {
  const sessionId = Number.parseInt(req.params.sessionId, 10);

  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  try {
    const sessionCheck = await pool.query(
      "SELECT session_id FROM chat_session WHERE session_id = $1",
      [sessionId]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    const { rows } = await pool.query(
      `SELECT
        message_id,
        session_id,
        sender_type,
        message_text,
        "timestamp",
        actions_json
      FROM chat_message
      WHERE session_id = $1
      ORDER BY message_id ASC`,
      [sessionId]
    );

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch messages.", details: err.message });
  }
});

app.post("/api/sessions/:sessionId/messages", async (req, res) => {
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const { messageText, senderType = "user" } = req.body;

  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  if (!messageText || typeof messageText !== "string" || messageText.trim().length === 0) {
    return res.status(400).json({ error: "messageText is required." });
  }

  if (!["user", "assistant"].includes(senderType)) {
    return res.status(400).json({ error: "senderType must be 'user' or 'assistant'." });
  }

  try {
    const sessionCheck = await pool.query(
      "SELECT session_id, client_id FROM chat_session WHERE session_id = $1",
      [sessionId]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    const sessionClientId = sessionCheck.rows[0].client_id;

    const { rows: userRows } = await pool.query(
      `INSERT INTO chat_message (session_id, sender_type, message_text, "timestamp")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING message_id, session_id, sender_type, message_text, "timestamp"`,
      [sessionId, senderType, messageText.trim()]
    );
    const savedUserMessage = userRows[0];

    if (senderType !== "user") {
      return res.status(201).json({ userMessage: savedUserMessage, assistantMessage: null, actions: [], profilePrompts: [] });
    }

    const userContext = await buildUserContext(sessionClientId);

    const { rows: historyRows } = await pool.query(
      `SELECT sender_type, message_text FROM chat_message
       WHERE session_id = $1 ORDER BY message_id ASC`,
      [sessionId]
    );

    const chatHistory = [];

    if (userContext) {
      chatHistory.push(
        { role: "user", parts: [{ text: "What do you know about me and what programs are available?" }] },
        { role: "model", parts: [{ text: `Here is what I know about you and the programs I can help with:\n\n${userContext}\n\nI'm ready to help you find programs you may qualify for. What would you like to know?` }] }
      );
    }

    chatHistory.push(
      ...historyRows.slice(0, -1).map((row) => ({
        role: row.sender_type === "user" ? "user" : "model",
        parts: [{ text: row.message_text }],
      }))
    );

    const chat = geminiModel.startChat({ history: chatHistory });
    const result = await chat.sendMessage(messageText.trim());
    const rawAssistantText = result.response.text();

    const { cleanText, actions, profilePrompts, applicationProgress } = await parseAssistantResponse(rawAssistantText, sessionClientId);

    const actionsPayload = { actions, profilePrompts, applicationProgress };
    const { rows: assistantRows } = await pool.query(
      `INSERT INTO chat_message (session_id, sender_type, message_text, "timestamp", actions_json)
       VALUES ($1, 'assistant', $2, CURRENT_TIMESTAMP, $3)
       RETURNING message_id, session_id, sender_type, message_text, "timestamp", actions_json`,
      [sessionId, cleanText, JSON.stringify(actionsPayload)]
    );

    return res.status(201).json({
      userMessage: savedUserMessage,
      assistantMessage: assistantRows[0],
      actions,
      profilePrompts,
      applicationProgress,
    });
  } catch (err) {
    console.error("Message route error:", err);
    return res.status(500).json({ error: "Failed to save message.", details: err.message });
  }
});

app.post("/api/chat/guest", async (req, res) => {
  const { messageText, conversationHistory = [] } = req.body;

  if (!messageText || typeof messageText !== "string" || messageText.trim().length === 0) {
    return res.status(400).json({ error: "messageText is required." });
  }

  try {
    const guestContext = await buildGuestContext();

    const chatHistory = [
      { role: "user", parts: [{ text: "What programs are available?" }] },
      { role: "model", parts: [{ text: `Here is what I can help with:\n\n${guestContext}\n\nI'm ready to help you explore programs. What would you like to know?` }] },
      ...conversationHistory.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
    ];

    const chat = geminiModel.startChat({ history: chatHistory });
    const result = await chat.sendMessage(messageText.trim());
    const rawText = result.response.text();

    const { cleanText, actions, profilePrompts } = await parseAssistantResponse(rawText, null);

    return res.json({ assistantMessage: cleanText, actions, profilePrompts });
  } catch (err) {
    console.error("Guest chat error:", err);
    return res.status(500).json({ error: "Failed to get AI response." });
  }
});

// Batch import messages into a session (used for guest→account migration)
app.post("/api/sessions/:sessionId/import", async (req, res) => {
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const { messages } = req.body;

  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  try {
    const sessionCheck = await pool.query(
      "SELECT session_id FROM chat_session WHERE session_id = $1",
      [sessionId]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    for (const msg of messages) {
      if (!msg.sender_type || !msg.message_text) continue;
      await pool.query(
        `INSERT INTO chat_message (session_id, sender_type, message_text, "timestamp")
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [sessionId, msg.sender_type, String(msg.message_text)]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({ error: "Failed to import messages." });
  }
});

app.get("/api/clients/:clientId/profile", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  try {
    const clientResult = await pool.query(
      `SELECT
         user_id AS client_id,
         first_name AS "firstName",
         last_name AS "lastName",
         email,
         phone,
         date_of_birth AS "dateOfBirth",
         city,
         state,
         zip_code AS "zipCode",
         household_size AS "householdSize",
         income,
         employment_status AS "employmentStatus",
         housing_status AS "housingStatus",
         disability_status AS "disabilityStatus",
         veteran_status AS "veteranStatus"
       FROM users
       WHERE user_id = $1`,
      [clientId]
    );

    if (clientResult.rowCount === 0) {
      return res.status(404).json({ error: "Client not found." });
    }

    const applicationsResult = await pool.query(
      `SELECT
        ua.user_application_id AS app_id,
        ua.date_started AS date_submitted,
        ua.status,
        ua.last_updated,
        a.application_name AS program_name,
        a.description AS description_plain_language
      FROM user_applications ua
      JOIN applications a ON a.application_id = ua.application_id
      WHERE ua.user_id = $1
      ORDER BY ua.last_updated DESC NULLS LAST, ua.user_application_id DESC`,
      [clientId]
    );

    return res.json({
      client: clientResult.rows[0],
      applications: applicationsResult.rows,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to fetch profile.",
      details: err.message,
    });
  }
});

app.post("/api/profile", async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    zip_code,
    date_of_birth,
    household_size,
    income,
    employment_status,
    housing_status,
    disability_status,
    veteran_status,
    preferred_language,
  } = req.body ?? {};

  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: "Email is required." });
  }
  if (!first_name || !last_name) {
    return res.status(400).json({ error: "First and last name are required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (
        first_name, last_name, email, phone, city, state, zip_code,
        date_of_birth, household_size, income, employment_status,
        housing_status, disability_status, veteran_status, preferred_language
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (email) DO UPDATE SET
        first_name         = EXCLUDED.first_name,
        last_name          = EXCLUDED.last_name,
        phone              = EXCLUDED.phone,
        city               = EXCLUDED.city,
        state              = EXCLUDED.state,
        zip_code           = EXCLUDED.zip_code,
        date_of_birth      = EXCLUDED.date_of_birth,
        household_size     = EXCLUDED.household_size,
        income             = EXCLUDED.income,
        employment_status  = EXCLUDED.employment_status,
        housing_status     = EXCLUDED.housing_status,
        disability_status  = EXCLUDED.disability_status,
        veteran_status     = EXCLUDED.veteran_status,
        preferred_language = EXCLUDED.preferred_language,
        updated_at         = CURRENT_TIMESTAMP
      RETURNING user_id, first_name, last_name, email`,
      [
        String(first_name).trim(),
        String(last_name).trim(),
        normalizedEmail,
        phone || null,
        city || null,
        state || null,
        zip_code || null,
        date_of_birth || null,
        household_size ? Number(household_size) : null,
        income ? Number(income) : null,
        employment_status || null,
        housing_status || null,
        disability_status || null,
        veteran_status || null,
        preferred_language || "English",
      ]
    );

    return res.status(201).json({ ok: true, user: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save profile.", details: err.message });
  }
});

async function pgTableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

app.delete("/api/clients/:clientId", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");

    // App chat (chat_session / chat_message) — only if tables exist (schema varies by environment).
    if ((await pgTableExists(dbClient, "chat_message")) && (await pgTableExists(dbClient, "chat_session"))) {
      await dbClient.query(
        `DELETE FROM chat_message
         WHERE session_id IN (SELECT session_id FROM chat_session WHERE client_id = $1)`,
        [clientId]
      );
      await dbClient.query("DELETE FROM chat_session WHERE client_id = $1", [clientId]);
    } else if (await pgTableExists(dbClient, "chat_session")) {
      await dbClient.query("DELETE FROM chat_session WHERE client_id = $1", [clientId]);
    }

    // Legacy seed schema (chat_threads / chat_messages) — must be removed or DELETE FROM users fails on FK.
    if ((await pgTableExists(dbClient, "chat_messages")) && (await pgTableExists(dbClient, "chat_threads"))) {
      await dbClient.query(
        `DELETE FROM chat_messages
         WHERE thread_id IN (SELECT thread_id FROM chat_threads WHERE user_id = $1)`,
        [clientId]
      );
      await dbClient.query("DELETE FROM chat_threads WHERE user_id = $1", [clientId]);
    }

    await dbClient.query("DELETE FROM user_applications WHERE user_id = $1", [clientId]);
    await dbClient.query("DELETE FROM login WHERE user_id = $1", [clientId]);
    const deleteUserResult = await dbClient.query("DELETE FROM users WHERE user_id = $1", [clientId]);

    if (deleteUserResult.rowCount === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }

    await dbClient.query("COMMIT");
    return res.status(204).send();
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    return res.status(500).json({ error: "Failed to delete account.", details: err.message });
  } finally {
    dbClient.release();
  }
});

// Patch a single eligibility field by client ID — used by in-chat ProfilePrompt
const ALLOWED_PROFILE_FIELDS = new Set([
  "household_size", "income", "employment_status",
  "housing_status", "disability_status", "veteran_status",
]);

app.patch("/api/clients/:clientId/profile-field", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  const { field, value } = req.body ?? {};
  if (!field || !ALLOWED_PROFILE_FIELDS.has(field)) {
    return res.status(400).json({ error: "Invalid or missing field name." });
  }

  const coerced = ["household_size", "income"].includes(field) ? Number(value) : String(value);

  try {
    await pool.query(
      `UPDATE users SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [coerced, clientId]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update field.", details: err.message });
  }
});

app.get("/api/applications", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        application_id,
        application_name,
        category,
        description,
        qualification_summary,
        official_url,
        application_steps
      FROM applications
      ORDER BY application_name ASC`
    );
    const body = rows.map((r) => ({
      applicationId: r.application_id,
      applicationName: r.application_name,
      category: r.category,
      description: r.description,
      qualificationSummary: r.qualification_summary,
      officialUrl: r.official_url,
      steps: effectiveStepsFromDbStepsText(r.application_steps),
    }));
    return res.json(body);
  } catch (err) {
    return res.status(500).json({
      error: "Failed to list applications.",
      details: err.message,
    });
  }
});

app.get("/api/clients/:clientId/user-applications", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }

  try {
    const userCheck = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [clientId]);
    if (userCheck.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const { rows } = await pool.query(
      `SELECT
        ua.user_application_id AS "userApplicationId",
        ua.status,
        ua.date_started AS "dateStarted",
        ua.last_updated AS "lastUpdated",
        a.application_id AS "applicationId",
        a.application_name AS "applicationName",
        a.category,
        a.description,
        a.qualification_summary AS "qualificationSummary",
        a.official_url AS "officialUrl",
        a.application_steps AS "applicationStepsRaw",
        ua.steps_completed AS "stepsCompletedRaw"
      FROM user_applications ua
      INNER JOIN applications a ON a.application_id = ua.application_id
      WHERE ua.user_id = $1 AND ua.status <> 'terminated'
      ORDER BY ua.last_updated DESC NULLS LAST, ua.user_application_id DESC`,
      [clientId]
    );

    return res.json(rows.map((r) => mapUserApplicationRow(r)));
  } catch (err) {
    return res.status(500).json({
      error: "Failed to fetch user applications.",
      details: err.message,
    });
  }
});

app.post("/api/clients/:clientId/user-applications", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  const applicationId = Number.parseInt(req.body?.applicationId ?? req.body?.application_id, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }
  if (Number.isNaN(applicationId)) {
    return res.status(400).json({ error: "applicationId is required." });
  }

  try {
    const userCheck = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [clientId]);
    if (userCheck.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const appRow = await pool.query(
      "SELECT application_id, application_steps FROM applications WHERE application_id = $1",
      [applicationId]
    );
    if (appRow.rowCount === 0) {
      return res.status(404).json({ error: "Application type not found." });
    }

    const stepList = effectiveStepsFromDbStepsText(appRow.rows[0].application_steps);
    const falses = stepList.map(() => false);
    const stepsJson = JSON.stringify(falses);

    const existing = await pool.query(
      `SELECT user_application_id, status FROM user_applications
       WHERE user_id = $1 AND application_id = $2`,
      [clientId, applicationId]
    );

    let userApplicationId;
    if (existing.rowCount > 0) {
      if (existing.rows[0].status !== "terminated") {
        return res.status(409).json({ error: "This application is already on your list." });
      }
      await pool.query(
        `UPDATE user_applications
         SET status = 'active', steps_completed = $1::jsonb, last_updated = CURRENT_TIMESTAMP
         WHERE user_application_id = $2`,
        [stepsJson, existing.rows[0].user_application_id]
      );
      userApplicationId = existing.rows[0].user_application_id;
    } else {
      const ins = await pool.query(
        `INSERT INTO user_applications (user_id, application_id, status, steps_completed)
         VALUES ($1, $2, 'active', $3::jsonb)
         RETURNING user_application_id`,
        [clientId, applicationId, stepsJson]
      );
      userApplicationId = ins.rows[0].user_application_id;
    }

    const detail = await selectUserApplicationDetail(clientId, userApplicationId);
    return res.status(201).json(detail);
  } catch (err) {
    return res.status(500).json({
      error: "Failed to add application.",
      details: err.message,
    });
  }
});

app.patch("/api/clients/:clientId/user-applications/:userApplicationId", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  const userApplicationId = Number.parseInt(req.params.userApplicationId, 10);
  const { stepsCompleted, status: requestedStatus } = req.body ?? {};

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }
  if (Number.isNaN(userApplicationId)) {
    return res.status(400).json({ error: "Invalid user application ID." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT ua.status, ua.steps_completed, a.application_steps
       FROM user_applications ua
       INNER JOIN applications a ON a.application_id = ua.application_id
       WHERE ua.user_application_id = $1 AND ua.user_id = $2`,
      [userApplicationId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User application not found." });
    }

    const row = rows[0];
    const steps = effectiveStepsFromDbStepsText(row.application_steps);
    const stepCount = steps.length;

    if (row.status === "terminated") {
      return res.status(400).json({ error: "This application was removed." });
    }

    let nextSteps = normalizeStepsCompleted(row.steps_completed, stepCount);
    const wantsComplete = requestedStatus === "completed";

    if (Array.isArray(stepsCompleted)) {
      if (row.status === "completed") {
        return res.status(400).json({ error: "Application is already completed." });
      }
      if (stepsCompleted.length !== stepCount) {
        return res.status(400).json({ error: "stepsCompleted length does not match steps." });
      }
      nextSteps = stepsCompleted.map(Boolean);
    } else if (wantsComplete && row.status === "completed") {
      const detail = await selectUserApplicationDetail(clientId, userApplicationId);
      return res.json(detail);
    }

    let nextStatus = row.status;
    if (wantsComplete) {
      if (!nextSteps.every(Boolean)) {
        return res.status(400).json({ error: "Complete all steps before marking complete." });
      }
      nextStatus = "completed";
    }

    await pool.query(
      `UPDATE user_applications
       SET steps_completed = $1::jsonb,
           status = $2,
           last_updated = CURRENT_TIMESTAMP
       WHERE user_application_id = $3 AND user_id = $4`,
      [JSON.stringify(nextSteps), nextStatus, userApplicationId, clientId]
    );

    const detail = await selectUserApplicationDetail(clientId, userApplicationId);
    return res.json(detail);
  } catch (err) {
    return res.status(500).json({
      error: "Failed to update application.",
      details: err.message,
    });
  }
});

app.delete("/api/clients/:clientId/user-applications/:userApplicationId", async (req, res) => {
  const clientId = Number.parseInt(req.params.clientId, 10);
  const userApplicationId = Number.parseInt(req.params.userApplicationId, 10);

  if (Number.isNaN(clientId)) {
    return res.status(400).json({ error: "Invalid client ID." });
  }
  if (Number.isNaN(userApplicationId)) {
    return res.status(400).json({ error: "Invalid user application ID." });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE user_applications
       SET status = 'terminated', last_updated = CURRENT_TIMESTAMP
       WHERE user_application_id = $1 AND user_id = $2`,
      [userApplicationId, clientId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "User application not found." });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({
      error: "Failed to remove application.",
      details: err.message,
    });
  }
});

app.get("/api/metrics/okr", async (req, res) => {
  const { startDate, endDate } = req.query ?? {};

  const params = [];
  const whereClausesRoot = [];

  if (startDate) {
    params.push(startDate);
    whereClausesRoot.push(`date_started >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    whereClausesRoot.push(`date_started <= $${params.length}`);
  }

  const whereRootSql = whereClausesRoot.length > 0 ? `WHERE ${whereClausesRoot.join(" AND ")}` : "";

  try {
    const metricsResult = await pool.query(
      `
        SELECT
          COUNT(*) AS total_started,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END), 0) AS completion_rate
        FROM user_applications
        ${whereRootSql}
      `,
      params,
    );

    const row = metricsResult.rows[0] ?? {};

    return res.json({
      totalStarted: Number(row.total_started) || 0,
      completionRate: Number(row.completion_rate) || 0,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to load OKR metrics.",
      details: err.message,
    });
  }
});

// Auto-migrate: add actions_json column if it doesn't exist
pool.query("ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS actions_json JSONB")
  .catch((err) => console.warn("actions_json migration skipped:", err.message));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
