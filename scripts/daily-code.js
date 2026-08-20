const crypto = require("crypto");

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

  const firebaseDbUrl = process.env.FIREBASE_DATABASE_URL;
  const firebaseToken = process.env.FIREBASE_DATABASE_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_CHANNEL;

  if (!firebaseDbUrl || !firebaseToken || !botToken || !channel) {
    throw new Error("Missing GitHub Secrets");
  }

  const payload = {
    code: code,
    date: date,
    reward: reward,
    generatedAt: new Date().toISOString()
  };

  const dbRes = await fetch(
    `${firebaseDbUrl.replace(/\/$/, "")}/dailyCode/current.json?auth=${encodeURIComponent(firebaseToken)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  if (!dbRes.ok) {
    throw new Error(
      `Firebase write failed: ${dbRes.status} ${await dbRes.text()}`
    );
  }

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

main().catch(error => {
  console.error(error);
  process.exit(1);
});
