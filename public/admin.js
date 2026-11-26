
/* =========================================================
   CARO LIVE - ADMIN.JS
   Chủ LIVE: quản lý hàng chờ, đánh X, chat, đấu lại,
   đồng hồ, điểm số và âm thanh.
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
  let lastRoundId = null;

  // ========================================================
  // TIỆN ÍCH
  // ========================================================

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value ?? "");
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function getPin() {
    return String(pinInput?.value || "").trim();
  }

  function showMessage(message) {
    const status = $("status");
    if (status) status.textContent = message;
  }

  // ========================================================
  // GỬI YÊU CẦU ADMIN
  // ========================================================

  async function post(path, body = {}) {
    const currentPin = getPin();

    if (!currentPin) {
      alert("Vui lòng nhập Admin PIN.");
      pinInput?.focus();
      return { ok: false };
    }

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": currentPin
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

      if (!response.ok || data.ok === false) {
        alert(data.error || "Yêu cầu không thành công.");
        return { ok: false };
      }

      return { ...data, ok: true };
    } catch (error) {
      console.error("Lỗi gửi yêu cầu:", error);
      alert("Không kết nối được máy chủ Caro LIVE.");
      return { ok: false };
    }
  }

  // ========================================================
  // XÁC THỰC CHỦ LIVE QUA SOCKET
  // ========================================================

  function authenticateHost() {
    const currentPin = getPin();

    if (!currentPin || !socket.connected) return;

    socket.emit("host:authenticate", {
      pin: currentPin
    });
  }

  socket.on("host:authenticated", () => {
    hostAuthenticated = true;
    renderChat();
    console.log("Chủ LIVE đã xác thực chat.");
  });

  socket.on("host:auth-error", message => {
    hostAuthenticated = false;
    console.warn("Xác thực chủ LIVE thất bại:", message);
  });

  socket.on("connect", () => {
    console.log("Admin đã kết nối máy chủ.");
    authenticateHost();

    if (state) {
      renderBoard(state);
    }
  });

  socket.on("disconnect", () => {
    hostAuthenticated = false;
    showMessage("Mất kết nối máy chủ. Đang kết nối lại...");
    renderChat();
  });

  socket.on("connect_error", error => {
    console.warn("Socket lỗi:", error.message);
  });

  pinInput?.addEventListener("change", authenticateHost);
  pinInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") authenticateHost();
  });

  // ========================================================
  // ÂM THANH VÀ HIỆU ỨNG
  // ========================================================

  function playEffect(name) {
    try {
      const effects = window.CaroEffects;
      const sound = window.CaroSound;

      if (effects && typeof effects[name] === "function") {
        effects[name]();
      }

      if (sound && typeof sound[name] === "function") {
        sound[name]();
      }
    } catch (error) {
      console.warn("Lỗi hiệu ứng:", name, error);
    }
  }

  function checkEffects(previous, current) {
    if (!previous || !current) return;

    const oldCount = previous.board.filter(Boolean).length;
    const newCount = current.board.filter(Boolean).length;

    // Phát âm thanh khi thực sự có thêm quân.
    if (newCount > oldCount) {
      playEffect("move");
    }

    // Tránh phát lại âm thanh khi server gửi trạng thái mỗi giây.
    if (!previous.winner && current.winner) {
      if (current.winner === "X") {
        playEffect("win");
      } else if (current.winner === "O") {
        playEffect("defeat");
      }
    }
  }

  // ========================================================
  // BÀN CỜ - TẠO MỘT LẦN, KHÔNG NHẤP NHÁY
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
      if (Number.isInteger(last?.index)) return last.index;
    }

    return -1;
  }

  async function hostMove(index) {
    if (!state || !socket.connected) {
      showMessage("Đang mất kết nối máy chủ.");
      return;
    }

    if (
      state.winner ||
      !state.activePlayer ||
      state.turn !== "X" ||
      state.board[index]
    ) {
      return;
    }

    const cell = cells[index];
    if (cell) cell.disabled = true;

    const result = await post("/api/admin/move", { index });

    if (!result.ok && state) {
      renderBoard(state);
    }
  }

  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    if (cells.length !== s.board.length) {
      createBoard();
    }

    const lastIndex = getLastMoveIndex(s);

    s.board.forEach((value, index) => {
      const cell = cells[index];
      if (!cell) return;

      const oldValue = cell.dataset.piece || "";

      if (oldValue !== value) {
        cell.replaceChildren();
        cell.className = "cell";
        delete cell.dataset.piece;

        if (value === "X" || value === "O") {
          cell.dataset.piece = value;
          cell.classList.add(
            value,
            value === "X" ? "piece-x" : "piece-o"
          );

          const stone = document.createElement("span");
          stone.className = "stone";
          stone.setAttribute("aria-hidden", "true");
          cell.appendChild(stone);
        }
      }

      cell.classList.toggle("last-move", index === lastIndex);

      const canPlay =
        !value &&
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
  // HÀNG CHỜ NGƯỜI CHƠI
  // ========================================================

  function getPlayerName(player) {
    if (typeof player === "string") return player;

    return String(
      player?.username ||
      player?.name ||
      ""
    );
  }

  function renderQueue(s) {
    const queue = $("queue");
    if (!queue) return;

    queue.replaceChildren();

    const players = Array.isArray(s.queue) ? s.queue : [];

    if (!players.length) {
      queue.textContent = "Chưa có người chơi trong hàng chờ.";
      return;
    }

    players.forEach(player => {
      const username = getPlayerName(player);
      if (!username) return;

      const row = document.createElement("div");
      row.className = "queueitem";

      const label = document.createElement("span");
      label.textContent = "@" + username;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Chọn đấu";
      button.disabled = Boolean(s.winner === false && false);

      button.addEventListener("click", async () => {
        if (!confirm(`Chọn @${username} vào đấu?`)) return;

        await post("/api/admin/select", { username });
      });

      row.append(label, button);
      queue.appendChild(row);
    });
  }

  // ========================================================
  // THÔNG TIN, ĐIỂM SỐ
  // ========================================================

  function renderInfo(s) {
    if (s.winner === "X") {
      showMessage("Kết quả: Chủ LIVE chiến thắng!");
    } else if (s.winner === "O") {
      showMessage(`Kết quả: @${s.activePlayer || "người chơi"} chiến thắng!`);
    } else if (s.winner === "D") {
      showMessage("Ván đấu hòa!");
    } else if (!s.activePlayer) {
      showMessage("Đang chờ chủ LIVE chọn người chơi.");
    } else if (s.turn === "X") {
      showMessage("Đến lượt chủ LIVE đánh quân X.");
    } else {
      showMessage(`Đến lượt @${s.activePlayer} đánh quân O.`);
    }

    setText("hostScore", s.scores?.host ?? 0);
    setText("viewerScore", s.scores?.viewers ?? 0);

    setText(
      "opponent",
      s.activePlayer ? "@" + s.activePlayer : "Chưa chọn"
    );

    setText(
      "host",
      s.host || "CHỦ LIVE"
    );
  }

  // ========================================================
  // ĐỒNG HỒ CÁT
  // ========================================================

  function renderTimer() {
    const panel = $("timerPanel");
    const owner = $("timerOwner");
    const number = $("timerNumber");
    const message = $("timerMessage");
    const topSand = $("topSand");
    const bottomSand = $("bottomSand");
    const stream = $("sandStream");

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
        if (owner) owner.textContent = "🏁 VÁN ĐẤU ĐÃ KẾT THÚC";
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
        if (owner) owner.textContent = "⏳ ĐANG CHỜ LƯỢT CHƠI";
        number.textContent = String(s.turnTime || 30);

        if (message) message.textContent = "Chờ bắt đầu trận đấu";
      }

      if (topSand) topSand.style.transform = "scaleY(1)";
      if (bottomSand) bottomSand.style.transform = "scaleY(0.05)";
      if (stream) stream.style.opacity = "0";

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

    const serverNow = Date.now() + serverClockOffset;
    const remainingMs = Math.max(0, deadline - serverNow);
    const seconds = Math.ceil(remainingMs / 1000);

    const totalTime = (Number(s.turnTime) || 30) * 1000;

    const progress = Math.max(
      0,
      Math.min(1, remainingMs / totalTime)
    );

    number.textContent = String(seconds);

    if (message) {
      message.textContent = seconds <= 5
        ? "⚠️ Nhanh tay! Sắp hết giờ!"
        : isHostTurn
          ? "Chủ LIVE đang có lượt đánh"
          : `Đang chờ @${s.activePlayer || "người chơi"} đánh`;
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

  // ========================================================
  // KHU VỰC ĐẤU LẠI
  // ========================================================

  function ensureRematchPanel() {
    let panel = $("rematchPanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "rematchPanel";
    panel.className = "rematch-panel";
    panel.hidden = true;

    const status = $("status");

    if (status?.parentNode) {
      status.parentNode.insertBefore(panel, status.nextSibling);
    } else if (boardEl?.parentNode) {
      boardEl.parentNode.insertBefore(panel, boardEl.nextSibling);
    }

    return panel;
  }

  function renderRematch(s) {
    const panel = ensureRematchPanel();
    if (!panel) return;

    panel.replaceChildren();

    if (!s.winner || !s.activePlayer) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;

    const title = document.createElement("strong");
    const description = document.createElement("p");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "rematch-button";

    const request = s.rematchRequest;

    if (request === "viewer") {
      title.textContent = "Người xem muốn đấu lại!";
      description.textContent =
        `@${s.activePlayer} đang chờ chủ LIVE xác nhận.`;

      button.textContent = "✓ Đồng ý đấu lại";

      button.addEventListener("click", async () => {
        if (!confirm("Bắt đầu ván đấu lại với người chơi này?")) return;

        await post("/api/admin/rematch-confirm");
      });

      panel.append(title, description, button);
      return;
    }

    if (request === "host") {
      title.textContent = "Đã gửi yêu cầu đấu lại!";
      description.textContent =
        `Đang chờ @${s.activePlayer} xác nhận.`;

      panel.append(title, description);
      return;
    }

    title.textContent = "Ván đấu đã kết thúc!";
    description.textContent =
      `Bạn có muốn đấu thêm một ván với @${s.activePlayer}?`;

    button.textContent = "↻ Yêu cầu đấu lại";

    button.addEventListener("click", async () => {
      if (!confirm("Gửi yêu cầu đấu lại cho người xem?")) return;

      await post("/api/admin/rematch-request");
    });

    panel.append(title, description, button);
  }

  // ========================================================
  // CHAT CHỦ LIVE - NGƯỜI ĐANG ĐẤU
  // ========================================================

  function ensureChatPanel() {
    let panel = $("chatPanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "chatPanel";
    panel.className = "chat-panel";

    panel.innerHTML = `
      <h2>💬 TIN NHẮN VỚI NGƯỜI CHƠI</h2>
      <div id="chatMessages" class="chat-messages" aria-live="polite">
        <p id="chatEmpty">Tin nhắn giữa chủ LIVE và người đang đấu sẽ hiện ở đây.</p>
      </div>
      <div class="chat-compose">
        <input id="chatInput" type="text" maxlength="300"
          placeholder="Nhập tin nhắn..." autocomplete="off">
        <button id="chatSend" type="button" aria-label="Gửi tin nhắn">➤</button>
      </div>
      <p id="chatNotice" class="chat-notice"></p>
    `;

    const soundbar = document.querySelector(".soundbar");
    const boardSection = boardEl?.closest("section");

    if (soundbar?.parentNode) {
      soundbar.parentNode.insertBefore(panel, soundbar.nextSibling);
    } else if (boardSection) {
      boardSection.appendChild(panel);
    } else {
      document.querySelector("main")?.appendChild(panel);
    }

    addChatStyles();
    $("chatSend")?.addEventListener("click", sendChat);

    $("chatInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendChat();
      }
    });

    return panel;
  }

  function addChatStyles() {
    if ($("adminChatStyles")) return;

    const style = document.createElement("style");
    style.id = "adminChatStyles";

    style.textContent = `
      .chat-panel {
        margin: 16px 0;
        padding: 14px;
        border: 1px solid rgba(190,145,75,.4);
        border-radius: 16px;
        background: rgba(255,248,232,.96);
      }

      .chat-messages {
        height: 190px;
        overflow-y: auto;
        padding: 10px;
        border-radius: 10px;
        background: #fff;
        border: 1px solid #ead9b8;
      }

      .chat-message {
        margin: 7px 0;
        padding: 8px 11px;
        border-radius: 10px;
        background: #f5ead5;
        overflow-wrap: anywhere;
      }

      .chat-message.host-message {
        margin-left: 12%;
        background: #fce2b7;
      }

      .chat-message.viewer-message {
        margin-right: 12%;
        background: #e6f0ff;
      }

      .chat-message strong {
        display: block;
        margin-bottom: 3px;
        font-size: 12px;
      }

      .chat-compose {
        display: flex;
        gap: 8px;
        margin-top: 9px;
      }

      .chat-compose input {
        flex: 1;
        min-width: 0;
      }

      .chat-compose button {
        min-width: 48px;
      }

      .chat-notice {
        min-height: 18px;
        font-size: 12px;
      }
    `;

    document.head.appendChild(style);
  }

  function renderChat() {
    ensureChatPanel();

    const container = $("chatMessages");
    if (!container) return;

    container.replaceChildren();

    if (!chatMessages.length) {
      const empty = document.createElement("p");
      empty.textContent = "Chưa có tin nhắn.";
      container.appendChild(empty);
    }

    chatMessages.forEach(message => {
      appendChatMessage(message, false);
    });

    container.scrollTop = container.scrollHeight;

    const input = $("chatInput");
    const send = $("chatSend");
    const active = Boolean(state?.activePlayer && !state?.winner);

    if (input) input.disabled = !hostAuthenticated || !active;
    if (send) send.disabled = !hostAuthenticated || !active;

    const notice = $("chatNotice");

    if (notice) {
      notice.textContent = !hostAuthenticated
        ? "Nhập Admin PIN để kết nối chat."
        : !active
          ? "Chat sẽ mở khi có người chơi đang đấu."
          : "Đang chat với @" + state.activePlayer;
    }
  }

  function appendChatMessage(message, scroll = true) {
    const container = $("chatMessages");
    if (!container) return;

    const empty = container.querySelector("p");
    if (empty) empty.remove();

    const row = document.createElement("div");
    const isHost = message?.sender === "host";

    row.className = "chat-message " +
      (isHost ? "host-message" : "viewer-message");

    const name = document.createElement("strong");
    name.textContent = isHost
      ? "CHỦ LIVE"
      : "@" + String(message?.username || "Người chơi");

    const content = document.createElement("div");
    content.textContent = String(message?.text || message?.message || "");

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

    if (!state?.activePlayer || state?.winner) {
      setText("chatNotice", "Hiện chưa có người chơi đang đấu.");
      return;
    }

    socket.emit("chat:send", text);

    if (input) {
      input.value = "";
      input.focus();
    }
  }

  socket.on("chat:history", messages => {
    chatMessages = Array.isArray(messages) ? messages.slice(-50) : [];
    renderChat();
  });

  socket.on("chat:message", message => {
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
  // NHẬN TRẠNG THÁI TỪ SERVER
  // ========================================================

  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    const previous = state;

    checkEffects(previous, s);

    state = s;

    if (Number.isFinite(Number(s.serverTime))) {
      serverClockOffset = Number(s.serverTime) - Date.now();
    }

    if (s.roundId !== undefined) {
      lastRoundId = s.roundId;
    }

    renderInfo(s);
    renderBoard(s);
    renderQueue(s);
    renderTimer();
    renderRematch(s);
    renderChat();
  }

  socket.on("state", render);

  // ========================================================
  // NÚT KẾT THÚC VÁN / VÁN MỚI
  // ========================================================

  $("next")?.addEventListener("click", async () => {
    if (!confirm("Kết thúc ván và trở về hàng chờ?")) return;

    await post("/api/admin/next");
  });

  // ========================================================
  // RESET ĐIỂM
  // ========================================================

  $("reset")?.addEventListener("click", async () => {
    if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) return;

    const result = await post("/api/admin/reset-score");

    if (result.ok) {
      playEffect("reset");
    }
  });

  // ========================================================
  // THÊM NGƯỜI CHƠI THỦ CÔNG
  // ========================================================

  $("addPlayer")?.addEventListener("click", async () => {
    const input = $("giftUser");
    const username = String(input?.value || "").trim();

    if (!username) {
      alert("Nhập tên TikTok người tặng quà.");
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

  // ========================================================
  // NÚT ÂM THANH
  // sound.js tự quản lý sự kiện click.
  // Không thêm listener ở admin.js để tránh bật/tắt hai lần.
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

  // ========================================================
  // ĐỒNG HỒ CẬP NHẬT LIÊN TỤC
  // ========================================================

  setInterval(() => {
    if (state) renderTimer();
  }, 200);

  // ========================================================
  // KHỞI ĐỘNG
  // ========================================================

  createBoard();
  ensureRematchPanel();
  ensureChatPanel();
  renderChat();
  updateSoundButton();

  fetch("/api/state", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error("Không tải được trạng thái.");
      return response.json();
    })
    .then(render)
    .catch(error => {
      console.warn("Không tải được trạng thái ban đầu:", error);
    });

  console.log("Caro LIVE Admin đã khởi chạy.");
})();
w
