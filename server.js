
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

// TRANG CHOI
app.get("/play", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================================
// TRANG THAI TRO CHOI
// =========================================

let board = Array(225).fill(null);
let turn = "X";
let winner = null;
let activePlayer = null;

let queue = [];
let pendingQueue = [];

let scores = {
  host: 0,
  viewers: 0
};

let lastMoves = [];

// =========================================
// DONG HO LUOT CHOI
// =========================================

let turnDeadline = null;
let lastBroadcastSecond = -1;

function remainingSeconds() {
  if (!turnDeadline || winner) return 0;

  return Math.max(
    0,
    Math.ceil((turnDeadline - Date.now()) / 1000)
  );
}

function startTurnTimer() {
  turnDeadline = Date.now() + TURN_TIME * 1000;
  lastBroadcastSecond = -1;
}

function stopTurnTimer() {
  turnDeadline = null;
  lastBroadcastSecond = -1;
}

// =========================================
// TRANG THAI CONG KHAI
// =========================================

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

    queue: queue.map(({ username, gift, at }) => ({
      username,
      gift,
      at
    })),

    pendingQueue: pendingQueue.map(({ username, at }) => ({
      username,
      at
    })),

    scores: { ...scores },
    lastMoves: [...lastMoves]
  };
}

// =========================================
// PHAT TRANG THAI
// =========================================

function broadcast() {
  io.emit("state", publicState());
}

// =========================================
// DONG HO MAY CHU
// =========================================

setInterval(() => {
  if (!turnDeadline || winner) return;

  const remaining = remainingSeconds();

  if (Date.now() >= turnDeadline) {
    const timedOutTurn = turn;

    winner = timedOutTurn === "X" ? "O" : "X";

    if (timedOutTurn === "X") {
      scores.viewers++;
    } else {
      scores.host++;
    }

    stopTurnTimer();
    broadcast();

    console.log(
      `Het gio luot ${timedOutTurn}. Nguoi thang: ${winner}`
    );

    return;
  }

  if (remaining !== lastBroadcastSecond) {
    lastBroadcastSecond = remaining;
    broadcast();
  }
}, 200);

// =========================================
// LAM SACH TEN TIKTOK
// =========================================

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .slice(0, 40);
}

// =========================================
// KIEM TRA TEN DA DUOC SU DUNG
// =========================================

function existsAnywhere(username) {
  const key = username.toLowerCase();

  return (
    pendingQueue.some(p => p.username.toLowerCase() === key) ||
    queue.some(p => p.username.toLowerCase() === key) ||
    (
      activePlayer &&
      activePlayer.toLowerCase() === key
    )
  );
}

// =========================================
// KIEM TRA THANG
// =========================================

function checkWin(b, idx, mark) {
  const r = Math.floor(idx / 15);
  const c = idx % 15;

  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ]) {
    let count = 1;

    for (const sign of [-1, 1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;

      while (
        rr >= 0 &&
        rr < 15 &&
        cc >= 0 &&
        cc < 15 &&
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

// =========================================
// KIEM TRA ADMIN PIN
// =========================================

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

// =========================================
// THEM NGUOI TANG QUA DA XAC NHAN
// =========================================

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

// =========================================
// CAU HINH PHONG
// =========================================

app.get("/api/config", (_req, res) => {
  res.json({
    roomName: ROOM_NAME,
    host: HOST_TIKTOK
  });
});

// =========================================
// LAY TRANG THAI
// =========================================

app.get("/api/state", (_req, res) => {
  res.json(publicState());
});

// =========================================
// TAO MA QR
// =========================================

app.get("/api/qr", async (req, res) => {
  const base =
    BASE_URL ||
    `${req.protocol}://${req.get("host")}`;

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

// =========================================
// NHAN SU KIEN QUA TANG DA XAC MINH
// =========================================

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
    return res.status(401).json({
      error: "Invalid gift bridge token"
    });
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

// =========================================
// CHU LIVE THEM NGUOI CHOI THU CONG
// =========================================

app.post("/api/admin/add-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  const giftName = String(
    req.body.giftName || "Quà TikTok đã xác nhận"
  ).slice(0, 80);

  if (!username) {
    return res.status(400).json({
      error: "Nhập tên TikTok người chơi."
    });
  }

  if (!existsAnywhere(username)) {
    queue.push({
      username,
      gift: giftName,
      at: Date.now()
    });
  }

  broadcast();

  res.json({ ok: true });
});

// =========================================
// CHU LIVE DUYET DANG KY
// =========================================

app.post("/api/admin/approve-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  const found = pendingQueue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({
      error: "Không tìm thấy yêu cầu đăng ký."
    });
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

// =========================================
// CHU LIVE TU CHOI DANG KY
// =========================================

app.post("/api/admin/reject-player", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  const found = pendingQueue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({
      error: "Không tìm thấy yêu cầu đăng ký."
    });
  }

  pendingQueue = pendingQueue.filter(p => p !== found);

  broadcast();

  res.json({ ok: true });
});

// =========================================
// CHU LIVE CHON NGUOI DA DUOC DUYET
// =========================================

app.post("/api/admin/select", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  if (activePlayer) {
    return res.status(409).json({
      error: "Đang có người chơi trong ván."
    });
  }

  const found = queue.find(
    p => p.username.toLowerCase() === username.toLowerCase()
  );

  if (!found) {
    return res.status(404).json({
      error: "Không tìm thấy người chơi trong hàng chờ."
    });
  }

  activePlayer = found.username;
  queue = queue.filter(p => p !== found);

  board = Array(225).fill(null);
  turn = "X";
  winner = null;
  lastMoves = [];

  startTurnTimer();
  broadcast();

  res.json({ ok: true });
});

// =========================================
// CHU LIVE DANH QUAN X
// =========================================

app.post("/api/admin/move", authAdmin, (req, res) => {
  const idx = Number(req.body.index);

  if (
    !Number.isInteger(idx) ||
    idx < 0 ||
    idx >= 225 ||
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

  if (checkWin(board, idx, "X")) {
    winner = "X";
    scores.host++;
    stopTurnTimer();
  } else {
    turn = "O";
    startTurnTimer();
  }

  broadcast();

  res.json({ ok: true });
});

// =========================================
// KET THUC VAN / VAN MOI
// =========================================

app.post("/api/admin/next", authAdmin, (_req, res) => {
  activePlayer = null;
  board = Array(225).fill(null);
  turn = "X";
  winner = null;
  lastMoves = [];

  stopTurnTimer();
  broadcast();

  res.json({ ok: true });
});

// =========================================
// RESET DIEM
// =========================================

app.post("/api/admin/reset-score", authAdmin, (_req, res) => {
  scores = {
    host: 0,
    viewers: 0
  };

  broadcast();

  res.json({ ok: true });
});

// =========================================
// NGUOI XEM TU DANG KY
// =========================================

function registerViewer(socket, username) {
  const clean = cleanUsername(username);

  if (!clean) {
    socket.emit("notice", "Vui lòng nhập tên TikTok.");
    return;
  }

  const key = clean.toLowerCase();

  const pending = pendingQueue.some(
    p => p.username.toLowerCase() === key
  );

  const approved = queue.some(
    p => p.username.toLowerCase() === key
  );

  const playing =
    activePlayer &&
    activePlayer.toLowerCase() === key;

  // CHO PHEP SOCKET MOI KHOI PHUC NGUOI CHOI CU
  if (pending || approved || playing) {
    socket.data.username = clean;
    socket.join("viewers");

    if (pending) {
      socket.emit(
        "notice",
        "Yêu cầu đã gửi. Vui lòng chờ chủ LIVE duyệt."
      );
    } else if (playing) {
      socket.emit(
        "notice",
        "Bạn đang tham gia trận đấu!"
      );
    } else {
      socket.emit(
        "notice",
        "Bạn đã được duyệt. Hãy chờ chủ LIVE chọn đấu."
      );
    }

    socket.emit("state", publicState());
    return;
  }

  if (existsAnywhere(clean)) {
    socket.emit("notice", "Tên này hiện đã được sử dụng.");
    return;
  }

  pendingQueue.push({
    username: clean,
    at: Date.now()
  });

  socket.data.username = clean;
  socket.join("viewers");

  broadcast();

  socket.emit(
    "notice",
    "Đã gửi yêu cầu! Vui lòng chờ chủ LIVE duyệt."
  );
}

// =========================================
// KET NOI NGUOI CHOI
// =========================================

io.on("connection", socket => {
  console.log("Socket connected:", socket.id);

  socket.emit("state", publicState());

  socket.on("viewer:join", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  socket.on("viewer:register", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  // =======================================
  // NGUOI XEM DANH QUAN O
  // =======================================

  socket.on("viewer:move", ({ index } = {}) => {
    const username = socket.data.username;

    const rejectMove = message => {
      socket.emit("viewer:move:rejected", message);
      socket.emit("notice", message);
      socket.emit("state", publicState());
    };

    if (
      !username ||
      !activePlayer ||
      username.toLowerCase() !== activePlayer.toLowerCase()
    ) {
      return rejectMove(
        "Bạn chưa được chọn làm đối thủ."
      );
    }

    const idx = Number(index);

    if (
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= 225 ||
      board[idx] !== null ||
      winner ||
      turn !== "O" ||
      !turnDeadline ||
      Date.now() >= turnDeadline
    ) {
      return rejectMove(
        "Nước đi không hợp lệ. Bàn cờ đang được đồng bộ lại."
      );
    }

    // GHI NHAN NUOC DI
    board[idx] = "O";
    lastMoves.push(idx);

    if (checkWin(board, idx, "O")) {
      winner = "O";
      scores.viewers++;
      stopTurnTimer();
    } else {
      turn = "X";
      startTurnTimer();
    }

    // XAC NHAN CHO DUNG SOCKET NGUOI CHOI
    socket.emit("viewer:move:accepted", {
      index: idx
    });

    broadcast();
  });

  socket.on("disconnect", reason => {
    console.log("Socket disconnected:", socket.id, reason);
  });
});

// =========================================
// XU LY LOI MAY CHU
// =========================================

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error);
});

// =========================================
// KHOI DONG
// =========================================

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Caro LIVE listening on :${PORT}`);
});
