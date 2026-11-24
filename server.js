const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const helmet = require("helmet");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

const PORT = Number(process.env.PORT || 3000);
const ROOM_NAME = process.env.ROOM_NAME || "Caro Live";
const HOST_TIKTOK = process.env.HOST_TIKTOK || "@mbbb1118";
const ADMIN_PIN = process.env.ADMIN_PIN || "CHANGE_ME";
const GIFT_TOKEN = process.env.GIFT_WEBHOOK_TOKEN || "CHANGE_ME";
const BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));
app.get("/play", (_req, res) => res.sendFile(require("path").join(__dirname, "public", "index.html")));
app.set("trust proxy", process.env.TRUST_PROXY === "true");

let board = Array(225).fill(null);
let turn = "X";
let winner = null;
let activePlayer = null;
let queue = [];
let scores = { host: 0, viewers: 0 };
let lastMoves = [];

function publicState() {
  return { roomName: ROOM_NAME, host: HOST_TIKTOK, board, turn, winner,
    activePlayer, queue: queue.map(({ username, gift, at }) => ({ username, gift, at })),
    scores, lastMoves };
}
function broadcast() { io.emit("state", publicState()); }
function checkWin(b, idx, mark) {
  const r = Math.floor(idx / 15), c = idx % 15;
  for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    let count = 1;
    for (const sign of [-1,1]) {
      let rr = r + dr * sign, cc = c + dc * sign;
      while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && b[rr*15+cc] === mark) {
        count++; rr += dr * sign; cc += dc * sign;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}
function authAdmin(req, res, next) {
  const pin = req.get("x-admin-pin") || req.body?.pin;
  if (!ADMIN_PIN || ADMIN_PIN === "CHANGE_ME" || pin !== ADMIN_PIN) {
    return res.status(401).json({ error: "Admin PIN không hợp lệ hoặc chưa cấu hình." });
  }
  next();
}
function addGift({ username, giftName }) {
  const clean = String(username || "").trim().replace(/^@/, "").slice(0, 40);
  if (!clean) return false;
  const key = clean.toLowerCase();
  if (!queue.some(p => p.username.toLowerCase() === key) &&
      !(activePlayer && activePlayer.toLowerCase() === key)) {
    queue.push({ username: clean, gift: String(giftName || "TikTok gift").slice(0, 80), at: Date.now() });
  }
  broadcast();
  return true;
}

app.get("/api/config", (_req, res) => res.json({ roomName: ROOM_NAME, host: HOST_TIKTOK }));
app.get("/api/state", (_req, res) => res.json(publicState()));
app.get("/api/qr", async (req, res) => {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  const target = `${base}/play`;
  try {
    const png = await QRCode.toBuffer(target, { type: "png", width: 600, margin: 2 });
    res.type("png").send(png);
  } catch { res.status(500).send("QR generation failed"); }
});

/*
  Gift bridge contract:
  POST /api/gifts
  Header: x-gift-token: <GIFT_WEBHOOK_TOKEN>
  JSON: { "event":"gift", "username":"viewer_handle", "giftName":"Rose" }
  Configure a trusted LIVE event bridge to transform verified gift events to this format.
*/
app.post("/api/gifts", (req, res) => {
  const token = req.get("x-gift-token");
  const supplied = Buffer.from(String(token || ""));
  const expected = Buffer.from(String(GIFT_TOKEN));
  if (!GIFT_TOKEN || GIFT_TOKEN === "CHANGE_ME" || supplied.length !== expected.length ||
      !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Invalid gift bridge token" });
  }
  const { event, username, giftName } = req.body || {};
  if (event !== "gift" || !username) return res.status(400).json({ error: "Expected a verified gift event and username" });
  addGift({ username, giftName });
  res.json({ ok: true });
});

app.post("/api/admin/add-player", authAdmin, (req, res) => {
  const username = String(req.body.username || "").trim().replace(/^@/, "").slice(0, 40);
  const giftName = String(req.body.giftName || "Quà TikTok đã xác nhận").slice(0, 80);
  if (!username) return res.status(400).json({ error: "Nhập tên TikTok người tặng." });
  const exists = queue.some(p => p.username.toLowerCase() === username.toLowerCase()) ||
    (activePlayer && activePlayer.toLowerCase() === username.toLowerCase());
  if (!exists) queue.push({ username, gift: giftName, at: Date.now() });
  broadcast();
  res.json({ ok: true });
});
app.post("/api/admin/select", authAdmin, (req, res) => {
  const username = String(req.body.username || "");
  const found = queue.find(p => p.username.toLowerCase() === username.toLowerCase());
  if (!found) return res.status(404).json({ error: "Không tìm thấy người chơi trong hàng chờ." });
  if (activePlayer) return res.status(409).json({ error: "Đang có người chơi trong ván." });
  activePlayer = found.username;
  queue = queue.filter(p => p !== found);
  board = Array(225).fill(null); turn = "X"; winner = null; lastMoves = [];
  broadcast(); res.json({ ok: true });
});
app.post("/api/admin/move", authAdmin, (req, res) => {
  const idx = Number(req.body.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= 225 || board[idx] || winner || turn !== "X")
    return res.status(400).json({ error: "Nước đi không hợp lệ." });
  board[idx] = "X"; lastMoves.push(idx);
  if (checkWin(board, idx, "X")) { winner = "X"; scores.host++; }
  else turn = "O";
  broadcast(); res.json({ ok: true });
});
app.post("/api/admin/next", authAdmin, (_req, res) => {
  activePlayer = null; board = Array(225).fill(null); turn = "X"; winner = null; lastMoves = [];
  broadcast(); res.json({ ok: true });
});
app.post("/api/admin/reset-score", authAdmin, (_req, res) => {
  scores = { host: 0, viewers: 0 }; broadcast(); res.json({ ok: true });
});

io.on("connection", socket => {
  socket.emit("state", publicState());
  socket.on("viewer:join", ({ username } = {}) => {
    const clean = String(username || "").trim().replace(/^@/, "").slice(0, 40);
    if (!clean) return socket.emit("notice", "Nhập tên TikTok trước.");
    const eligible = queue.some(p => p.username.toLowerCase() === clean.toLowerCase()) ||
      (activePlayer && activePlayer.toLowerCase() === clean.toLowerCase());
    if (!eligible) return socket.emit("notice", "Chưa thấy quà hợp lệ của tài khoản này. Hãy tặng quà trên LIVE và chờ hệ thống xác nhận.");
    socket.data.username = clean;
    socket.emit("notice", "Đã kết nối phòng. Chờ chủ LIVE chọn bạn.");
    socket.join("viewers");
  });
  socket.on("viewer:move", ({ index } = {}) => {
    const username = socket.data.username;
    if (!username || !activePlayer || username.toLowerCase() !== activePlayer.toLowerCase())
      return socket.emit("notice", "Bạn chưa được chọn làm đối thủ.");
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 225 || board[idx] || winner || turn !== "O")
      return socket.emit("notice", "Chưa đến lượt bạn hoặc ô này không hợp lệ.");
    board[idx] = "O"; lastMoves.push(idx);
    if (checkWin(board, idx, "O")) { winner = "O"; scores.viewers++; }
    else turn = "X";
    broadcast();
  });
});

server.listen(PORT, () => console.log(`Caro LIVE listening on :${PORT}`));
