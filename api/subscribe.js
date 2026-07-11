import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const ALLOWED_ORIGINS = new Set([
  "https://juliareel37.github.io",
  "https://therapywithjayne.com"
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const message = String(req.body?.message || "").trim();
    const source = String(req.body?.source || "waitlist").trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: "Please enter a valid email address."
      });
    }

    await sql`
      INSERT INTO contact_page (email, name, message, source)
      VALUES (${email}, ${name}, ${message}, ${source})
      ON CONFLICT (email) DO NOTHING    `;

    return res.status(200).json({
      ok: true
    });
  } catch (error) {
    console.error("Insert failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Something went wrong."
    });
  }
}