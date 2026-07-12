import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const ALLOWED_ORIGINS = new Set([
  "https://juliareel37.github.io",
  "https://therapywithjayne.com"
]);

const RESEND_EMAIL_URL = "https://api.resend.com/emails";

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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildNotificationEmail({ email, name, message, source }) {
  const displayName = name || "Not provided";
  const displayMessage = message || "Not provided";
  const dashboardUrl = String(process.env.ADMIN_DASHBOARD_URL || "").trim();
  const dashboardText = dashboardUrl
    ? ["", "View all submissions:", dashboardUrl]
    : [];
  const dashboardHtml = dashboardUrl
    ? `
      <p style="margin: 24px 0 0;">
        <a
          href="${escapeHtml(dashboardUrl)}"
          style="display: inline-block; background: #1f2933; color: #ffffff; padding: 10px 14px; text-decoration: none; border-radius: 6px;"
        >
          View all submissions
        </a>
      </p>
    `
    : "";

  const text = [
    "A new Therapy with Jayne form submission has been received.",
    "",
    `Name: ${displayName}`,
    `Email: ${email}`,
    `Source: ${source}`,
    "",
    "Message:",
    displayMessage,
    ...dashboardText
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">New form submission received</h2>
      <p>A new Therapy with Jayne form submission has been received.</p>
      <table style="border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 6px 12px 6px 0; font-weight: bold;">Name</td>
          <td style="padding: 6px 0;">${escapeHtml(displayName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; font-weight: bold;">Email</td>
          <td style="padding: 6px 0;">${escapeHtml(email)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; font-weight: bold;">Source</td>
          <td style="padding: 6px 0;">${escapeHtml(source)}</td>
        </tr>
      </table>
      <p style="font-weight: bold; margin-bottom: 6px;">Message</p>
      <p style="white-space: pre-wrap; margin-top: 0;">${escapeHtml(displayMessage)}</p>
      ${dashboardHtml}
    </div>
  `;

  return {
    subject: "New Therapy with Jayne submission received",
    text,
    html
  };
}

function getNotificationRecipients(value) {
  return String(value || "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

async function sendSubmissionNotification(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = getNotificationRecipients(process.env.SUBMISSION_NOTIFICATION_EMAIL);

  if (!apiKey || !from || to.length === 0) {
    console.warn(
      "Resend notification skipped: RESEND_API_KEY, RESEND_FROM_EMAIL, and SUBMISSION_NOTIFICATION_EMAIL are required."
    );
    return;
  }

  const emailContent = buildNotificationEmail(submission);
  const response = await fetch(RESEND_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: submission.email,
      ...emailContent
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend email failed with ${response.status}: ${errorBody}`);
  }
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
    `;

    await sendSubmissionNotification({
      email,
      name,
      message,
      source
    });

    return res.status(200).json({
      ok: true
    });
  } catch (error) {
    console.error("Submission failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Something went wrong."
    });
  }
}
