
const socket = io();

const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");

let state = null;
let username = "";
let registered = false;

function showNotice(message) {
  if (notice) notice.textContent = message;
}

function render(s) {
  if (!s || !Array.isArray(s.board) || !boardEl) return;

  state = s;

  const room = document.getElementById("room");
  const host = document.getElementById("host");
  const hostScore = document.getElementById("hostScore");
  const viewerScore = document.getElementById("viewerScore");
  const opponent = document.getElementById("opponent");
  const status = document.getElementById("status");

  if (room) room.textContent = `${s.roomName} · 15×15`;
  if (host) host.textContent = s.host;
  if (hostScore) hostScore.textContent = s.scores?.host ?? 0;
  if (viewerScore) viewerScore.textContent = s.scores?.viewers ?? 0;

  if (opponent) {
    opponent.textContent = s.activePlayer || "Chưa chọn";
  }

  if (status) {
    status.textContent = s.winner
      ? (s.winner === "X"
          ? "CHỦ LIVE THẮNG!"
          : `${s.activePlayer} CHIẾN THẮNG!`)
      : (s.turn === "O"
          ? `Đến lượt ${s.activePlayer || "người xem"} (O)`
          : "Đến lượt chủ LIVE (X)");
  }

  // VE BAN CO
  boardEl.innerHTML = "";

  s.board.forEach((value, index) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";

    if (value === "X") {
      cell.classList.add("X", "piece-x");
    } else if (value === "O") {
      cell.classList.add("O", "piece-o");
    }

    if (value) {
      const stone = document.createElement("span");
      stone.className = "stone";
      stone.setAttribute("aria-hidden", "true");
      cell.appendChild(stone);
    }

    cell.disabled =
      !!value ||
      !!s.winner ||
      s.turn !== "O" ||
      !s.activePlayer ||
      s.activePlayer.toLowerCase() !== username.toLowerCase();

    cell.addEventListener("click", () => {
      if (
        !state ||
        state.board[index] ||
        state.winner ||
        state.turn !== "O" ||
        state.activePlayer?.toLowerCase() !== username.toLowerCase()
      ) {
        return;
      }

      socket.emit("viewer:move", { index });
    });

    boardEl.appendChild(cell);
  });

  // CAP NHAT TRANG THAI DANG KY
  if (username && s.pendingQueue?.some(
    p => p.username.toLowerCase() === username.toLowerCase()
  )) {
    showNotice("📨 Yêu cầu của bạn đang chờ chủ LIVE duyệt.");
  } else if (username && s.queue?.some(
    p => p.username.toLowerCase() === username.toLowerCase()
  )) {
    showNotice("✅ Bạn đã được duyệt! Hãy chờ chủ LIVE chọn vào trận.");
  } else if (
    username &&
    s.activePlayer?.toLowerCase() === username.toLowerCase()
  ) {
    showNotice("🎮 Bạn đang tham gia trận đấu!");
  }
}

socket.on("state", render);

socket.on("notice", message => {
  showNotice(message);
});

socket.on("connect", () => {
  // KET NOI LAI THI DANG KY LAI DE GAN TEN VOI SOCKET
  if (username) {
    socket.emit("viewer:register", { username });
  }
});

document.getElementById("join")?.addEventListener("click", () => {
  const input = document.getElementById("username");
  username = (input?.value || "").trim().replace(/^@+/, "");

  if (!username) {
    showNotice("Bạn hãy nhập tên TikTok trước nhé.");
    return;
  }

  if (registered) {
    showNotice("Bạn đã gửi yêu cầu rồi, vui lòng chờ duyệt nhé.");
    return;
  }

  registered = true;
  socket.emit("viewer:register", { username });
  showNotice("📨 Đã gửi yêu cầu. Vui lòng chờ chủ LIVE duyệt!");
});

socket.on("disconnect", () => {
  showNotice("Mất kết nối máy chủ. Đang chờ kết nối lại...");
});
