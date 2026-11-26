
/* =========================================================
   CARO LIVE - CLIENT.JS
   Viewer:
   - Tự đăng ký vào hàng chờ
   - Bàn cờ 15x15
   - Chat và đấu lại
   - Đồng bộ trạng thái
   - Âm thanh, hiệu ứng
   - 7 emoji bay nổi trên bàn cờ
========================================================= */

(() => {
  "use strict";

  if (typeof window.io !== "function") {
    console.error("Không tải được Socket.IO.");
    return;
  }

  const socket = window.io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  const $ = id => document.getElementById(id);

  const boardEl = $("board");
  const noticeEl = $("notice");
  const usernameInput = $("username");
  const joinBtn = $("join");

  const hostEl = $("host");
  const hostScoreEl = $("hostScore");
  const opponentEl = $("opponent");
  const viewerScoreEl = $("viewerScore");
  const statusEl = $("status");

  const timerPanel = $("timerPanel");
  const timerOwner = $("timerOwner");
  const timerNumber = $("timerNumber");
  const timerMessage = $("timerMessage");

  const rematchPanel = $("rematchPanel");
  const rematchMessage = $("rematchMessage");
  const rematchBtn = $("rematchBtn");

  const chatMessages = $("chatMessages");
  const chatEmpty = $("chatEmpty");
  const chatInput = $("chatInput");
  const chatSend = $("chatSend");
  const chatNotice = $("chatNotice");

  let state = null;
  let username = "";
  let registered = false;
  let cells = [];
  let lastRoundId = null;
  let lastWinner = null;
  let lastBoard = [];
  let pendingMove = false;

  // ========================================================
  // TIỆN ÍCH
  // ========================================================

  function savedName() {
    try {
      return localStorage.getItem("caro_live_username") || "";
    } catch {
      return "";
    }
  }

  function saveName(name) {
    try {
      localStorage.setItem("caro_live_username", name);
    } catch {}
  }

  function showNotice(message) {
    if (!noticeEl) return;

    noticeEl.textContent = String(message || "");
    noticeEl.classList.toggle("notice-hidden", !message);
  }

  function setText(el, value) {
    if (el && value !== undefined && value !== null) {
      el.textContent = String(value);
    }
  }

  function sameName(a, b) {
    return String(a || "").trim().toLowerCase() ===
      String(b || "").trim().toLowerCase();
  }

  function isActiveViewer(s = state) {
    return Boolean(
      s &&
      username &&
      s.activePlayer &&
      sameName(s.activePlayer, username)
    );
  }

  function isMyTurn(s = state) {
    return Boolean(
      isActiveViewer(s) &&
      s.turn === "O" &&
      !s.winner
    );
  }

  function playSound(name) {
    const sound = window.CaroSound;

    if (!sound || typeof sound[name] !== "function") return;

    try {
      if (
        typeof sound.isEnabled !== "function" ||
        sound.isEnabled()
      ) {
        sound[name]();
      }
    } catch (error) {
      console.warn("Không phát được âm thanh:", error);
    }
  }

  // ========================================================
  // ĐĂNG KÝ NGƯỜI XEM
  // ========================================================

  function askUsername() {
    let name = savedName();

    if (!name) {
      name = window.prompt(
        "Nhập tên TikTok để vào phòng Caro LIVE:"
      ) || "";
    }

    name = String(name).trim().replace(/^@/, "");

    if (!name) {
      showNotice("Bạn cần nhập tên TikTok để vào phòng chờ.");
      return false;
    }

    if (name.length > 24) {
      showNotice("Tên TikTok tối đa 24 ký tự.");
      return false;
    }

    username = name;
    registered = true;
    saveName(name);

    if (usernameInput) usernameInput.value = name;

    return true;
  }

  function registerViewer() {
    if (!username && !askUsername()) return;

    if (!socket.connected) {
      showNotice("Đang kết nối máy chủ...");
      return;
    }

    socket.emit("viewer:register", { username });
    showNotice("Đang tham gia phòng chờ...");
  }

  // ========================================================
  // BÀN CỜ 15x15
  // ========================================================

  function createBoard() {
    if (!boardEl || cells.length) return;

    boardEl.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 225; index++) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);

      cell.setAttribute(
        "aria-label",
        `Ô trống ${index + 1}`
      );

      cell.addEventListener("click", () => makeMove(index));

      cells.push(cell);
      fragment.appendChild(cell);
    }

    boardEl.appendChild(fragment);
  }

  function makeMove(index) {
    if (!state || !socket.connected) {
      showNotice(
        "Mất kết nối máy chủ. Vui lòng đợi kết nối lại."
      );
      return;
    }

    if (!registered || !username) {
      showNotice("Bạn cần đăng ký tên TikTok trước.");
      return;
    }

    if (!isMyTurn()) {
      showNotice(
        "Chưa đến lượt bạn hoặc bạn chưa được chọn đấu."
      );
      return;
    }

    if (state.board[index]) return;
    if (pendingMove) return;

    pendingMove = true;
    updateBoardControls();

    socket.emit("viewer:move", { index });
  }

  function updateBoardControls() {
    if (!state || !cells.length) return;

    const canPlay = isMyTurn() && !pendingMove;

    cells.forEach((cell, index) => {
      const occupied = Boolean(state.board[index]);
      cell.disabled = occupied || !canPlay;
    });
  }

  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    createBoard();

    s.board.forEach((value, index) => {
      const cell = cells[index];
      if (!cell) return;

      const oldValue = cell.dataset.piece || "";
      const newValue =
        value === "X" || value === "O" ? value : "";

      if (oldValue !== newValue) {
        cell.replaceChildren();

        cell.classList.remove(
          "piece-x", "piece-o", "X", "O"
        );

        if (newValue) {
          cell.dataset.piece = newValue;

          cell.classList.add(
            newValue === "X" ? "piece-x" : "piece-o",
            newValue
          );

          const stone = document.createElement("span");
          stone.className = "stone";
          stone.textContent = newValue;

          stone.setAttribute(
            "aria-label",
            newValue === "X"
              ? "Quân Chủ LIVE"
              : "Quân người chơi"
          );

          cell.appendChild(stone);
        } else {
          delete cell.dataset.piece;
        }
      }

      const isLastMove =
        s.lastMove !== null &&
        s.lastMove !== undefined &&
        Number(s.lastMove) === index;

      cell.classList.toggle("last-move", isLastMove);

      cell.setAttribute(
        "aria-label",
        newValue
          ? `Ô ${index + 1}: quân ${newValue}`
          : `Ô trống ${index + 1}`
      );
    });

    updateBoardControls();
  }

  // ========================================================
  // THÔNG TIN VÀ ĐỒNG HỒ
  // ========================================================

  function renderInfo(s) {
    setText(hostEl, s.host || "CHỦ LIVE");

    setText(
      opponentEl,
      s.activePlayer || "Đang chờ người chơi"
    );

    const scores = s.scores || {};

    setText(hostScoreEl, scores.host ?? scores.X ?? 0);
    setText(viewerScoreEl, scores.viewers ?? scores.O ?? 0);

    if (s.winner === "O") {
      setText(statusEl, "BẠN ĐÃ CHIẾN THẮNG!");
    } else if (s.winner === "X") {
      setText(statusEl, "CHỦ LIVE ĐÃ CHIẾN THẮNG!");
    } else if (s.winner === "D") {
      setText(statusEl, "VÁN ĐẤU HÒA!");
    } else if (!s.activePlayer) {
      setText(statusEl, "Đang chờ người chơi");
    } else if (isMyTurn(s)) {
      setText(statusEl, "ĐẾN LƯỢT BẠN ĐÁNH");
    } else {
      setText(statusEl, "ĐANG CHỜ CHỦ LIVE ĐÁNH");
    }

    const seconds = Math.max(
      0,
      Number(s.remainingSeconds ?? 0)
    );

    setText(timerNumber, seconds);
    setText($("timer"), seconds);

    setText(
      timerOwner,
      s.turn === "X"
        ? "LƯỢT CHỦ LIVE"
        : "LƯỢT NGƯỜI CHƠI"
    );

    setText(
      timerMessage,
      s.winner
        ? "Ván đấu đã kết thúc"
        : "Thời gian lượt đánh"
    );

    if (timerPanel) {
      timerPanel.classList.toggle(
        "timer-ended",
        Boolean(s.winner)
      );
    }
  }

  // ========================================================
  // ÂM THANH VÀ HIỆU ỨNG
  // ========================================================

  function detectChanges(previous, current) {
    if (!previous) return;

    if (previous.roundId !== current.roundId) {
      lastBoard = [];
      lastWinner = null;
      pendingMove = false;
      return;
    }

    const oldBoard = previous.board || [];
    const newBoard = current.board || [];

    const addedPiece = newBoard.some(
      (piece, index) => !oldBoard[index] && piece
    );

    if (addedPiece) {
      pendingMove = false;
      playSound("move");
      window.CaroEffects?.move?.();
    }

    if (!previous.winner && current.winner) {
      if (current.winner === "O") {
        playSound("win");
        window.CaroEffects?.win?.();
      } else if (current.winner === "X") {
        playSound("defeat");
        window.CaroEffects?.defeat?.();
      }
    }
  }

  // ========================================================
  // ĐẤU LẠI
  // ========================================================

  function renderRematch(s) {
    if (!rematchPanel || !rematchBtn) return;

    const ended = Boolean(s.winner);
    const request = s.rematchRequest;

    rematchPanel.hidden = !ended;

    if (!ended) return;

    if (request === "host") {
      setText(
        rematchMessage,
        "Chủ LIVE muốn đấu lại. Bạn đồng ý chứ?"
      );

      setText(rematchBtn, "ĐỒNG Ý ĐẤU LẠI");
      rematchBtn.disabled = false;

    } else if (request === "viewer") {
      setText(
        rematchMessage,
        "Đã gửi yêu cầu. Đang chờ Chủ LIVE..."
      );

      setText(rematchBtn, "ĐÃ GỬI YÊU CẦU");
      rematchBtn.disabled = true;

    } else {
      setText(
        rematchMessage,
        "Bạn có muốn chơi thêm ván nữa không?"
      );

      setText(rematchBtn, "ĐẤU LẠI");
      rematchBtn.disabled = false;
    }
  }

  if (rematchBtn) {
    rematchBtn.addEventListener("click", () => {
      if (!state || !state.winner) return;

      if (state.rematchRequest === "host") {
        socket.emit("viewer:rematch-confirm");

        setText(
          rematchMessage,
          "Đang xác nhận đấu lại..."
        );

      } else if (!state.rematchRequest) {
        socket.emit("viewer:rematch-request");

        setText(
          rematchMessage,
          "Đã gửi yêu cầu đấu lại..."
        );

        rematchBtn.disabled = true;
      }
    });
  }

  // ========================================================
  // CHAT
  // ========================================================

  function addChatMessage(data) {
    if (!chatMessages) return;

    const message =
      typeof data === "string"
        ? data
        : data?.message || data?.text || "";

    if (!message) return;

    const sender =
      data?.username ||
      data?.sender ||
      data?.name ||
      "Người chơi";

    const item = document.createElement("div");
    item.className = "chat-message";

    const nameEl = document.createElement("strong");
    nameEl.className = "chat-sender";
    nameEl.textContent = sender;

    const textEl = document.createElement("span");
    textEl.className = "chat-text";
    textEl.textContent = message;

    item.append(nameEl, textEl);
    chatMessages.appendChild(item);

    if (chatEmpty) chatEmpty.hidden = true;

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChat() {
    const message = String(chatInput?.value || "").trim();

    if (!message) return;

    if (!socket.connected) {
      setText(chatNotice, "Mất kết nối máy chủ.");
      return;
    }

    if (
      !state?.activePlayer ||
      !sameName(state.activePlayer, username)
    ) {
      setText(
        chatNotice,
        "Chỉ người đang đấu mới được nhắn tin."
      );
      return;
    }

    socket.emit("chat:send", { message });

    chatInput.value = "";
    setText(chatNotice, "");
  }

  chatSend?.addEventListener("click", sendChat);

  chatInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChat();
    }
  });

  // ========================================================
  // EMOJI BAY NỔI - CHỈ 7 EMOJI
  // ========================================================

  const reactionList = [
    "😂", "👍", "❤️", "😱", "👏", "❌", "👋"
  ];

  let reactionButtons = [];

  function installReactionAnimation() {
    if ($("caroReactionStyle")) return;

    const style = document.createElement("style");
    style.id = "caroReactionStyle";

    style.textContent = `
      @keyframes caroReactionFloat {
        0% {
          opacity: 0;
          transform: translate(-50%, 15px)
                     scale(.6) rotate(-10deg);
        }
        15% {
          opacity: 1;
        }
        70% {
          opacity: 1;
          transform: translate(-50%, -65px)
                     scale(1.2) rotate(10deg);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -110px)
                     scale(.8) rotate(-8deg);
        }
      }

      .caro-reaction-stage {
        position: relative;
        display: block;
        width: 100%;
        max-width: 100%;
      }

      #reactionOverlay {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 50;
      }

      #reactionToolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 7px;
        padding: 10px 4px;
      }

      #reactionToolbar button {
        min-width: 38px;
        min-height: 38px;
        padding: 4px;
        border-radius: 12px;
        font-size: 23px;
        cursor: pointer;
        touch-action: manipulation;
      }

      #reactionToolbar button:disabled {
        opacity: .4;
        cursor: not-allowed;
      }
    `;

    document.head.appendChild(style);
  }

  function updateReactionControls() {
    const canReact = Boolean(
      registered &&
      username &&
      isActiveViewer() &&
      !state?.winner &&
      socket.connected
    );

    reactionButtons.forEach(button => {
      button.disabled = !canReact;
    });
  }

  function setupReactions() {
    if (!boardEl || $("reactionToolbar")) return;

    const boardContainer = boardEl.parentElement;
    if (!boardContainer) return;

    // Tạo lớp riêng quanh bàn cờ.
    // Không thêm phần tử vào bên trong lưới 225 ô.
    const stage = document.createElement("div");
    stage.className = "caro-reaction-stage";
    stage.id = "caroReactionStage";

    boardContainer.insertBefore(stage, boardEl);
    stage.appendChild(boardEl);

    const overlay = document.createElement("div");
    overlay.id = "reactionOverlay";
    overlay.setAttribute("aria-hidden", "true");
    stage.appendChild(overlay);

    // Thanh emoji nằm bên dưới bàn cờ.
    const toolbar = document.createElement("div");
    toolbar.id = "reactionToolbar";

    reactionList.forEach(emoji => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = emoji;
      button.title = "Gửi biểu cảm " + emoji;
      button.setAttribute("aria-label", "Gửi emoji " + emoji);

      button.addEventListener("click", () => {
        if (
          !registered ||
          !isActiveViewer() ||
          state?.winner ||
          !socket.connected
        ) {
          return;
        }

        socket.emit("reaction:send", {
          emoji,
          x: 15 + Math.random() * 70,
          y: 35 + Math.random() * 35
        });
      });

      reactionButtons.push(button);
      toolbar.appendChild(button);
    });

    boardContainer.appendChild(toolbar);
    updateReactionControls();
  }

  function showFloatingReaction(data) {
    const overlay = $("reactionOverlay");

    if (
      !overlay ||
      !data ||
      !reactionList.includes(data.emoji)
    ) {
      return;
    }

    const item = document.createElement("span");
    item.textContent = data.emoji;

    const x = Number.isFinite(Number(data.x))
      ? Math.max(10, Math.min(90, Number(data.x)))
      : 50;

    const y = Number.isFinite(Number(data.y))
      ? Math.max(10, Math.min(90, Number(data.y)))
      : 50;

    item.style.cssText = `
      position: absolute;
      left: ${x}%;
      top: ${y}%;
      font-size: clamp(25px, 5vw, 42px);
      pointer-events: none;
      transform: translate(-50%, 0);
      animation: caroReactionFloat 2.2s ease-out forwards;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,.35));
      will-change: transform, opacity;
    `;

    overlay.appendChild(item);

    setTimeout(() => {
      item.remove();
    }, 2300);
  }

  socket.on("reaction:show", showFloatingReaction);

  // ========================================================
  // NHẬN TRẠNG THÁI
  // ========================================================

  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    const previous = state;

    detectChanges(previous, s);

    if (previous && previous.roundId !== s.roundId) {
      pendingMove = false;
    }

    state = s;

    if (previous && previous.board) {
      const changed = s.board.some(
        (piece, index) => piece !== previous.board[index]
      );

      if (changed) pendingMove = false;
    }

    renderInfo(s);
    renderBoard(s);
    renderRematch(s);
    updateReactionControls();
  }

  // ========================================================
  // SOCKET EVENTS
  // ========================================================

  socket.on("connect", () => {
    console.log("Caro LIVE đã kết nối:", socket.id);

    if (!username && !askUsername()) return;

    if (registered && username) {
      socket.emit("viewer:register", { username });
    }

    showNotice("Đã kết nối phòng Caro LIVE.");
    updateReactionControls();
  });

  socket.on("state", render);

  socket.on("notice", data => {
    const message =
      typeof data === "string"
        ? data
        : data?.message || data?.text || "";

    if (message) showNotice(message);
  });

  socket.on("viewer:move:accepted", () => {
    pendingMove = false;
    updateBoardControls();
  });

  socket.on("viewer:move:rejected", data => {
    pendingMove = false;
    updateBoardControls();

    showNotice(
      data?.message ||
      "Nước đi chưa được chấp nhận. Vui lòng thử lại."
    );
  });

  socket.on("chat:history", messages => {
    if (!Array.isArray(messages)) return;

    if (chatMessages) chatMessages.replaceChildren();

    messages.forEach(addChatMessage);
  });

  socket.on("chat:message", addChatMessage);

  socket.on("chat:error", data => {
    setText(
      chatNotice,
      typeof data === "string"
        ? data
        : data?.message ||
          data?.text ||
          "Không gửi được tin nhắn."
    );
  });

  socket.on("disconnect", reason => {
    pendingMove = false;

    updateReactionControls();

    console.warn("Mất kết nối:", reason);

    showNotice("Mất kết nối. Đang tự kết nối lại...");
  });

  socket.on("connect_error", error => {
    console.error("Lỗi kết nối:", error);

    showNotice(
      "Không kết nối được máy chủ. Kiểm tra mạng."
    );
  });

  // ========================================================
  // TẢI TRẠNG THÁI BAN ĐẦU
  // ========================================================

  async function loadInitialState() {
    try {
      const response = await fetch("/api/state", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Không tải được trạng thái.");
      }

      render(await response.json());
    } catch (error) {
      console.warn(error);
    }
  }

  joinBtn?.addEventListener("click", registerViewer);

  if (usernameInput) {
    usernameInput.value = savedName();

    usernameInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        registerViewer();
      }
    });
  }

  username = savedName();
  registered = Boolean(username);

  createBoard();
  installReactionAnimation();
  setupReactions();
  loadInitialState();

  console.log("Caro LIVE client.js đã khởi chạy.");

})();
