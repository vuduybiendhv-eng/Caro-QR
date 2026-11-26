
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
const CHAT_LIMIT = 50;

// Chỉ cho phép đúng 7 emoji đã thống nhất.
const REACTION_EMOJIS = new Set([
  "😂",
  "👍",
  "❤️",
  "😱",
  "👏",
  "❌",
  "👋"
]);

const REACTION_COOLDOWN = 500;

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/play", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==================== GAME STATE ====================

let board = Array(225).fill(null);
let turn = "X";
let winner = null;
let activePlayer = null;

let queue = [];
let pendingQueue = [];

let scores = { host: 0, viewers: 0 };
let lastMoves = [];
let lastMove = null;
let rematchRequest = null;

let turnDeadline = null;
let lastBroadcastSecond = -1;
let roundId = 0;

let chatMessages = [];
const chatLastSent = new Map();

// Giới hạn tốc độ gửi emoji theo socket.
const reactionLastSent = new Map();

// ==================== TIMER ====================

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

// ==================== PUBLIC STATE ====================

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

    pendingQueue: [],

    scores: { ...scores },
    lastMoves: [...lastMoves],
    lastMove,

    rematchRequest,
    roundId
  };
}

function broadcast() {
  io.emit("state", publicState());
}

// ==================== GAME ====================

function startNewRound() {
  if (!activePlayer) return false;

  board = Array(225).fill(null);
  winner = null;

  lastMoves = [];
  lastMove = null;
  rematchRequest = null;

  chatMessages = [];
  roundId++;

  turn = Math.random() < 0.5 ? "X" : "O";

  startTurnTimer();
  broadcast();

  io.to("game-chat").emit("chat:history", chatMessages);

  return true;
}

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

function finishRound(mark) {
  winner = mark;
  stopTurnTimer();
  rematchRequest = null;

  if (mark === "X") scores.host++;
  if (mark === "O") scores.viewers++;

  broadcast();
}

// ==================== TIMER LOOP ====================

setInterval(() => {
  if (!turnDeadline || winner) return;

  const remaining = remainingSeconds();

  if (Date.now() >= turnDeadline) {
    const timedOutTurn = turn;
    const winningMark = timedOutTurn === "X" ? "O" : "X";

    finishRound(winningMark);

    console.log(
      `Hết giờ lượt ${timedOutTurn}. Người thắng: ${winningMark}`
    );

    return;
  }

  if (remaining !== lastBroadcastSecond) {
    lastBroadcastSecond = remaining;
    broadcast();
  }
}, 200);

// ==================== USERNAME ====================

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_.]/gu, "")
    .slice(0, 40);
}

function sameName(a, b) {
  return String(a || "").toLowerCase() ===
    String(b || "").toLowerCase();
}

function existsAnywhere(username) {
  return (
    queue.some(p => sameName(p.username, username)) ||
    (activePlayer && sameName(activePlayer, username))
  );
}

function viewerIsActive(socket) {
  return !!(
    socket.data.username &&
    activePlayer &&
    sameName(socket.data.username, activePlayer)
  );
}

// ==================== ADMIN AUTH ====================

function safeCompare(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  );
}

function authAdmin(req, res, next) {
  const pin = req.get("x-admin-pin") || req.body?.pin;

  if (
    !ADMIN_PIN ||
    ADMIN_PIN === "CHANGE_ME" ||
    !safeCompare(pin, ADMIN_PIN)
  ) {
    return res.status(401).json({
      error: "Admin PIN không hợp lệ hoặc chưa cấu hình."
    });
  }

  next();
}

// ==================== QUEUE ====================

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

function registerViewer(socket, username) {
  const clean = cleanUsername(username);

  if (!clean) {
    socket.emit("notice", "Vui lòng nhập tên TikTok.");
    return;
  }

  const key = clean.toLowerCase();

  // Người đang đấu kết nối lại.
  if (activePlayer && sameName(activePlayer, key)) {
    socket.data.username = clean;
    socket.join("viewers");

    if (!winner) {
      socket.join("game-chat");
      socket.emit("chat:history", chatMessages);
    }

    socket.emit("notice", "Bạn đang tham gia trận đấu!");
    socket.emit("state", publicState());
    return;
  }

  // Người đã có trong hàng chờ kết nối lại.
  const existing = queue.find(p => sameName(p.username, key));

  if (existing) {
    socket.data.username = existing.username;
    socket.join("viewers");

    socket.emit("notice", "Bạn đã ở trong phòng chờ!");
    socket.emit("state", publicState());
    return;
  }

  // Đăng ký trực tiếp vào hàng chờ.
  queue.push({
    username: clean,
    gift: "Đăng ký qua phòng QR",
    at: Date.now()
  });

  socket.data.username = clean;
  socket.join("viewers");

  broadcast();

  socket.emit(
    "notice",
    "Đã vào phòng chờ thành công! Vui lòng chờ đến lượt đấu."
  );
}

// ==================== REMATCH ====================

function beginRematch(agreedBy) {
  if (!winner || !activePlayer || !rematchRequest) {
    return false;
  }

  if (rematchRequest === agreedBy) {
    return false;
  }

  return startNewRound();
}

// ==================== CHAT ====================

function cleanChatMessage(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 300);
}

function sendChat(socket, value) {
  const isHost = socket.data.isHost === true;
  const isViewer = viewerIsActive(socket);

  if (!isHost && !isViewer) {
    socket.emit("chat:error", "Chỉ hai người đang đấu mới được chat.");
    return;
  }

  if (!activePlayer) {
    socket.emit("chat:error", "Hiện chưa có trận đấu.");
    return;
  }

  const message = cleanChatMessage(value);

  if (!message) return;

  const now = Date.now();
  const lastSent = chatLastSent.get(socket.id) || 0;

  if (now - lastSent < 800) {
    socket.emit("chat:error", "Bạn gửi tin nhắn quá nhanh.");
    return;
  }

  chatLastSent.set(socket.id, now);

  const item = {
    id: crypto.randomUUID(),
    sender: isHost ? "host" : "viewer",
    username: isHost ? HOST_TIKTOK : activePlayer,
    message,
    at: now
  };

  chatMessages.push(item);

  if (chatMessages.length > CHAT_LIMIT) {
    chatMessages.shift();
  }

  io.to("game-chat").emit("chat:message", item);
}

// ==================== EMOJI REACTIONS ====================

function sendReaction(socket, data = {}) {
  // Chặn payload null hoặc dữ liệu không phải object.
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return;
  }

  const isHost = socket.data.isHost === true;
  const isViewer = viewerIsActive(socket);

  // Chỉ HOST đã xác thực hoặc VIEWER đang đấu được gửi.
  if (!isHost && !isViewer) return;

  // Không gửi emoji khi chưa có trận hoặc ván đã kết thúc.
  if (!activePlayer || winner) return;

  const emoji = String(data.emoji || "");

  // Chỉ chấp nhận đúng 7 emoji.
  if (!REACTION_EMOJIS.has(emoji)) return;

  const now = Date.now();
  const lastSent = reactionLastSent.get(socket.id) || 0;

  // Mỗi socket chỉ được gửi một emoji sau mỗi 500ms.
  if (now - lastSent < REACTION_COOLDOWN) return;

  reactionLastSent.set(socket.id, now);

  const rawX = Number(data.x);
  const rawY = Number(data.y);

  const x = Number.isFinite(rawX)
    ? Math.max(10, Math.min(90, rawX))
    : 50;

  const y = Number.isFinite(rawY)
    ? Math.max(10, Math.min(90, rawY))
    : 50;

  // Chỉ phát tới HOST và VIEWER trong phòng trận đấu.
  // Không thêm emoji vào chatMessages.
  io.to("game-chat").emit("reaction:show", {
    emoji,
    x,
    y
  });
}

// ==================== API ====================

app.get("/api/config", (_req, res) => {
  res.json({
    roomName: ROOM_NAME,
    host: HOST_TIKTOK
  });
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

// ==================== GIFT WEBHOOK ====================

app.post("/api/gifts", (req, res) => {
  const token = req.get("x-gift-token");

  if (
    !GIFT_TOKEN ||
    GIFT_TOKEN === "CHANGE_ME" ||
    !safeCompare(token, GIFT_TOKEN)
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

// ==================== ADMIN API ====================

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

app.post("/api/admin/approve-player", authAdmin, (_req, res) => {
  res.status(410).json({
    error: "Đã bỏ bước phê duyệt. Người xem tự động vào hàng chờ."
  });
});

app.post("/api/admin/reject-player", authAdmin, (_req, res) => {
  res.status(410).json({
    error: "Đã bỏ danh sách chờ duyệt."
  });
});

// Host chọn người chơi tiếp theo.
app.post("/api/admin/select", authAdmin, (req, res) => {
  const username = cleanUsername(req.body.username);

  if (activePlayer) {
    return res.status(409).json({
      error: "Đang có người chơi trong ván."
    });
  }

  const found = queue.find(p => sameName(p.username, username));

  if (!found) {
    return res.status(404).json({
      error: "Không tìm thấy người chơi trong hàng chờ."
    });
  }

  activePlayer = found.username;
  queue = queue.filter(p => p !== found);

  // Đưa socket của người chơi được chọn vào phòng chat.
  for (const client of io.sockets.sockets.values()) {
    if (
      client.data.username &&
      sameName(client.data.username, activePlayer)
    ) {
      client.join("game-chat");
      client.emit("chat:history", chatMessages);
      client.emit("notice", "Bạn đã được chọn vào trận đấu!");
    }
  }

  startNewRound();

  res.json({ ok: true });
});

// Host đánh quân X.
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
    finishRound("X");
  } else if (board.every(cell => cell !== null)) {
    winner = "D";
    stopTurnTimer();
    broadcast();
  } else {
    turn = "O";
    startTurnTimer();
    broadcast();
  }

  res.json({ ok: true });
});

// Host yêu cầu tái đấu.
app.post("/api/admin/rematch-request", authAdmin, (_req, res) => {
  if (!winner || winner === "D" || !activePlayer) {
    return res.status(400).json({
      error: "Chỉ có thể yêu cầu tái đấu sau khi ván kết thúc."
    });
  }

  if (rematchRequest) {
    return res.status(409).json({
      error: "Đã có yêu cầu tái đấu đang chờ xác nhận."
    });
  }

  rematchRequest = "host";
  broadcast();

  res.json({ ok: true });
});

// Host xác nhận yêu cầu tái đấu của người xem.
app.post("/api/admin/rematch-confirm", authAdmin, (_req, res) => {
  if (rematchRequest !== "viewer" || !winner) {
    return res.status(400).json({
      error: "Không có yêu cầu tái đấu từ người xem."
    });
  }

  if (!beginRematch("host")) {
    return res.status(400).json({
      error: "Không thể bắt đầu ván tái đấu."
    });
  }

  res.json({ ok: true });
});

// Host chuyển sang người chơi tiếp theo.
app.post("/api/admin/next", authAdmin, (_req, res) => {
  // Đưa người chơi cũ ra khỏi phòng chat.
  for (const client of io.sockets.sockets.values()) {
    if (
      client.data.username &&
      activePlayer &&
      sameName(client.data.username, activePlayer)
    ) {
      client.leave("game-chat");
    }
  }

  activePlayer = null;

  board = Array(225).fill(null);
  turn = "X";
  winner = null;

  lastMoves = [];
  lastMove = null;
  rematchRequest = null;

  stopTurnTimer();

  chatMessages = [];
  io.to("game-chat").emit("chat:history", []);

  roundId++;

  broadcast();

  res.json({ ok: true });
});

// Reset điểm số.
app.post("/api/admin/reset-score", authAdmin, (_req, res) => {
  scores = {
    host: 0,
    viewers: 0
  };

  broadcast();

  res.json({ ok: true });
});

// ==================== SOCKET.IO ====================

io.on("connection", socket => {
  socket.emit("state", publicState());

  // Host đăng nhập Socket.IO để sử dụng chat và emoji.
  socket.on("host:authenticate", ({ pin } = {}) => {
    if (
      !ADMIN_PIN ||
      ADMIN_PIN === "CHANGE_ME" ||
      !safeCompare(pin, ADMIN_PIN)
    ) {
      socket.emit(
        "host:auth-failed",
        "Mã PIN quản trị không hợp lệ."
      );
      return;
    }

    socket.data.isHost = true;
    socket.join("game-chat");

    socket.emit("host:authenticated");
    socket.emit("chat:history", chatMessages);
  });

  // Người xem đăng ký vào phòng.
  socket.on("viewer:join", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  socket.on("viewer:register", ({ username } = {}) => {
    registerViewer(socket, username);
  });

  // Người xem đánh quân O.
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
      return rejectMove(
        "Nước đi không hợp lệ. Bàn cờ đang được đồng bộ lại."
      );
    }

    board[idx] = "O";
    lastMoves.push(idx);
    lastMove = idx;

    if (checkWin(board, idx, "O")) {
      finishRound("O");
    } else if (board.every(cell => cell !== null)) {
      winner = "D";
      stopTurnTimer();
      broadcast();
    } else {
      turn = "X";
      startTurnTimer();
      broadcast();
    }

    socket.emit("viewer:move:accepted", {
      index: idx,
      roundId
    });
  });

  // Người xem yêu cầu tái đấu.
  socket.on("viewer:rematch-request", () => {
    if (!viewerIsActive(socket) || !winner || winner === "D") {
      socket.emit(
        "notice",
        "Bạn chỉ có thể yêu cầu tái đấu sau khi ván kết thúc."
      );
      return;
    }

    if (rematchRequest) {
      socket.emit(
        "notice",
        "Đã có yêu cầu tái đấu đang chờ xác nhận."
      );
      return;
    }

    rematchRequest = "viewer";
    broadcast();
  });

  // Người xem xác nhận lời mời tái đấu từ Host.
  socket.on("viewer:rematch-confirm", () => {
    if (
      !viewerIsActive(socket) ||
      rematchRequest !== "host" ||
      !winner
    ) {
      socket.emit("notice", "Không có lời mời tái đấu hợp lệ.");
      return;
    }

    if (!beginRematch("viewer")) {
      socket.emit("notice", "Không thể bắt đầu ván tái đấu.");
    }
  });

  // Chat giữa Host và người đang đấu.
  // Hỗ trợ cả chuỗi và object { message }.
  socket.on("chat:send", value => {
    const message =
      typeof value === "object" && value !== null
        ? value.message
        : value;

    sendChat(socket, message);
  });

  // Emoji bay trên bàn cờ, không đi vào chat.
  socket.on("reaction:send", data => {
    sendReaction(socket, data);
  });

  socket.on("disconnect", reason => {
    chatLastSent.delete(socket.id);
    reactionLastSent.delete(socket.id);

    console.log(
      "Socket disconnected:",
      socket.id,
      reason
    );
  });
});

// ==================== ERROR HANDLING ====================

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error);
});

// ==================== START SERVER ====================

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Caro LIVE listening on :${PORT}`);
});
