
/* =========================================================
   CARO LIVE - ADMIN.JS
   HOST CONTROL PANEL
   - Đăng nhập Admin PIN
   - Bàn cờ 15x15
   - Hàng chờ tự động
   - Chat HOST <-> VIEWER
   - Đồng hồ đếm ngược
   - Đấu lại
   - Kết thúc ván
   - Reset điểm
   - Âm thanh và hiệu ứng
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
    reconnectionAttempts: Infinity
  });

  const $ = id => document.getElementById(id);

  const boardEl = $("board");
  const pinInput = $("pin");

  let state = null;
  let serverClockOffset = 0;
  let hostAuthenticated = false;
  let cells = [];
  let chatMessages = [];

  // ========================================================
  // TIỆN ÍCH
  // ========================================================

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value ?? "");
  }

  function getPin() {
    return String(pinInput?.value || "").trim();
  }

  function showMessage(message) {
    setText("status", message);
  }

  function escapeName(value) {
    return String(value || "").replace(/^@/, "");
  }

  // ========================================================
  // GỌI API QUẢN TRỊ
  // ========================================================

  async function post(url, body = {}) {
    const pin = getPin();

    if (!pin) {
      alert("Vui lòng nhập Admin PIN.");
      pinInput?.focus();
      return { ok: false };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": pin
        },
        body: JSON.stringify(body),
        cache: "no-store"
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        alert(data.error || "Yêu cầu không thành công.");
        return { ok: false };
      }

      return { ...data, ok: true };

    } catch (error) {
      console.error(error);
      alert("Không kết nối được máy chủ Caro LIVE.");
      return { ok: false };
    }
  }

  // ========================================================
  // XÁC THỰC HOST
  // ========================================================

  function authenticateHost() {
    const pin = getPin();

    if (!pin || !socket.connected) {
      hostAuthenticated = false;
      renderChat();
      updateFixedButtons();
      return;
    }

    hostAuthenticated = false;
    socket.emit("host:authenticate", { pin });

    renderChat();
    updateFixedButtons();
  }

  socket.on("host:authenticated", () => {
    hostAuthenticated = true;

    renderChat();
    updateFixedButtons();

    console.log("Host đã xác thực thành công.");
  });

  socket.on("host:auth-failed", message => {
    hostAuthenticated = false;

    setText(
      "chatNotice",
      message || "Admin PIN không hợp lệ."
    );

    renderChat();
    updateFixedButtons();
  });

  socket.on("connect", () => {
    console.log("Host đã kết nối máy chủ.");

    hostAuthenticated = false;
    authenticateHost();
  });

  socket.on("disconnect", () => {
    hostAuthenticated = false;

    showMessage("Mất kết nối. Đang kết nối lại...");

    renderChat();
    updateFixedButtons();
  });

  socket.on("connect_error", error => {
    console.warn("Socket lỗi:", error.message);
  });

  pinInput?.addEventListener("change", authenticateHost);

  pinInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      authenticateHost();
    }
  });

  // ========================================================
  // ÂM THANH VÀ HIỆU ỨNG
  // ========================================================

  function playEffect(name) {
    try {
      if (
        window.CaroEffects &&
        typeof window.CaroEffects[name] === "function"
      ) {
        window.CaroEffects[name]();
      }

      if (
        window.CaroSound &&
        typeof window.CaroSound[name] === "function"
      ) {
        window.CaroSound[name]();
      }
    } catch (error) {
      console.warn("Lỗi hiệu ứng:", error);
    }
  }

  function checkEffects(previous, current) {
    if (!previous || !current) return;

    const oldCount = previous.board.filter(Boolean).length;
    const newCount = current.board.filter(Boolean).length;

    if (newCount > oldCount) {
      playEffect("move");
    }

    if (!previous.winner && current.winner) {
      if (current.winner === "X") {
        playEffect("win");
      } else if (current.winner === "O") {
        playEffect("defeat");
      }
    }
  }

  // ========================================================
  // BÀN CỜ 15 X 15
  // ========================================================

  function createBoard() {
    if (!boardEl) return;

    boardEl.replaceChildren();
    cells = [];

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 225; index++) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);
      cell.disabled = true;

      cell.addEventListener("click", () => {
        hostMove(index);
      });

      cells.push(cell);
      fragment.appendChild(cell);
    }

    boardEl.appendChild(fragment);
  }

  function getLastMoveIndex(s) {
    if (typeof s.lastMove === "number") {
      return s.lastMove;
    }

    if (
      s.lastMove &&
      Number.isInteger(s.lastMove.index)
    ) {
      return s.lastMove.index;
    }

    if (Array.isArray(s.lastMoves) && s.lastMoves.length) {
      const last = s.lastMoves[s.lastMoves.length - 1];

      if (typeof last === "number") return last;

      if (Number.isInteger(last?.index)) {
        return last.index;
      }
    }

    return -1;
  }

  async function hostMove(index) {
    if (!state || !socket.connected) {
      showMessage("Đang mất kết nối máy chủ.");
      return;
    }

    if (
      !state.activePlayer ||
      state.winner ||
      state.turn !== "X" ||
      state.board[index] !== null
    ) {
      return;
    }

    const result = await post("/api/admin/move", { index });

    if (!result.ok && state) {
      renderBoard(state);
    }
  }

  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    if (cells.length !== 225) {
      createBoard();
    }

    const lastIndex = getLastMoveIndex(s);

    s.board.forEach((value, index) => {
      const cell = cells[index];
      if (!cell) return;

      const oldValue = cell.dataset.piece || "";

      if (oldValue !== (value || "")) {
        cell.replaceChildren();
        cell.className = "cell";
        delete cell.dataset.piece;

        if (value === "X" || value === "O") {
          cell.dataset.piece = value;

          cell.classList.add(
            value === "X" ? "piece-x" : "piece-o"
          );

          const stone = document.createElement("span");
          stone.className = "stone";
          stone.setAttribute("aria-hidden", "true");

          cell.appendChild(stone);
        }
      }

      cell.classList.toggle(
        "last-move",
        index === lastIndex
      );

      const canPlay =
        value === null &&
        !s.winner &&
        Boolean(s.activePlayer) &&
        s.turn === "X";

      cell.disabled = !canPlay;

      cell.setAttribute(
        "aria-label",
        value
          ? `Ô ${index + 1}: quân ${value}`
          : `Ô trống ${index + 1}`
      );
    });
  }

  // ========================================================
  // HÀNG CHỜ
  // ========================================================

  function getPlayerName(player) {
    if (typeof player === "string") {
      return escapeName(player);
    }

    return escapeName(
      player?.username ||
      player?.name ||
      ""
    );
  }

  function renderQueue(s) {
    const container = $("queue");
    if (!container) return;

    container.replaceChildren();

    const players = Array.isArray(s.queue)
      ? s.queue
      : [];

    setText("queueCount", players.length);

    if (!players.length) {
      container.textContent =
        "Chưa có người chơi trong hàng chờ.";
      return;
    }

    players.forEach(player => {
      const username = getPlayerName(player);
      if (!username) return;

      const row = document.createElement("div");
      row.className = "queue-item";

      const label = document.createElement("span");
      label.textContent = "@" + username;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "▶ CHỌN ĐẤU";
      button.disabled = Boolean(s.activePlayer);

      button.addEventListener("click", async () => {
        if (!hostAuthenticated) {
          alert("Vui lòng đăng nhập Admin PIN.");
          return;
        }

        if (state?.activePlayer) {
          alert("Đang có người chơi trong trận.");
          return;
        }

        if (!confirm(`Chọn @${username} vào đấu?`)) {
          return;
        }

        const result = await post(
          "/api/admin/select",
          { username }
        );

        if (result.ok) {
          showMessage(`Đã chọn @${username} vào trận.`);
        }
      });

      row.append(label, button);
      container.appendChild(row);
    });
  }

  // ========================================================
  // THÔNG TIN NGƯỜI CHƠI VÀ ĐIỂM SỐ
  // ========================================================

  function renderInfo(s) {
    if (s.winner === "X") {
      showMessage("🏆 Chủ LIVE chiến thắng!");

    } else if (s.winner === "O") {
      showMessage(
        `🏆 @${s.activePlayer || "Người chơi"} chiến thắng!`
      );

    } else if (s.winner === "D") {
      showMessage("🤝 Ván đấu hòa!");

    } else if (!s.activePlayer) {
      showMessage("Đang chờ chủ LIVE chọn người chơi.");

    } else if (s.turn === "X") {
      showMessage("Đến lượt chủ LIVE đánh quân X.");

    } else {
      showMessage(
        `Đến lượt @${s.activePlayer} đánh quân O.`
      );
    }

    setText("hostScore", s.scores?.host ?? 0);
    setText("viewerScore", s.scores?.viewers ?? 0);

    setText(
      "opponent",
      s.activePlayer
        ? "@" + s.activePlayer
        : "Chưa chọn"
    );

    setText("host", s.host || "@mbbb1118");
  }

  // ========================================================
  // ĐỒNG HỒ ĐẾM NGƯỢC
  // ========================================================

  function renderTimer() {
    const panel = $("timerPanel");
    const owner = $("timerOwner");
    const number = $("timerNumber");
    const message = $("timerMessage");

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

    if (
      s.winner ||
      !Number.isFinite(deadline) ||
      deadline <= 0
    ) {
      panel.classList.add("timer-idle");

      if (s.winner) {
        panel.classList.add("timer-finished");

        if (owner) {
          owner.textContent = "🏁 VÁN ĐẤU ĐÃ KẾT THÚC";
        }

        number.textContent = "0";

        if (message) {
          message.textContent =
            s.winner === "D"
              ? "Ván đấu hòa!"
              : s.winner === "X"
                ? "Chủ LIVE chiến thắng!"
                : "Người chơi chiến thắng!";
        }

      } else {
        if (owner) {
          owner.textContent = "⏳ ĐANG CHỜ LƯỢT";
        }

        number.textContent = String(s.turnTime || 30);

        if (message) {
          message.textContent =
            "Đang chờ chủ LIVE chọn người chơi.";
        }
      }

      return;
    }

    const isHostTurn = s.turn === "X";

    panel.classList.add(
      isHostTurn ? "timer-host" : "timer-viewer"
    );

    if (owner) {
      owner.textContent = isHostTurn
        ? "❌ LƯỢT CHỦ LIVE (X)"
        : `⭕ LƯỢT @${s.activePlayer || "NGƯỜI CHƠI"} (O)`;
    }

    const now = Date.now() + serverClockOffset;
    const remainingMs = Math.max(0, deadline - now);
    const seconds = Math.ceil(remainingMs / 1000);

    number.textContent = String(seconds);

    if (message) {
      message.textContent = seconds <= 5
        ? "⚠️ Nhanh tay! Sắp hết giờ!"
        : isHostTurn
          ? "Chủ LIVE đang có lượt đánh"
          : `Đang chờ @${s.activePlayer} đánh`;
    }

    if (seconds <= 5) {
      panel.classList.add("timer-warning");
    }

    if (seconds <= 0) {
      panel.classList.add("timer-finished");
    }
  }

  // ========================================================
  // TÁI ĐẤU - KHUNG THÔNG BÁO
  // ========================================================

  function renderRematch(s) {
    const panel = $("rematchPanel");
    if (!panel) return;

    panel.replaceChildren();

    if (!s.winner || s.winner === "D" || !s.activePlayer) {
      panel.hidden = true;
      updateFixedButtons();
      return;
    }

    panel.hidden = false;

    const title = document.createElement("strong");
    const description = document.createElement("p");

    panel.append(title, description);

    if (s.rematchRequest === "viewer") {
      title.textContent = "Người xem muốn đấu lại!";
      description.textContent =
        `@${s.activePlayer} đang chờ chủ LIVE xác nhận.`;

    } else if (s.rematchRequest === "host") {
      title.textContent = "Đã gửi yêu cầu đấu lại!";
      description.textContent =
        `Đang chờ @${s.activePlayer} xác nhận.`;

    } else {
      title.textContent = "Ván đấu đã kết thúc!";
      description.textContent =
        `Bạn có thể mời @${s.activePlayer} đấu lại.`;
    }

    updateFixedButtons();
  }

  // ========================================================
  // NÚT ĐIỀU KHIỂN CỐ ĐỊNH
  // ========================================================

  function updateFixedButtons() {
    const rematchButton = $("rematchConfirm");
    const endButton = $("endMatch");
    const nextButton = $("next");

    const hasPlayer = Boolean(state?.activePlayer);
    const hasWinner = Boolean(state?.winner);
    const canControl = hostAuthenticated;

    if (rematchButton) {
      rematchButton.disabled = !(
        canControl &&
        hasPlayer &&
        hasWinner &&
        state.winner !== "D" &&
        state.rematchRequest !== "host"
      );

      if (state?.rematchRequest === "viewer") {
        rematchButton.textContent = "✓ ĐỒNG Ý ĐẤU LẠI";
      } else if (state?.rematchRequest === "host") {
        rematchButton.textContent = "⌛ ĐANG CHỜ XÁC NHẬN";
      } else {
        rematchButton.textContent = "🔄 ĐẤU LẠI";
      }
    }

    if (endButton) {
      endButton.disabled = !(
        canControl && hasPlayer
      );
    }

    if (nextButton) {
      nextButton.disabled = !canControl;
    }
  }

  // ========================================================
  // CHAT HOST - VIEWER
  // ========================================================

  function renderChat() {
    const container = $("chatMessages");
    const input = $("chatInput");
    const send = $("chatSend");
    const notice = $("chatNotice");

    if (!container) return;

    container.replaceChildren();

    if (!chatMessages.length) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.textContent = "Chưa có tin nhắn.";
      container.appendChild(empty);

    } else {
      chatMessages.forEach(message => {
        appendChatMessage(message, false);
      });
    }

    container.scrollTop = container.scrollHeight;

    const canChat = Boolean(
      hostAuthenticated &&
      state?.activePlayer
    );

    if (input) input.disabled = !canChat;
    if (send) send.disabled = !canChat;

    if (notice) {
      notice.textContent = !hostAuthenticated
        ? "Nhập Admin PIN để kết nối chat."
        : !state?.activePlayer
          ? "Chưa có người chơi đang đấu."
          : `Đang trò chuyện với @${state.activePlayer}`;
    }
  }

  function appendChatMessage(message, scroll = true) {
    const container = $("chatMessages");
    if (!container) return;

    const empty = container.querySelector(".chat-empty");
    if (empty) empty.remove();

    const row = document.createElement("div");

    const isHost = message?.sender === "host";

    row.className =
      "chat-message " + (isHost ? "host" : "viewer");

    const name = document.createElement("b");

    name.textContent = isHost
      ? "CHỦ LIVE"
      : "@" + String(message?.username || "Người chơi");

    const content = document.createElement("div");
    content.textContent = String(message?.message || "");

    row.append(name, content);
    container.appendChild(row);

    if (scroll) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function sendChat() {
    const input = $("chatInput");
    const text = String(input?.value || "").trim();

    if (!text) return;

    if (!hostAuthenticated) {
      setText("chatNotice", "Chưa xác thực Admin PIN.");
      return;
    }

    if (!state?.activePlayer) {
      setText("chatNotice", "Chưa có người chơi để trò chuyện.");
      return;
    }

    if (!socket.connected) {
      setText("chatNotice", "Mất kết nối máy chủ.");
      return;
    }

    socket.emit("chat:send", {
      message: text
    });

    if (input) {
      input.value = "";
      input.focus();
    }
  }

  $("chatSend")?.addEventListener("click", sendChat);

  $("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChat();
    }
  });

  socket.on("chat:history", messages => {
    chatMessages = Array.isArray(messages)
      ? messages.slice(-50)
      : [];

    renderChat();
  });

  socket.on("chat:message", message => {
    if (!message) return;

    if (
      message.id &&
      chatMessages.some(item => item.id === message.id)
    ) {
      return;
    }

    chatMessages.push(message);

    if (chatMessages.length > 50) {
      chatMessages = chatMessages.slice(-50);
    }

    appendChatMessage(message);
  });

  socket.on("chat:error", message => {
    setText(
      "chatNotice",
      typeof message === "string"
        ? message
        : message?.message || "Không gửi được tin nhắn."
    );
  });

  // ========================================================
  // NHẬN TRẠNG THÁI SERVER
  // ========================================================

  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    const previous = state;

    checkEffects(previous, s);

    state = s;

    if (Number.isFinite(Number(s.serverTime))) {
      serverClockOffset =
        Number(s.serverTime) - Date.now();
    }

    renderInfo(s);
    renderBoard(s);
    renderQueue(s);
    renderTimer();
    renderRematch(s);
    renderChat();
    updateFixedButtons();
  }

  socket.on("state", render);

  // ========================================================
  // CHỌN ĐẤU / VÁN MỚI
  // API /api/admin/next
  // ========================================================

  async function nextMatch() {
    if (!hostAuthenticated) {
      alert("Vui lòng đăng nhập Admin PIN.");
      return;
    }

    if (!state?.activePlayer) {
      alert("Hiện chưa có người chơi đang đấu.");
      return;
    }

    if (!confirm("Kết thúc ván hiện tại và chuyển sang người tiếp theo?")) {
      return;
    }

    await post("/api/admin/next");
  }

  $("next")?.addEventListener("click", nextMatch);

  // ========================================================
  // KẾT THÚC VÁN
  // ========================================================

  $("endMatch")?.addEventListener("click", async () => {
    if (!hostAuthenticated) {
      alert("Vui lòng đăng nhập Admin PIN.");
      return;
    }

    if (!state?.activePlayer) {
      alert("Hiện không có trận đấu đang diễn ra.");
      return;
    }

    if (!confirm("Kết thúc ván và chuyển người chơi tiếp theo?")) {
      return;
    }

    await post("/api/admin/next");
  });

  // ========================================================
  // ĐẤU LẠI
  // ========================================================

  async function handleRematch() {
    if (!hostAuthenticated) {
      alert("Vui lòng đăng nhập Admin PIN.");
      return;
    }

    if (!state?.activePlayer || !state?.winner) {
      alert("Chưa có ván đấu kết thúc để đấu lại.");
      return;
    }

    if (state.winner === "D") {
      alert("Ván hòa không hỗ trợ yêu cầu đấu lại theo luồng hiện tại.");
      return;
    }

    if (state.rematchRequest === "host") {
      alert("Đang chờ người chơi xác nhận.");
      return;
    }

    if (state.rematchRequest === "viewer") {
      if (!confirm("Người chơi đã yêu cầu đấu lại. Đồng ý?")) {
        return;
      }

      await post("/api/admin/rematch-confirm");
      return;
    }

    if (!confirm(`Mời @${state.activePlayer} đấu lại?`)) {
      return;
    }

    await post("/api/admin/rematch-request");
  }

  $("rematchConfirm")?.addEventListener("click", handleRematch);

  // ========================================================
  // RESET ĐIỂM
  // ========================================================

  $("reset")?.addEventListener("click", async () => {
    if (!hostAuthenticated) {
      alert("Vui lòng đăng nhập Admin PIN.");
      return;
    }

    if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) {
      return;
    }

    const result = await post("/api/admin/reset-score");

    if (result.ok) {
      playEffect("reset");
    }
  });

  // ========================================================
  // THÊM NGƯỜI CHƠI THỦ CÔNG
  // ========================================================

  $("addPlayer")?.addEventListener("click", async () => {
    if (!hostAuthenticated) {
      alert("Vui lòng đăng nhập Admin PIN.");
      return;
    }

    const input = $("giftUser");
    const username = String(input?.value || "").trim();

    if (!username) {
      alert("Nhập tên TikTok người chơi.");
      input?.focus();
      return;
    }

    const result = await post("/api/admin/add-player", {
      username,
      giftName: "Đã xác nhận thủ công"
    });

    if (result.ok && input) {
      input.value = "";
    }
  });

  $("giftUser")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("addPlayer")?.click();
    }
  });

  // ========================================================
  // ÂM THANH
  // sound.js tự quản lý click
  // ========================================================

  function updateSoundButton() {
    const button = $("soundToggle");
    if (!button || !window.CaroSound) return;

    const enabled = window.CaroSound.isEnabled();

    button.textContent = enabled ? "🔊" : "🔇";
    button.title = enabled ? "Tắt âm thanh" : "Bật âm thanh";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(enabled));
  }

  $("soundToggle")?.addEventListener("click", () => {
    setTimeout(updateSoundButton, 50);
  });

  // ========================================================
  // CẬP NHẬT ĐỒNG HỒ
  // ========================================================

  setInterval(() => {
    if (state) renderTimer();
  }, 200);

  // ========================================================
  // KHỞI ĐỘNG
  // ========================================================

  createBoard();
  renderChat();
  updateSoundButton();
  updateFixedButtons();

  fetch("/api/state", {
    cache: "no-store"
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Không tải được trạng thái.");
      }

      return response.json();
    })
    .then(render)
    .catch(error => {
      console.warn("Lỗi tải trạng thái:", error);
    });

  console.log("Caro LIVE Admin đã khởi chạy.");

})();
