
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
  cors: { origin: false }
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

// TRẠNG THÁI TRÒ CHƠI
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

// THỜI GIAN LƯỢT
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

// TẠO TRẠNG THÁI CÔNG KHAI
function publicState() {
  return {
    roomName: ROOM_NAME,
    host: HOST_TIKTOK,
    board,
    turn,
    winner,
    activePlayer,

    turnTime: TURN_TIME,
    remainingSeconds: remainingSeconds(),
    turnDeadline,

    queue: queue.map(({ username, gift, at }) => ({
      username,
      gift,
      at
    })),

    pendingQueue: pendingQueue.map(({ username, at }) => ({
      username,
      at
    })),

    scores,
    lastMoves
  };
}

// GỬI TRẠNG THÁI ĐẾN HAI ĐIỆN THOẠI
function broadcast() {
  io.emit("state", publicState());
}

// ĐỒNG HỒ MÁY CHỦ
setInterval(() => {
  if (!turnDeadline || winner) return;

  const remaining = remainingSeconds();

  // HẾT 30 GIÂY: TỰ ĐỘNG THUA
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
      `Hết giờ lượt ${timedOutTurn}. Người thắng: ${winner}`
    );

    return;
  }

  // CẬP NHẬT ĐỒNG HỒ MỖI GIÂY
  if (remaining !== lastBroadcastSecond) {
    lastBroadcastSecond = remaining;
    broadcast();
  }
}, 200);

// LÀM SẠCH TÊN TIKTOK
function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .slice(0, 40);
}

// KIỂM TRA TÊN ĐÃ ĐƯỢC SỬ DỤNG CHƯA
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

// KIỂM TRA THẮNG
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

// KIỂM TRA ADMIN PIN
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

// THÊM NGƯỜI TẶNG QUÀ ĐÃ XÁC NHẬN
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

// CẤU HÌNH PHÒNG
app.get("/api/config", (_req, res) => {
  res.json({
    roomName: ROOM_NAME,
    host: HOST_TIKTOK
  });
});

// LẤY TRẠNG THÁI
app.get("/api/state", (_req, res) => {
  res.json(publicState());
});

// TẠO MÃ QR
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

// NHẬN SỰ KIỆN QUÀ TẶNG ĐÃ XÁC MINH
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

// CHỦ LIVE THÊM NGƯỜI CHƠI THỦ CÔNG
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

// CHỦ LIVE DUYỆT ĐĂNG KÝ
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

// CHỦ LIVE TỪ CHỐI ĐĂNG KÝ
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

// CHỦ LIVE CHỌN NGƯỜI ĐÃ ĐƯỢC DUYỆT
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

// CHỦ LIVE ĐÁNH QUÂN X
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

// KẾT THÚC VÁN / VÁN MỚI
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

// RESET ĐIỂM
app.post("/api/admin/reset-score", authAdmin, (_req, res) => {
  scores = {
    host: 0,
    viewers: 0
  };

  broadcast();

  res.json({ ok: true });
});

// NGƯỜI XEM TỰ ĐĂNG KÝ
function registerViewer(socket, username) {
  const clean = cleanUsername(username);

  if (!clean) {
    socket.emit("notice", "Vui lòng nhập tên TikTok.");
    return;
  }

  if (existsAnywhere(clean)) {
    const pending = pendingQueue.some(
      p => p.username.toLowerCase() === clean.toLowerCase()
    );

    const approved = queue.some(
      p => p.username.toLowerCase() === clean.toLowerCase()
    );

    if (pending) {
      socket.data.username = clean;
      socket.join("viewers");

      socket.emit(
        "notice",
        "Yêu cầu đã gửi. Vui lòng chờ chủ LIVE duyệt."
      );

      return;
    }

    if (
      approved ||
      (
        activePlayer &&
        activePlayer.toLowerCase() === clean.toLowerCase()
      )
    ) {
      socket.data.username = clean;
      socket.join("viewers");

      socket.emit(
        "notice",
        "Bạn đã được duyệt. Hãy chờ chủ LIVE chọn đấu."
      );

      return;
    }

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

// KẾT NỐI NGƯỜI CHƠI
io.on("connection", socket => {
  socket.emit("state", publicState());

  socket.on("viewer:join", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  socket.on("viewer:register", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  // NGƯỜI XEM ĐÁNH QUÂN O
  socket.on("viewer:move", ({ index } = {}) => {
    const username = socket.data.username;

    if (
      !username ||
      !activePlayer ||
      username.toLowerCase() !== activePlayer.toLowerCase()
    ) {
      return socket.emit(
        "notice",
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
      return socket.emit(
        "notice",
        "Chưa đến lượt bạn, đã hết giờ hoặc ô này không hợp lệ."
      );
    }

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

    broadcast();
  });
});

// KHỞI ĐỘNG MÁY CHỦ
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Caro LIVE listening on :${PORT}`);
});
