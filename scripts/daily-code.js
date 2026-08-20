const crypto = require("crypto");
const admin = require("firebase-admin");

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

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: databaseURL
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

  const message =
`🎁 MOKI DAILY REDEEM CODE

📅 Date: ${date}
🎟 Code: ${code}
💰 Reward: ${reward.toLocaleString()} Moki

Open Moki and redeem today's code.`;

  const tgRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: channel,
        text: message
      })
    }
  );

  if (!tgRes.ok) {
    throw new Error(
      `Telegram post failed: ${tgRes.status} ${await tgRes.text()}`
    );
  }

  console.log(`Published Moki code: ${code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
