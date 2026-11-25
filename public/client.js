
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

// ÂM THANH
if (soundButton) {
  soundButton.onclick = () => {
    if (!window.CaroSound) return;

    const on = CaroSound.toggle();
    soundButton.textContent = on ? "🔊 Bật âm thanh" : "🔇 Tắt âm thanh";
    soundButton.classList.toggle("off", !on);
  };
}

// ĐÓNG KHUNG NHẬP TÊN
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

  if (notice) {
    notice.textContent = message;
    notice.style.display = "block";
  }
}

// KIỂM TRA TRẠNG THÁI ĐĂNG KÝ
function updateRegistration(s) {
  if (!username || !s) return;

  const key = username.toLowerCase();

  const pending = Array.isArray(s.pendingQueue) &&
    s.pendingQueue.some(p => String(p.username).toLowerCase() === key);

  const approved = Array.isArray(s.queue) &&
    s.queue.some(p => String(p.username).toLowerCase() === key);

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

// CẬP NHẬT GIAO DIỆN
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  if (state && !firstState) {
    const oldCount = state.board.filter(Boolean).length;
    const newCount = s.board.filter(Boolean).length;

    if (newCount > oldCount && window.CaroSound) {
      CaroSound.move();
      if (window.CaroEffects) CaroEffects.move();
    }

    if (!state.winner && s.winner && window.CaroSound) {
      CaroSound.win();

      if (window.CaroEffects) {
        if (s.winner === "O") {
          CaroEffects.win("BẠN CHIẾN THẮNG!");
        } else {
          CaroEffects.defeat("BẠN THUA CUỘC!");
        }
      }
    }
  }

  firstState = false;
  state = s;

  // TÊN PHÒNG
  const roomEl = document.getElementById("room");
  if (roomEl) {
    roomEl.textContent = `${s.roomName || "Caro Live"} · 15×15`;
  }

  // TÊN VÀ ĐIỂM
  const hostEl = document.getElementById("host");
  const hostScoreEl = document.getElementById("hostScore");
  const viewerScoreEl = document.getElementById("viewerScore");
  const opponentEl = document.getElementById("opponent");

  if (hostEl) hostEl.textContent = s.host || "@mbbb1118";
  if (hostScoreEl) hostScoreEl.textContent = s.scores?.host ?? 0;
  if (viewerScoreEl) viewerScoreEl.textContent = s.scores?.viewers ?? 0;
  if (opponentEl) opponentEl.textContent = s.activePlayer || "Chưa chọn";

  // TRẠNG THÁI LƯỢT CHƠI
  if (statusEl) {
    if (s.winner) {
      statusEl.textContent = s.winner === "X"
        ? "🏆 CHỦ LIVE THẮNG!"
        : `🏆 ${s.activePlayer || "NGƯỜI CHƠI"} CHIẾN THẮNG!`;
    } else {
      statusEl.textContent = s.turn === "O"
        ? `Đến lượt ${s.activePlayer || "người xem"} (quân xanh)`
        : "Đến lượt chủ LIVE (quân vàng)";
    }
  }

  updateRegistration(s);

  // VẼ BÀN CỜ VỚI QUÂN TRÒN
  if (!boardEl) return;

  boardEl.innerHTML = "";

  s.board.forEach((value, index) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";

    if (value === "X") cell.classList.add("X", "piece-x");
    if (value === "O") cell.classList.add("O", "piece-o");

    if (value) {
      const stone = document.createElement("span");
      stone.className = "stone";
      stone.setAttribute("aria-hidden", "true");
      cell.appendChild(stone);

      cell.classList.add("pop");
      cell.setAttribute(
        "aria-label",
        value === "X" ? "Quân vàng của chủ LIVE" : "Quân xanh của người chơi"
      );
    } else {
      cell.setAttribute("aria-label", `Ô cờ ${index + 1}`);
    }

    cell.disabled =
      !!value ||
      !!s.winner ||
      s.turn !== "O" ||
      !s.activePlayer;

    cell.addEventListener("click", () => {
      if (!cell.disabled) {
        socket.emit("viewer:move", { index });
      }
    });

    boardEl.appendChild(cell);
  });
}

// NHẬN TRẠNG THÁI
socket.on("state", render);

// THÔNG BÁO TỪ MÁY CHỦ
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

// KẾT NỐI
socket.on("connect", () => {
  if (statusEl && !state) {
    statusEl.textContent = "Đã kết nối máy chủ, đang tải bàn cờ…";
  }
});

socket.on("disconnect", () => {
  if (statusEl) {
    statusEl.textContent = "Mất kết nối. Đang kết nối lại…";
  }
});

socket.on("connect_error", () => {
  if (statusEl) {
    statusEl.textContent = "Không kết nối được máy chủ!";
  }
});

// ĐĂNG KÝ NGƯỜI CHƠI
if (joinButton) {
  joinButton.onclick = () => {
    if (registered) return;

    username = usernameInput
      ? usernameInput.value.trim().replace(/^@/, "")
      : "";

    if (!username) {
      if (notice) {
        notice.textContent = "Bạn hãy nhập tên TikTok trước nhé.";
      }
      return;
    }

    joinButton.disabled = true;
    joinButton.textContent = "Đang gửi…";

    socket.emit("viewer:register", { username });
  };
                   }
