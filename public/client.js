
/* =========================================================
   CARO LIVE - CLIENT.JS
   Dành cho người xem: đăng ký, nhận bàn cờ, đánh quân O,
   nhận quân X từ chủ phòng, âm thanh và hiệu ứng.
   ========================================================= */

(() => {
  "use strict";

  // ---------- KẾT NỐI ----------
  if (typeof window.io !== "function") {
    console.error("Không tải được Socket.IO. Kiểm tra /socket.io/socket.io.js");
    return;
  }

  const socket = window.io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // ---------- PHẦN TỬ GIAO DIỆN ----------
  const boardEl = document.getElementById("board");
  const noticeEl = document.getElementById("notice");
  const joinBtn = document.getElementById("join");
  const usernameInput = document.getElementById("username");

  // Các phần tử thông tin có thể có trên giao diện.
  const roomEl = document.getElementById("roomName");
  const hostEl = document.getElementById("hostName");
  const scoreXEl = document.getElementById("scoreX");
  const scoreOEl = document.getElementById("scoreO");
  const opponentEl = document.getElementById("opponentName");
  const statusEl = document.getElementById("status");
  const turnEl = document.getElementById("turnInfo");
  const timerEl = document.getElementById("timer");

  // ---------- TRẠNG THÁI ----------
  let state = null;
  let username = "";
  let registered = false;
  let lastNotice = "";

  // ---------- TIỆN ÍCH ----------
  function getSavedUsername() {
    try {
      return localStorage.getItem("caro_live_username") || "";
    } catch {
      return "";
    }
  }

  function saveUsername(name) {
    try {
      localStorage.setItem("caro_live_username", name);
    } catch {
      // Không ảnh hưởng nếu trình duyệt chặn localStorage.
    }
  }

  function showNotice(message) {
    if (!noticeEl || !message) return;

    lastNotice = String(message);
    noticeEl.textContent = lastNotice;
    noticeEl.classList.remove("notice-hidden");

    if (window.CaroEffects && typeof window.CaroEffects.notice === "function") {
      window.CaroEffects.notice(lastNotice);
    }
  }

  function setText(element, value) {
    if (element && value !== undefined && value !== null) {
      element.textContent = String(value);
    }
  }

  function playSound(name) {
    if (
      window.CaroSound &&
      typeof window.CaroSound[name] === "function" &&
      window.CaroSound.isEnabled()
    ) {
      window.CaroSound[name]();
    }
  }

  function sameName(a, b) {
    return String(a || "").trim().toLowerCase() ===
      String(b || "").trim().toLowerCase();
  }

  // ---------- CẬP NHẬT THÔNG TIN ----------
  function renderInfo(s) {
    setText(roomEl, s.roomName || s.room || "Phòng Caro Live · 15×15");
    setText(hostEl, s.hostName || s.host || "CHỦ LIVE");

    if (s.scores) {
      setText(scoreXEl, s.scores.X ?? 0);
      setText(scoreOEl, s.scores.O ?? 0);
    }

    if (s.activePlayer) {
      setText(opponentEl, s.activePlayer);
    }

    if (s.winner) {
      setText(
        statusEl,
        s.winner === "O"
          ? "BẠN ĐÃ CHIẾN THẮNG!"
          : "CHỦ LIVE ĐÃ CHIẾN THẮNG!"
      );
    } else if (!s.activePlayer) {
      setText(statusEl, "Đang chờ người chơi");
    } else if (s.turn === "O") {
      setText(statusEl, "Đến lượt bạn đánh");
    } else {
      setText(statusEl, "Đang chờ chủ LIVE đánh");
    }

    if (s.turn) {
      setText(
        turnEl,
        s.turn === "X" ? "Lượt quân X - Chủ LIVE" : "Lượt quân O - Người chơi"
      );
    }

    if (s.remainingSeconds !== undefined) {
      setText(timerEl, Math.max(0, Number(s.remainingSeconds) || 0));
    }
  }

  // ---------- PHÁT HIỆN NƯỚC ĐI MỚI ----------
  function detectChanges(previous, current) {
    if (!previous || !Array.isArray(previous.board)) return;

    const oldBoard = previous.board;
    const newBoard = current.board;

    if (!Array.isArray(newBoard)) return;

    let newPiece = "";

    for (let i = 0; i < newBoard.length; i++) {
      if (!oldBoard[i] && newBoard[i]) {
        newPiece = newBoard[i];
        break;
      }
    }

    // Có quân mới trên bàn: phát âm thanh.
    if (newPiece) {
      playSound("move");

      if (window.CaroEffects && typeof window.CaroEffects.move === "function") {
        window.CaroEffects.move();
      }
    }

    // Chỉ phát âm thanh kết quả khi vừa có người thắng.
    if (!previous.winner && current.winner) {
      if (current.winner === "O") {
        playSound("win");

        if (window.CaroEffects && typeof window.CaroEffects.win === "function") {
          window.CaroEffects.win();
        }
      } else {
        playSound("defeat");

        if (window.CaroEffects && typeof window.CaroEffects.defeat === "function") {
          window.CaroEffects.defeat();
        }
      }
    }
  }

  // ---------- VẼ BÀN CỜ ----------
  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    boardEl.innerHTML = "";

    s.board.forEach((value, index) => {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);

      // Quan trọng: CSS dùng data-piece để nhận biết X/O.
      if (value === "X" || value === "O") {
        cell.dataset.piece = value;
        cell.classList.add(value === "X" ? "piece-x" : "piece-o");
        cell.classList.add(value);
      }

      // Tạo quân cờ.
      if (value === "X" || value === "O") {
        const stone = document.createElement("span");
        stone.className = "stone";
        stone.textContent = value;
        stone.setAttribute("aria-label", value === "X" ? "Quân chủ LIVE" : "Quân người chơi");
        cell.appendChild(stone);
      }

      // Đánh dấu nước đi mới nhất.
      if (Number(s.lastMove) === index) {
        cell.classList.add("last-move");
      }

      // Chỉ người chơi đang được chọn mới được đánh quân O.
      const isMyTurn =
        username &&
        s.activePlayer &&
        sameName(s.activePlayer, username) &&
        s.turn === "O" &&
        !s.winner &&
        !value;

      cell.disabled = !isMyTurn;
      cell.setAttribute("aria-label", value
        ? `Ô ${index + 1}: quân ${value}`
        : `Ô trống ${index + 1}`);

      cell.addEventListener("click", () => {
        if (!state || !socket.connected) {
          showNotice("Mất kết nối. Vui lòng đợi kết nối lại.");
          return;
        }

        if (state.winner) {
          showNotice("Ván đấu đã kết thúc.");
          return;
        }

        if (!state.activePlayer || !sameName(state.activePlayer, username)) {
          showNotice("Bạn chưa được chủ LIVE chọn vào lượt chơi.");
          return;
        }

        if (state.turn !== "O") {
          showNotice("Chưa đến lượt bạn. Hãy chờ chủ LIVE đánh.");
          return;
        }

        if (state.board[index]) return;

        // Khóa ô ngay lập tức để tránh bấm liên tục.
        cell.disabled = true;
        socket.emit("viewer:move", { index });
      });

      boardEl.appendChild(cell);
    });
  }

  // ---------- NHẬN TRẠNG THÁI TỪ SERVER ----------
  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    // Phải giữ trạng thái cũ trước khi ghi trạng thái mới.
    // Nếu ghi đè trước, chương trình sẽ không phát hiện được quân mới.
    const previousState = state;

    detectChanges(previousState, s);

    state = s;

    renderInfo(s);
    renderBoard(s);
  }

  // ---------- ĐĂNG KÝ NGƯỜI CHƠI ----------
  function registerViewer() {
    const name = String(usernameInput?.value || username || "").trim();

    if (!name) {
      showNotice("Vui lòng nhập tên người chơi.");
      usernameInput?.focus();
      return;
    }

    if (name.length > 24) {
      showNotice("Tên người chơi tối đa 24 ký tự.");
      return;
    }

    username = name;
    registered = true;
    saveUsername(name);

    if (!socket.connected) {
      showNotice("Đang kết nối máy chủ. Vui lòng đợi...");
      return;
    }

    socket.emit("viewer:register", { username: name });
    showNotice("Đã gửi yêu cầu tham gia. Vui lòng chờ chủ LIVE.");
  }

  if (joinBtn) {
    joinBtn.addEventListener("click", registerViewer);
  }

  if (usernameInput) {
    usernameInput.value = getSavedUsername();

    usernameInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        registerViewer();
      }
    });
  }

  // ---------- SỰ KIỆN SOCKET ----------
  socket.on("connect", () => {
    console.log("Caro LIVE đã kết nối:", socket.id);

    if (registered && username) {
      socket.emit("viewer:register", { username });
    }

    showNotice("Đã kết nối máy chủ.");
  });

  socket.on("state", render);

  socket.on("notice", data => {
    const message = typeof data === "string"
      ? data
      : data?.message || data?.text || "";

    if (message) showNotice(message);
  });

  socket.on("disconnect", reason => {
    console.warn("Caro LIVE mất kết nối:", reason);
    showNotice("Mất kết nối máy chủ. Đang tự kết nối lại...");
  });

  socket.on("connect_error", error => {
    console.error("Lỗi kết nối:", error);
    showNotice("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  });

  // ---------- TẢI TRẠNG THÁI BAN ĐẦU ----------
  async function loadInitialState() {
    try {
      const response = await fetch("/api/state", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Không tải được trạng thái phòng.");
      }

      const data = await response.json();
      render(data);
    } catch (error) {
      console.warn("Chưa tải được trạng thái ban đầu:", error);
    }
  }

  // Tên đã lưu sẽ được dùng lại sau khi tải lại trang.
  const savedName = getSavedUsername();

  if (savedName) {
    username = savedName;
    registered = true;

    if (usernameInput) {
      usernameInput.value = savedName;
    }
  }

  loadInitialState();

  console.log("Caro LIVE client.js đã khởi chạy.");
})();
