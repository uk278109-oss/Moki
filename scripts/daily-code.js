const crypto = require("crypto");
const admin = require("firebase-admin");
const sharp = require("sharp");

function makeCode(date) {
  const secret = process.env.DAILY_CODE_SECRET;

  if (!secret) {
    throw new Error("Missing DAILY_CODE_SECRET");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`MOKI-${date}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createRedeemCard({ date, code, reward }) {
  const safeDate = escapeXml(date);
  const safeCode = escapeXml(code);
  const safeReward = escapeXml(reward.toLocaleString());

  return `
<svg width="1200" height="675" viewBox="0 0 1200 675"
     xmlns="http://www.w3.org/2000/svg">

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>

    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>

    <filter id="shadow">
      <feDropShadow dx="0" dy="12" stdDeviation="18"
                    flood-opacity="0.30"/>
    </filter>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>

  <circle cx="1050" cy="100" r="180"
          fill="#8b5cf6" opacity="0.12"/>
  <circle cx="100" cy="610" r="220"
          fill="#6366f1" opacity="0.10"/>

  <rect x="70" y="55" width="1060" height="565"
        rx="42" fill="url(#card)"
        filter="url(#shadow)"/>

  <text x="600" y="145"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="52"
        font-weight="700"
        fill="white">
    🎁 MOKI DAILY REDEEM CODE
  </text>

  <text x="600" y="205"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="28"
        fill="#e0e7ff">
    Redeem today's reward
  </text>

  <rect x="180" y="255" width="840" height="145"
        rx="28" fill="white" opacity="0.97"/>

  <text x="600" y="310"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="25"
        font-weight="600"
        fill="#4f46e5">
    TODAY'S CODE
  </text>

  <text x="600" y="370"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="58"
        font-weight="800"
        letter-spacing="8"
        fill="#111827">
    ${safeCode}
  </text>

  <text x="600" y="465"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="27"
        fill="#e0e7ff">
    📅 ${safeDate}    •    💰 ${safeReward} Moki
  </text>

  <text x="600" y="550"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="24"
        font-weight="600"
        fill="white">
    Open Moki and redeem today's code
  </text>

</svg>
`;
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const code = makeCode(date);
  const reward = Number(process.env.DAILY_REWARD || 1000);

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_CHANNEL;

  if (!databaseURL || !serviceAccountJSON || !botToken || !channel) {
    throw new Error("Missing GitHub Secrets");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(serviceAccountJSON);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
      });
    }

    const db = admin.database();

    const payload = {
      code,
      date,
      reward,
      generatedAt: new Date().toISOString()
    };

    await db.ref("dailyCode/current").set(payload);

    console.log("Firebase daily code saved.");

    const svg = createRedeemCard({
      date,
      code,
      reward
    });

    const imageBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    const caption =
`🎁 MOKI DAILY REDEEM CODE

📅 Date: ${date}
🎟 Code: ${code}
💰 Reward: ${reward.toLocaleString()} Moki

Open Moki and redeem today's code.`;

    const form = new FormData();

    form.append("chat_id", channel);
    form.append(
      "photo",
      new Blob([imageBuffer], { type: "image/png" }),
      "moki-daily-code.png"
    );
    form.append("caption", caption);

    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        body: form
      }
    );

    const tgText = await tgRes.text();

    if (!tgRes.ok) {
      throw new Error(
        `Telegram image post failed: ${tgRes.status} ${tgText}`
      );
    }

    console.log(`Published Moki daily image: ${code}`);
  } finally {
    if (admin.apps.length) {
      await admin.app().delete();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
