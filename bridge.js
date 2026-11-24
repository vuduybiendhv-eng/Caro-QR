// Run this on the same Windows PC as TikFinity Desktop.
// It forwards verified gift events from TikFinity's local Event API to Railway.
const WebSocket = require("ws");

const TIKFINITY_WS_URL = process.env.TIKFINITY_WS_URL || "ws://127.0.0.1:21213/";
const CARO_PUBLIC_URL = (process.env.CARO_PUBLIC_URL || "").replace(/\/$/, "");
const GIFT_TOKEN = process.env.GIFT_WEBHOOK_TOKEN || "";

if (!CARO_PUBLIC_URL.startsWith("https://")) {
  console.error("Set CARO_PUBLIC_URL to your deployed https:// Railway domain.");
  process.exit(1);
}
if (!GIFT_TOKEN || GIFT_TOKEN === "CHANGE_ME") {
  console.error("Set GIFT_WEBHOOK_TOKEN to the same secret configured in Railway.");
  process.exit(1);
}

function first(...values) {
  return values.find(v => typeof v === "string" && v.trim()) || "";
}
function handleEvent(packet) {
  if (!packet || packet.event !== "gift") return;
  const d = packet.data || packet;
  const user = d.user || d.sender || d.userInfo || {};
  const gift = d.gift || d.giftDetails || {};
  const username = first(
    user.uniqueId, user.unique_id, user.username, user.userName,
    d.uniqueId, d.unique_id, d.username, d.userName, d.nickname
  );
  const giftName = first(
    d.giftName, d.gift_name, gift.name, gift.giftName, gift.gift_name,
    d.describe, d.name
  ) || "TikTok gift";

  if (!username) {
    console.warn("Gift event without a recognizable username. Inspect the raw event below:");
    console.dir(packet, { depth: 5 });
    return;
  }

  fetch(`${CARO_PUBLIC_URL}/api/gifts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gift-token": GIFT_TOKEN
    },
    body: JSON.stringify({ event: "gift", username, giftName })
  }).then(async response => {
    const body = await response.text();
    if (!response.ok) console.error("Railway rejected gift:", response.status, body);
    else console.log(`Gift forwarded: @${username} — ${giftName}`);
  }).catch(err => console.error("Could not reach Railway:", err.message));
}

let retryMs = 3000;
function connect() {
  console.log(`Connecting to TikFinity Event API: ${TIKFINITY_WS_URL}`);
  const ws = new WebSocket(TIKFINITY_WS_URL);
  ws.on("open", () => { retryMs = 3000; console.log("TikFinity connected. Waiting for gift events…"); });
  ws.on("message", raw => {
    try {
      const packet = JSON.parse(raw.toString());
      handleEvent(packet);
    } catch (err) {
      console.warn("Unrecognized TikFinity message:", err.message);
    }
  });
  ws.on("error", err => console.error("TikFinity socket:", err.message));
  ws.on("close", () => {
    console.log(`TikFinity disconnected. Reconnecting in ${retryMs/1000}s…`);
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 30000);
  });
}
connect();
