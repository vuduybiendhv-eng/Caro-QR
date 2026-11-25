
const socket = io();

const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");
const statusEl = document.getElementById("status");
const soundButton = document.getElementById("soundToggle");

const joinSection = document.querySelector(".caro-layout > .join");
const joinButton = document.getElementById("join");
const usernameInput = document.getElementById("username");

let state = null;
let username = "";
let registered = false;
let firstState = true;
let serverClockOffset = 0;

let pendingMoveIndex = null;
let moveRequestTimeout = null;

// KHOI PHUC TEN NGUOI CHOI DA LUU
try {
  username = localStorage.getItem("caroUsername") || "";

  if (usernameInput && username) {
    usernameInput.value = username;
  }
} catch (error) {
  console.warn("Khong doc duoc ten da luu:", error);
}

// XOA TRANG THAI CHO NUOC DI
function clearPendingMove() {
  pendingMoveIndex = null;

  if (moveRequestTimeout) {
    clearTimeout(moveRequestTimeout);
    moveRequestTimeout = null;
  }
}

// HIEU UNG AN TOAN
function playEffect(name, message) {
  try {
    const effects = window.CaroEffects;

    if (effects && typeof effects[name] === "function") {
      effects[name](message);
    }
  } catch (error) {
    console.warn("Khong chay duoc hieu ung:", name, error);
  }
}

// AM THANH AN TOAN
function playSound(name) {
  try {
    const sound = window.CaroSound;

    if (sound && typeof sound[name] === "function") {
      sound[name]();
    }
  } catch (error) {
    console.warn("Khong chay duoc am thanh:", name, error);
  }
}

// CAP NHAT NUT BAT / TAT AM THANH
function updateSoundButton() {
  if (!soundButton || !window.CaroSound) return;

  const enabled = window.CaroSound.isEnabled();

  soundButton.textContent = enabled
    ? "🔊 Tắt âm thanh"
    : "🔇 Bật âm thanh";

  soundButton.classList.toggle("off", !enabled);
}

// NUT BAT / TAT AM THANH
if (soundButton) {
  soundButton.onclick = () => {
    if (!window.CaroSound) {
      if (notice) {
        notice.textContent = "Không tìm thấy file sound.js!";
      }
      return;
    }

    const enabled = window.CaroSound.toggle();

    updateSoundButton();

    // PHAT THU MOT TIENG KHI BAT
    if (enabled) {
      playSound("move");
    }
  };
}

updateSoundButton();

// DONG HO CAT DEM NGUOC
function renderTimer() {
  const panel = document.getElementById("timerPanel");
  const owner = document.getElementById("timerOwner");
  const number = document.getElementById("timerNumber");
  const message = document.getElementById("timerMessage");
  const topSand = document.getElementById("topSand");
  const bottomSand = document.getElementById("bottomSand");
  const stream = document.getElementById("sandStream");

  if (!panel || !number || !state) return;

  const s = state;
  const deadline = Number(s.turnDeadline);

  panel.classList.remove(
    "timer-host",
    "timer-viewer",
    "timer-idle",
    "timer-warning",
    "timer-finished"
  );

  if (s.winner || !Number.isFinite(deadline) || deadline <= 0) {
    panel.classList.add("timer-idle");

    if (s.winner) {
      if (owner) owner.textContent = "🏁 VÁN ĐẤU ĐÃ KẾT THÚC";

      number.textContent = "0";

      if (message) {
        message.textContent =
          s.winner === "O"
            ? "Bạn đã chiến thắng!"
            : "Chủ LIVE chiến thắng!";
      }
    } else {
      if (owner) owner.textContent = "⏳ ĐANG CHỜ LƯỢT CHƠI";

      number.textContent = "30";

      if (message) {
        message.textContent = "Chờ bắt đầu trận đấu";
      }
    }

    if (topSand) topSand.style.transform = "scaleY(1)";
    if (bottomSand) bottomSand.style.transform = "scaleY(0.05)";
    if (stream) stream.style.opacity = "0";

    return;
  }

  const isViewerTurn = s.turn === "O";

  panel.classList.add(
    isViewerTurn ? "timer-viewer" : "timer-host"
  );

  if (owner) {
    owner.textContent = isViewerTurn
      ? `⭕ LƯỢT CỦA BẠN · @${s.activePlayer || username || "NGƯỜI CHƠI"}`
      : "❌ LƯỢT CHỦ LIVE (X)";
  }

  const serverNow = Date.now() + serverClockOffset;
  const remainingMs = Math.max(0, deadline - serverNow);
  const seconds = Math.ceil(remainingMs / 1000);
  const totalTime = (Number(s.turnTime) || 30) * 1000;
  const progress = Math.max(0, Math.min(1, remainingMs / totalTime));

  number.textContent = String(seconds);

  if (message) {
    if (seconds <= 5) {
      message.textContent = "⚠️ Nhanh tay! Sắp hết giờ!";
    } else if (isViewerTurn) {
      message.textContent =
        s.activePlayer &&
        username &&
        s.activePlayer.toLowerCase() === username.toLowerCase()
          ? "Đến lượt bạn đánh quân O"
          : `Đang chờ @${s.activePlayer || "người chơi"} đánh`;
    } else {
      message.textContent = "Chủ LIVE đang có lượt đánh";
    }
  }

  if (seconds <= 5) panel.classList.add("timer-warning");
  if (seconds <= 0) panel.classList.add("timer-finished");

  if (topSand) {
    topSand.style.transform = `scaleY(${progress})`;
  }

  if (bottomSand) {
    bottomSand.style.transform = `scaleY(${1 - progress})`;
  }

  if (stream) {
    stream.style.opacity = seconds > 0 ? "1" : "0";
  }
}

// DONG KHUNG NHAP TEN
function closeRegistration(message) {
  registered = true;

  if (joinSection) {
    joinSection.classList.add("registration-done");

    const label = joinSection.querySelector("label");
    const row = joinSection.querySelector(".joinrow");
    const description = joinSection.querySelector("p");

    if (label) label.style.display = "none";
    if (row) row.style.display = "none";
    if (description) description.style.display = "none";
  }

  if (joinButton) {
    joinButton.disabled = true;
  }

  if (notice) {
    notice.textContent = message;
    notice.style.display = "block";
  }
}

// KIEM TRA TRANG THAI DANG KY
function updateRegistration(s) {
  if (!username || !s) return;

  const key = username.toLowerCase();

  const pending = Array.isArray(s.pendingQueue) &&
    s.pendingQueue.some(
      p => String(p.username).toLowerCase() === key
    );

  const approved = Array.isArray(s.queue) &&
    s.queue.some(
      p => String(p.username).toLowerCase() === key
    );

  const playing = s.activePlayer &&
    s.activePlayer.toLowerCase() === key;

  if (pending) {
    closeRegistration("📨 Đã gửi yêu cầu! Vui lòng chờ chủ LIVE duyệt.");
  } else if (playing) {
    closeRegistration("🎮 Bạn đang tham gia trận đấu!");
  } else if (approved) {
    closeRegistration("✅ Bạn đã được duyệt! Hãy chờ chủ LIVE chọn đấu.");
  }
}

// KIEM TRA NUOC DI VA KET QUA
function checkGameEffects(previous, current) {
  if (!previous || !current) return;

  const oldCount = previous.board.filter(Boolean).length;
  const newCount = current.board.filter(Boolean).length;

  // CO QUAN MOI
  if (newCount > oldCount) {
    playSound("move");
    playEffect("move");
  }

  // KET THUC VAN
  if (!previous.winner && current.winner) {
    if (current.winner === "O") {
      // NGUOI XEM THANG
      playSound("win");
      playEffect("win", "BẠN CHIẾN THẮNG!");
    } else {
      // CHU LIVE THANG - NGUOI XEM THUA
      playSound("defeat");
      playEffect("defeat", "BẠN THUA CUỘC!");
    }
  }
}

// GUI NUOC DI
function sendViewerMove(index) {
  if (!socket.connected) {
    if (notice) {
      notice.textContent = "Mất kết nối máy chủ. Đang thử kết nối lại...";
    }
    return;
  }

  if (pendingMoveIndex !== null) return;

  if (
    !state ||
    state.winner ||
    state.turn !== "O" ||
    !state.activePlayer ||
    !username ||
    state.activePlayer.toLowerCase() !== username.toLowerCase() ||
    state.board[index] !== null
  ) {
    return;
  }

  pendingMoveIndex = index;

  // KHOA CAC O TRONG KHI CHO MAY CHU
  if (boardEl) {
    boardEl.querySelectorAll(".cell").forEach(cell => {
      cell.disabled = true;
    });
  }

  socket.emit("viewer:move", { index });

  // CHO TOI DA 5 GIAY
  moveRequestTimeout = setTimeout(() => {
    clearPendingMove();

    if (state) render(state);

    if (notice) {
      notice.textContent =
        "Chưa nhận được xác nhận từ máy chủ. Hãy kiểm tra kết nối rồi thử lại.";
    }
  }, 5000);
}

// CAP NHAT GIAO DIEN
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  if (!firstState) {
    checkGameEffects(state, s);
  }

  firstState = false;
  state = s;

  if (Number.isFinite(Number(s.serverTime))) {
    serverClockOffset = Number(s.serverTime) - Date.now();
  }

  // NEU MAY CHU DA GHI NHAN NUOC DI
  if (
    pendingMoveIndex !== null &&
    s.board[pendingMoveIndex] !== null
  ) {
    clearPendingMove();
  }

  // TEN PHONG
  const roomEl = document.getElementById("room");

  if (roomEl) {
    roomEl.textContent = `${s.roomName || "Caro Live"} · 15×15`;
  }

  // TEN VA DIEM
  const hostEl = document.getElementById("host");
  const hostScoreEl = document.getElementById("hostScore");
  const viewerScoreEl = document.getElementById("viewerScore");
  const opponentEl = document.getElementById("opponent");

  if (hostEl) hostEl.textContent = s.host || "@mbbb1118";
  if (hostScoreEl) hostScoreEl.textContent = s.scores?.host ?? 0;
  if (viewerScoreEl) viewerScoreEl.textContent = s.scores?.viewers ?? 0;
  if (opponentEl) opponentEl.textContent = s.activePlayer || "Chưa chọn";

  // TRANG THAI LUOT CHOI
  if (statusEl) {
    if (s.winner) {
      statusEl.textContent = s.winner === "X"
        ? "🏆 CHỦ LIVE THẮNG!"
        : `🏆 ${s.activePlayer || "NGƯỜI CHƠI"} CHIẾN THẮNG!`;
    } else {
      statusEl.textContent = s.turn === "O"
        ? `Đến lượt ${s.activePlayer || "người xem"} (quân O)`
        : "Đến lượt chủ LIVE (quân X)";
    }
  }

  updateRegistration(s);
  renderTimer();

  if (!boardEl) return;

  // VE LAI BAN CO
  boardEl.innerHTML = "";

  s.board.forEach((value, index) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";

    if (value === "X") {
      cell.classList.add("X", "piece-x");
    }

    if (value === "O") {
      cell.classList.add("O", "piece-o");
    }

    if (value) {
      const stone = document.createElement("span");

      stone.className = "stone";
      stone.setAttribute("aria-hidden", "true");

      cell.appendChild(stone);

      cell.setAttribute(
        "aria-label",
        value === "X"
          ? "Quân đỏ của chủ LIVE"
          : "Quân đen của người chơi"
      );
    } else {
      cell.setAttribute("aria-label", `Ô cờ ${index + 1}`);
    }

    const isMyTurn =
      s.turn === "O" &&
      !!s.activePlayer &&
      !!username &&
      s.activePlayer.toLowerCase() === username.toLowerCase();

    cell.disabled =
      !!value ||
      !!s.winner ||
      !isMyTurn ||
      pendingMoveIndex !== null;

    cell.addEventListener("click", () => {
      if (cell.disabled) return;
      sendViewerMove(index);
    });

    boardEl.appendChild(cell);
  });
}

// CAP NHAT DONG HO MOI 200 MILI GIAY
setInterval(() => {
  if (state) renderTimer();
}, 200);

// NHAN TRANG THAI
socket.on("state", render);

// MAY CHU XAC NHAN NUOC DI
socket.on("viewer:move:accepted", () => {
  clearPendingMove();
});

// MAY CHU TU CHOI NUOC DI
socket.on("viewer:move:rejected", message => {
  clearPendingMove();

  if (notice) {
    notice.textContent = message || "Nước đi chưa được chấp nhận.";
  }

  if (state) render(state);
});

// THONG BAO TU MAY CHU
socket.on("notice", message => {
  if (!notice) return;

  notice.textContent = message;

  if (
    message.includes("Đã gửi yêu cầu") ||
    message.includes("Yêu cầu đã gửi") ||
    message.includes("đã được duyệt") ||
    message.includes("đang tham gia")
  ) {
    closeRegistration(message);
  } else if (
    message.includes("Vui lòng nhập") ||
    message.includes("Tên này")
  ) {
    if (joinButton) {
      joinButton.disabled = false;
      joinButton.textContent = "Vào phòng";
    }
  }
});

// KET NOI LAI
socket.on("connect", () => {
  clearPendingMove();

  if (statusEl && !state) {
    statusEl.textContent = "Đã kết nối máy chủ, đang tải bàn cờ…";
  }

  if (username) {
    socket.emit("viewer:register", { username });
  }
});

// MAT KET NOI
socket.on("disconnect", () => {
  clearPendingMove();

  if (statusEl) {
    statusEl.textContent = "Mất kết nối. Đang kết nối lại…";
  }

  if (boardEl) {
    boardEl.querySelectorAll(".cell").forEach(cell => {
      cell.disabled = true;
    });
  }
});

socket.on("connect_error", () => {
  if (statusEl) {
    statusEl.textContent = "Không kết nối được máy chủ!";
  }
});

// DANG KY NGUOI CHOI
if (joinButton) {
  joinButton.onclick = () => {
    if (registered) return;

    username = usernameInput
      ? usernameInput.value.trim().replace(/^@+/, "")
      : "";

    if (!username) {
      if (notice) {
        notice.textContent = "Bạn hãy nhập tên TikTok trước nhé.";
      }
      return;
    }

    try {
      localStorage.setItem("caroUsername", username);
    } catch (error) {
      console.warn("Khong luu duoc ten:", error);
    }

    joinButton.disabled = true;
    joinButton.textContent = "Đang gửi…";

    if (!socket.connected) {
      joinButton.disabled = false;
      joinButton.textContent = "Vào phòng";

      if (notice) {
        notice.textContent = "Chưa kết nối được máy chủ. Hãy thử lại.";
      }

      return;
    }

    socket.emit("viewer:register", { username });
  };
}
