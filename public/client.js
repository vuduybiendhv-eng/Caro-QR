
const socket = io();

const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");
const statusEl = document.getElementById("status");
const soundButton = document.getElementById("soundToggle");

let state = null;
let username = "";
let firstState = true;

// BAT AM THANH
if (soundButton) {
  soundButton.onclick = () => {
    const on = CaroSound.toggle();

    soundButton.textContent = on
      ? "🔊 Bật âm thanh"
      : "🔇 Tắt âm thanh";

    soundButton.classList.toggle("off", !on);
  };
}

// VE BAN CO VA CAP NHAT GIAO DIEN
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  // HIEU UNG DI CHUYEN VA CHIEN THANG
  if (state && !firstState) {
    const oldCount = state.board.filter(Boolean).length;
    const newCount = s.board.filter(Boolean).length;

    if (newCount > oldCount && window.CaroSound) {
      CaroSound.move();
    }

    if (!state.winner && s.winner && window.CaroSound) {
      CaroSound.win();

      if (window.CaroEffects) {
        CaroEffects.celebrate(
          s.winner === "X"
            ? "CHỦ LIVE CHIẾN THẮNG!"
            : "NGƯỜI CHƠI CHIẾN THẮNG!"
        );
      }
    }
  }

  firstState = false;
  state = s;

  // CAP NHAT TEN PHONG NEU CO PHAN TU ROOM
  const roomEl = document.getElementById("room");

  if (roomEl) {
    roomEl.textContent = `${s.roomName || "Caro Live"} · 15×15`;
  }

  // CAP NHAT NGUOI CHOI
  document.getElementById("host").textContent = s.host || "@mbbb1118";

  document.getElementById("hostScore").textContent =
    s.scores?.host ?? 0;

  document.getElementById("viewerScore").textContent =
    s.scores?.viewers ?? 0;

  document.getElementById("opponent").textContent =
    s.activePlayer || "Chưa chọn";

  // CAP NHAT LUOT CHOI
  if (statusEl) {
    statusEl.textContent = s.winner
      ? (
          s.winner === "X"
            ? "🏆 CHỦ LIVE THẮNG!"
            : `🏆 ${s.activePlayer || "NGƯỜI CHƠI"} CHIẾN THẮNG!`
        )
      : (
          s.turn === "O"
            ? `Đến lượt ${s.activePlayer || "người xem"} (O)`
            : "Đến lượt chủ LIVE (X)"
        );
  }

  // TAO LAI 225 O CO
  if (!boardEl) return;

  boardEl.innerHTML = "";

  s.board.forEach((v, i) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";

    if (v) {
      cell.classList.add(v);
      cell.classList.add("pop");

      cell.setAttribute(
        "aria-label",
        v === "X" ? "Quân trắng" : "Quân đen"
      );
    } else {
      cell.setAttribute("aria-label", `Ô cờ ${i + 1}`);
    }

    cell.textContent = v || "";

    cell.disabled =
      !!v ||
      !!s.winner ||
      s.turn !== "O" ||
      !s.activePlayer;

    cell.addEventListener("click", () => {
      if (!cell.disabled) {
        socket.emit("viewer:move", { index: i });
      }
    });

    boardEl.appendChild(cell);
  });
}

// NHAN TRANG THAI TU MAY CHU
socket.on("state", render);

// THONG BAO
socket.on("notice", (message) => {
  if (notice) notice.textContent = message;
});

// KET NOI SOCKET
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

// NGUOI XEM DANG KY THAM GIA
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

    socket.emit("viewer:join", { username });
  };
}
