
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

  if (room) room.textContent = `${s.roomName || "Caro Live"} · 15×15`;
  if (host) host.textContent = s.host || "";
  if (hostScore) hostScore.textContent = s.scores?.host ?? 0;
  if (viewerScore) viewerScore.textContent = s.scores?.viewers ?? 0;

  if (opponent) {
    opponent.textContent = s.activePlayer || "Chưa chọn";
  }

  if (status) {
    status.textContent = s.winner
      ? (s.winner === "X"
          ? "CHỦ LIVE THẮNG!"
          : `${s.activePlayer || "NGƯỜI CHƠI"} CHIẾN THẮNG!`)
      : (s.turn === "O"
          ? `Đến lượt ${s.activePlayer || "người xem"} (O)`
          : "Đến lượt chủ LIVE (X)");
  }

  // Xác định nước đi gần nhất
  const latestMove = Number.isInteger(s.lastMove)
    ? s.lastMove
    : null;

  // Vẽ lại toàn bộ bàn cờ theo trạng thái máy chủ
  const fragment = document.createDocumentFragment();

  s.board.forEach((value, index) => {
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = index;

    // Tạo quân cờ với kiểu hiển thị độc lập CSS
    if (value === "X" || value === "O") {
      cell.classList.add(value, value === "X" ? "piece-x" : "piece-o");

      const stone = document.createElement("span");
      stone.className = "stone";
      stone.setAttribute("aria-hidden", "true");

      stone.style.cssText = `
        display: block;
        width: 76%;
        height: 76%;
        min-width: 0;
        min-height: 0;
        border-radius: 50%;
        box-sizing: border-box;
        pointer-events: none;
        position: relative;
        z-index: 2;
        background: ${value === "X"
          ? "radial-gradient(circle at 32% 25%, #ffb0a8 0%, #ed3030 42%, #a90000 100%)"
          : "radial-gradient(circle at 32% 25%, #777 0%, #242424 45%, #050505 100%)"};
        border: 1px solid ${value === "X" ? "#850000" : "#000"};
        box-shadow: 0 2px 5px rgba(0,0,0,.45), inset 0 2px 3px rgba(255,255,255,.28);
      `;

      cell.appendChild(stone);
      cell.setAttribute("aria-label", `Ô ${index + 1}: quân ${value}`);
    } else {
      cell.setAttribute("aria-label", `Ô trống ${index + 1}`);
    }

    // Đánh dấu nước đi gần nhất
    if (latestMove === index) {
      cell.classList.add("last-move");
      cell.style.outline = "3px solid #ffd700";
      cell.style.outlineOffset = "-3px";
    }

    const isMyTurn =
      username &&
      s.activePlayer &&
      s.activePlayer.toLowerCase() === username.toLowerCase() &&
      s.turn === "O";

    cell.disabled =
      !!value ||
      !!s.winner ||
      !isMyTurn;

    cell.addEventListener("click", () => {
      if (
        !state ||
        state.board[index] ||
        state.winner ||
        state.turn !== "O" ||
        !state.activePlayer ||
        state.activePlayer.toLowerCase() !== username.toLowerCase()
      ) {
        return;
      }

      socket.emit("viewer:move", { index });
    });

    fragment.appendChild(cell);
  });

  boardEl.replaceChildren(fragment);

  // Cập nhật thông báo đăng ký
  const key = username.toLowerCase();

  if (username && s.pendingQueue?.some(
    p => p.username.toLowerCase() === key
  )) {
    showNotice("📨 Yêu cầu của bạn đang chờ chủ LIVE duyệt.");
  } else if (username && s.queue?.some(
    p => p.username.toLowerCase() === key
  )) {
    showNotice("✅ Bạn đã được duyệt! Hãy chờ chủ LIVE chọn vào trận.");
  } else if (
    username &&
    s.activePlayer?.toLowerCase() === key
  ) {
    showNotice("🎮 Bạn đang tham gia trận đấu!");
  }
}

// Nhận trạng thái mới từ máy chủ
socket.on("state", s => {
  render(s);
});

socket.on("notice", message => {
  showNotice(message);
});

socket.on("viewer:move:rejected", message => {
  showNotice(message || "Nước đi chưa hợp lệ.");
});

// Kết nối hoặc kết nối lại
socket.on("connect", () => {
  showNotice("Đã kết nối máy chủ.");

  if (username) {
    socket.emit("viewer:register", { username });
  }
});

// Đăng ký người chơi
document.getElementById("join")?.addEventListener("click", () => {
  const input = document.getElementById("username");
  const enteredName = (input?.value || "")
    .trim()
    .replace(/^@+/, "");

  if (!enteredName) {
    showNotice("Bạn hãy nhập tên TikTok trước nhé.");
    return;
  }

  username = enteredName;
  registered = true;

  socket.emit("viewer:register", { username });
  showNotice("📨 Đã gửi yêu cầu. Vui lòng chờ chủ LIVE duyệt!");
});

// Mất kết nối
socket.on("disconnect", () => {
  showNotice("Mất kết nối máy chủ. Đang chờ kết nối lại...");
});

// Lấy trạng thái hiện tại ngay khi tải trang
fetch("/api/state")
  .then(response => {
    if (!response.ok) throw new Error("Không lấy được trạng thái");
    return response.json();
  })
  .then(render)
  .catch(error => {
    console.error("Lỗi tải bàn cờ:", error);
    showNotice("Không tải được bàn cờ. Vui lòng tải lại trang.");
  });
