
const socket = io();

const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");
const statusEl = document.getElementById("status");
const soundButton = document.getElementById("soundToggle");

let state = null;
let username = "";
let firstState = true;

// NUT AM THANH
if (soundButton) {
  soundButton.onclick = () => {
    const on = CaroSound.toggle();

    soundButton.textContent = on
      ? "🔊 Bật âm thanh"
      : "🔇 Tắt âm thanh";

    soundButton.classList.toggle("off", !on);
  };
}

// CAP NHAT GIAO DIEN
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  if (state && !firstState) {
    const oldCount = state.board.filter(Boolean).length;
    const newCount = s.board.filter(Boolean).length;

    if (newCount > oldCount) {
      CaroSound.move();

      if (window.CaroEffects) {
        CaroEffects.move();
      }
    }

    // NGUOI XEM LA QUAN O
    if (!state.winner && s.winner) {
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

  // TEN PHONG NEU TRANG CO PHAN TU ROOM
  const roomEl = document.getElementById("room");

  if (roomEl) {
    roomEl.textContent = `${s.roomName || "Caro Live"} · 15×15`;
  }

  // TEN VA DIEM
  const hostEl = document.getElementById("host");
  const hostScoreEl = document.getElementById("hostScore");
  const viewerScoreEl = document.getElementById("viewerScore");
  const opponentEl = document.getElementById("opponent");

  if (hostEl) {
    hostEl.textContent = s.host || "@mbbb1118";
  }

  if (hostScoreEl) {
    hostScoreEl.textContent = s.scores?.host ?? 0;
  }

  if (viewerScoreEl) {
    viewerScoreEl.textContent = s.scores?.viewers ?? 0;
  }

  if (opponentEl) {
    opponentEl.textContent = s.activePlayer || "Chưa chọn";
  }

  // TRANG THAI LUOT CHOI
  if (statusEl) {
    if (s.winner) {
      statusEl.textContent = s.winner === "X"
        ? "🏆 CHỦ LIVE THẮNG!"
        : `🏆 ${s.activePlayer || "NGƯỜI CHƠI"} CHIẾN THẮNG!`;
    } else {
      statusEl.textContent = s.turn === "O"
        ? `Đến lượt ${s.activePlayer || "người xem"} (O)`
        : "Đến lượt chủ LIVE (X)";
    }
  }

  // TAO 225 O CO
  if (!boardEl) return;

  boardEl.innerHTML = "";

  s.board.forEach((value, index) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell " + (value || "");
    cell.textContent = value || "";

    if (value) {
      cell.classList.add("pop");

      cell.setAttribute(
        "aria-label",
        value === "X" ? "Quân trắng" : "Quân đen"
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
        socket.emit("viewer:move", {
          index
        });
      }
    });

    boardEl.appendChild(cell);
  });
}

// NHAN TRANG THAI
socket.on("state", render);

// THONG BAO
socket.on("notice", message => {
  if (notice) {
    notice.textContent = message;
  }
});

// KET NOI MAY CHU
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

// NGUOI XEM DANG KY
const joinButton = document.getElementById("join");
const usernameInput = document.getElementById("username");

if (joinButton) {
  joinButton.onclick = () => {
    username = usernameInput
      ? usernameInput.value.trim()
      : "";

    if (!username) {
      if (notice) {
        notice.textContent = "Bạn nhập tên TikTok trước nhé.";
      }
      return;
    }

    socket.emit("viewer:join", {
      username
    });
  };
}
