
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const helmet = require("helmet");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = Number(process.env.PORT || 3000);
const ROOM_NAME = process.env.ROOM_NAME || "Caro Live";
const HOST_TIKTOK = process.env.HOST_TIKTOK || "@mbbb1118";
const ADMIN_PIN = process.env.ADMIN_PIN || "CHANGE_ME";
const GIFT_TOKEN = process.env.GIFT_WEBHOOK_TOKEN || "CHANGE_ME";
const BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const TURN_TIME = 30;

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/play", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

let board = Array(225).fill(null);
let turn = "X";
let winner = null;
let activePlayer = null;
let queue = [];
let pendingQueue = [];
let scores = { host: 0, viewers: 0 };
let lastMoves = [];
let lastMove = null;

// null | "host" | "viewer"
let rematchRequest = null;

let turnDeadline = null;
let lastBroadcastSecond = -1;

function remainingSeconds() {
  if (!turnDeadline || winner) return 0;
  return Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
}

function startTurnTimer() {
  turnDeadline = Date.now() + TURN_TIME * 1000;
  lastBroadcastSecond = -1;
}

function stopTurnTimer() {
  turnDeadline = null;
  lastBroadcastSecond = -1;
}

function publicState() {
  return {
    roomName: ROOM_NAME,
    host: HOST_TIKTOK,
    board: [...board],
    turn,
    winner,
    activePlayer,
    turnTime: TURN_TIME,
    remainingSeconds: remainingSeconds(),
    turnDeadline,
    serverTime: Date.now(),
    queue: queue.map(({ username, gift, at }) => ({ username, gift, at })),
    pendingQueue: pendingQueue.map(({ username, at }) => ({ username, at })),
    scores: { ...scores },
    lastMoves: [...lastMoves],
    lastMove,
    rematchRequest
  };
}

function broadcast() {
  io.emit("state", publicState());
}

function startNewRound() {
  if (!activePlayer) return false;

  board = Array(225).fill(null);
  winner = null;
  lastMoves = [];
  lastMove = null;
  rematchRequest = null;

  // Bốc thăm độc lập cho mỗi ván
  turn = Math.random() < 0.5 ? "X" : "O";

  startTurnTimer();
  broadcast();
  return true;
}

setInterval(() => {
  if (!turnDeadline || winner) return;

  const remaining = remainingSeconds();

  if (Date.now() >= turnDeadline) {
    const timedOutTurn = turn;
    winner = timedOutTurn === "X" ? "O" : "X";

    if (timedOutTurn === "X") scores.viewers++;
    else scores.host++;

    rematchRequest = null;
    stopTurnTimer();
    broadcast();
    console.log(`Hết giờ lượt ${timedOutTurn}. Người thắng: ${winner}`);
    return;
  }

  if (remaining !== lastBroadcastSecond) {
    lastBroadcastSecond = remaining;
    broadcast();
  }
}, 200);

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .slice(0, 40);
}

function existsAnywhere(username) {
  const key = username.toLowerCase();

  return (
    pendingQueue.some(p => p.username.toLowerCase() === key) ||
    queue.some(p => p.username.toLowerCase() === key) ||
    (activePlayer && activePlayer.toLowerCase() === key)
  );
}

function checkWin(b, idx, mark) {
  const r = Math.floor(idx / 15);
  const c = idx % 15;

  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1;

    for (const sign of [-1, 1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;

      while (
        rr >= 0 && rr < 15 &&
        cc >= 0 && cc < 15 &&
        b[rr * 15 + cc] === mark
      ) {
        count++;
        rr += dr * sign;
        cc += dc * sign;
      }
    }

    if (count >= 5) return true;
  }

  return false;
}

function authAdmin(req, res, next) {
  const pin = req.get("x-admin-pin") || req.body?.pin;

  if (
    !ADMIN_PIN ||
    ADMIN_PIN === "CHANGE_ME" ||
    pin !== ADMIN_PIN
  ) {
    return res.status(401).json({
      error: "Admin PIN không hợp lệ hoặc chưa cấu hình."
    });
  }

  next();
}

function addGift({ username, giftName }) {
  const clean = cleanUsername(username);
  if (!clean) return false;

  if (!existsAnywhere(clean)) {
    queue.push({
      username: clean,
      gift: String(giftName || "TikTok gift").slice(0, 80),
      at: Date.now()
    });
  }

  broadcast();
  return true;
}

function viewerIsActive(socket) {
  return !!(
    socket.data.username &&
    activePlayer &&
    socket.data.username.toLowerCase() === activePlayer.toLowerCase()
  );
}

function beginRematch(agreedBy) {
  if (!winner || !activePlayer || !rematchRequest) return false;

  const requester = rematchRequest;

  if (requester === agreedBy) return false;

  return startNewRound();
}

app.get("/api/config", (_req, res) => {
  res.json({ roomName: ROOM_NAME, host: HOST_TIKTOK });
});

app.get("/api/state", (_req, res) => {
  res.json(publicState());
});

app.get("/api/qr", async (req, res) => {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  const target = `${base}/play`;

  try {
    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: 600,
      margin: 2
    });
    res.type("png").send(png);
  } catch (error) {
    console.error("QR error:", error);
    res.status(500).send("QR generation failed");
  }
});

app.post("/api/gifts", (req, res) => {
  const token = req.get("x-gift-token");
  const supplied = Buffer.from(String(token || ""));
  const expected = Buffer.from(String(GIFT_TOKEN));

  if (
    !GIFT_TOKEN ||
    GIFT_TOKEN === "CHANGE_ME" ||
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return res.status(401).json({ error: "Invalid gift bridge token" });
  }

  const { event, username, giftName } = req.body || {};

  if (event !== "gift" || !username) {
    return res.status(400).json({
      error: "Expected a verified gift event and username"
    });
  }

  addGift({ username, giftName });
  res.json({ ok: true });
});

app.post("/api/admin/add-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);
  const giftName = String(req.body.giftName || "Quà TikTok đã xác nhận").slice(0, 80);

  if (!username) {
    return res.status(400).json({ error: "Nhập tên TikTok người chơi." });
  }

  if (!existsAnywhere(username)) {
    queue.push({ username, gift: giftName, at: Date.now() });
  }

  broadcast();
  res.json({ ok: true });
});

app.post("/api/admin/approve-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);
  const found = pendingQueue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu đăng ký." });
  }

  pendingQueue = pendingQueue.filter(p => p !== found);
  queue.push({
    username: found.username,
    gift: "Đã được chủ LIVE duyệt",
    at: found.at
  });

  broadcast();
  res.json({ ok: true });
});

app.post("/api/admin/reject-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);
  const found = pendingQueue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu đăng ký." });
  }

  pendingQueue = pendingQueue.filter(p => p !== found);
  broadcast();
  res.json({ ok: true });
});

app.post("/api/admin/select", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  if (activePlayer) {
    return res.status(409).json({ error: "Đang có người chơi trong ván." });
  }

  const found = queue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({ error: "Không tìm thấy người chơi trong hàng chờ." });
  }

  activePlayer = found.username;
  queue = queue.filter(p => p !== found);

  startNewRound();
  res.json({ ok: true });
});

app.post("/api/admin/move", authAdmin, (req, res) => {
  const idx = Number(req.body.index);

  if (
    !Number.isInteger(idx) ||
    idx < 0 || idx >= 225 ||
    board[idx] !== null ||
    winner ||
    turn !== "X" ||
    !turnDeadline ||
    Date.now() >= turnDeadline
  ) {
    return res.status(400).json({
      error: "Nước đi không hợp lệ hoặc đã hết giờ."
    });
  }

  board[idx] = "X";
  lastMoves.push(idx);
  lastMove = idx;

  if (checkWin(board, idx, "X")) {
    winner = "X";
    scores.host++;
    rematchRequest = null;
    stopTurnTimer();
  } else {
    turn = "O";
    startTurnTimer();
  }

  broadcast();
  res.json({ ok: true });
});

// Chủ LIVE yêu cầu đấu lại
app.post("/api/admin/rematch-request", authAdmin, (_req, res) => {
  if (!winner || !activePlayer) {
    return res.status(400).json({ error: "Chỉ có thể yêu cầu đấu lại sau khi ván kết thúc." });
  }

  if (rematchRequest) {
    return res.status(409).json({ error: "Đã có yêu cầu đấu lại đang chờ xác nhận." });
  }

  rematchRequest = "host";
  broadcast();
  res.json({ ok: true });
});

// Chủ LIVE xác nhận yêu cầu đấu lại của người xem
app.post("/api/admin/rematch-confirm", authAdmin, (_req, res) => {
  if (rematchRequest !== "viewer" || !winner) {
    return res.status(400).json({ error: "Không có yêu cầu đấu lại từ người xem." });
  }

  if (!beginRematch("host")) {
    return res.status(400).json({ error: "Không thể bắt đầu ván đấu lại." });
  }

  res.json({ ok: true });
});

app.post("/api/admin/next", authAdmin, (_req, res) => {
  activePlayer = null;
  board = Array(225).fill(null);
  turn = "X";
  winner = null;
  lastMoves = [];
  lastMove = null;
  rematchRequest = null;
  stopTurnTimer();

  broadcast();
  res.json({ ok: true });
});

app.post("/api/admin/reset-score", authAdmin, (_req, res) => {
  scores = { host: 0, viewers: 0 };
  broadcast();
  res.json({ ok: true });
});

function registerViewer(socket, username) {
  const clean = cleanUsername(username);

  if (!clean) {
    socket.emit("notice", "Vui lòng nhập tên TikTok.");
    return;
  }

  const key = clean.toLowerCase();
  const pending = pendingQueue.some(p => p.username.toLowerCase() === key);
  const approved = queue.some(p => p.username.toLowerCase() === key);
  const playing = activePlayer && activePlayer.toLowerCase() === key;

  if (pending || approved || playing) {
    socket.data.username = clean;
    socket.join("viewers");

    socket.emit(
      "notice",
      pending
        ? "Yêu cầu đã gửi. Vui lòng chờ chủ LIVE duyệt."
        : playing
          ? "Bạn đang tham gia trận đấu!"
          : "Bạn đã được duyệt. Hãy chờ chủ LIVE chọn đấu."
    );

    socket.emit("state", publicState());
    return;
  }

  if (existsAnywhere(clean)) {
    socket.emit("notice", "Tên này hiện đã được sử dụng.");
    return;
  }

  pendingQueue.push({ username: clean, at: Date.now() });
  socket.data.username = clean;
  socket.join("viewers");

  broadcast();
  socket.emit("notice", "Đã gửi yêu cầu! Vui lòng chờ chủ LIVE duyệt.");
}

io.on("connection", socket => {
  socket.emit("state", publicState());

  socket.on("viewer:join", ({ username } = {}) => registerViewer(socket, username));
  socket.on("viewer:register", ({ username } = {}) => registerViewer(socket, username));

  socket.on("viewer:move", ({ index } = {}) => {
    const rejectMove = message => {
      socket.emit("viewer:move:rejected", message);
      socket.emit("notice", message);
      socket.emit("state", publicState());
    };

    if (!viewerIsActive(socket)) {
      return rejectMove("Bạn chưa được chọn làm đối thủ.");
    }

    const idx = Number(index);

    if (
      !Number.isInteger(idx) ||
      idx < 0 || idx >= 225 ||
      board[idx] !== null ||
      winner ||
      turn !== "O" ||
      !turnDeadline ||
      Date.now() >= turnDeadline
    ) {
      return rejectMove("Nước đi không hợp lệ. Bàn cờ đang được đồng bộ lại.");
    }

    board[idx] = "O";
    lastMoves.push(idx);
    lastMove = idx;

    if (checkWin(board, idx, "O")) {
      winner = "O";
      scores.viewers++;
      rematchRequest = null;
      stopTurnTimer();
    } else {
      turn = "X";
      startTurnTimer();
    }

    socket.emit("viewer:move:accepted", { index: idx });
    broadcast();
  });

  // Người xem yêu cầu đấu lại
  socket.on("viewer:rematch-request", () => {
    if (!viewerIsActive(socket) || !winner) {
      socket.emit("notice", "Bạn chỉ có thể yêu cầu đấu lại sau khi ván kết thúc.");
      return;
    }

    if (rematchRequest) {
      socket.emit("notice", "Đã có yêu cầu đấu lại đang chờ xác nhận.");
      return;
    }

    rematchRequest = "viewer";
    broadcast();
  });

  // Người xem xác nhận lời mời đấu lại của chủ LIVE
  socket.on("viewer:rematch-confirm", () => {
    if (!viewerIsActive(socket) || rematchRequest !== "host" || !winner) {
      socket.emit("notice", "Không có lời mời đấu lại hợp lệ.");
      return;
    }

    if (!beginRematch("viewer")) {
      socket.emit("notice", "Không thể bắt đầu ván đấu lại.");
    }
  });

  socket.on("disconnect", reason => {
    console.log("Socket disconnected:", socket.id, reason);
  });
});

process.on("uncaughtException", error => console.error("Uncaught exception:", error));
process.on("unhandledRejection", error => console.error("Unhandled rejection:", error));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Caro LIVE listening on :${PORT}`);
});
