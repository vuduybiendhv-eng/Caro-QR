
(() => {
  "use strict";

  const socket = io();

  const boardEl = document.getElementById("board");

  let state = null;
  let serverClockOffset = 0;
  let lastBoardCount = 0;
  let lastWinner = null;

  const pin = () =>
    document.getElementById("pin")?.value || "";

  // =========================
  // TẠO KHU VỰC ĐẤU LẠI
  // =========================

  let rematchPanel = document.getElementById("rematchPanel");

  if (!rematchPanel) {
    rematchPanel = document.createElement("section");
    rematchPanel.id = "rematchPanel";
    rematchPanel.className = "rematch-panel";

    const statusEl = document.getElementById("status");

    if (statusEl?.parentNode) {
      statusEl.parentNode.insertBefore(
        rematchPanel,
        statusEl.nextSibling
      );
    } else if (boardEl?.parentNode) {
      boardEl.parentNode.insertBefore(
        rematchPanel,
        boardEl.nextSibling
      );
    }
  }

  rematchPanel.hidden = true;

  // =========================
  // HIỆU ỨNG VÀ ÂM THANH
  // =========================

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
      console.warn("Không chạy được hiệu ứng:", name, error);
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
      playEffect(current.winner === "X" ? "win" : "defeat");
    }
  }

  // =========================
  // GỬI YÊU CẦU ĐẾN SERVER
  // =========================

  async function post(path, body = {}) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": pin()
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok || data.ok === false) {
        alert(data.error || "Có lỗi xảy ra.");
        return { ok: false };
      }

      return data;
    } catch (error) {
      console.error(error);
      alert("Không kết nối được máy chủ Caro LIVE.");
      return { ok: false };
    }
  }

  function createButton(label, action, className = "") {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    if (className) {
      button.className = className;
    }

    button.addEventListener("click", action);

    return button;
  }

  // =========================
  // ĐỒNG HỒ CÁT
  // =========================

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

    if (
      s.winner ||
      !Number.isFinite(deadline) ||
      deadline <= 0
    ) {
      panel.classList.add("timer-idle");

      if (s.winner) {
        if (owner) {
          owner.textContent = "🏁 VÁN ĐẤU ĐÃ KẾT THÚC";
        }

        number.textContent = "0";

        if (message) {
          message.textContent =
            s.winner === "X"
              ? "Chủ LIVE chiến thắng!"
              : "Người chơi chiến thắng!";
        }
      } else {
        if (owner) {
          owner.textContent = "⏳ ĐANG CHỜ LƯỢT CHƠI";
        }

        number.textContent = "30";

        if (message) {
          message.textContent = "Chờ bắt đầu trận đấu";
        }
      }

      if (topSand) {
        topSand.style.transform = "scaleY(1)";
      }

      if (bottomSand) {
        bottomSand.style.transform = "scaleY(0.05)";
      }

      if (stream) {
        stream.style.opacity = "0";
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

    const serverNow = Date.now() + serverClockOffset;
    const remainingMs = Math.max(0, deadline - serverNow);
    const seconds = Math.ceil(remainingMs / 1000);

    const totalTime =
      (Number(s.turnTime) || 30) * 1000;

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

    if (seconds <= 5) {
      panel.classList.add("timer-warning");
    }

    if (seconds <= 0) {
      panel.classList.add("timer-finished");
    }

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

  // =========================
  // XÁC ĐỊNH NƯỚC ĐI MỚI NHẤT
  // =========================

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

  // =========================
  // VẼ BÀN CỜ
  // =========================

  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    const fragment = document.createDocumentFragment();
    const lastIndex = getLastMoveIndex(s);

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

      if (value === "X" || value === "O") {
        const stone = document.createElement("span");

        stone.className = "stone";
        stone.setAttribute("aria-hidden", "true");

        cell.appendChild(stone);
      }

      // Đánh dấu nước đi mới nhất
      if (index === lastIndex) {
        cell.classList.add("last-move");
        cell.title = "Nước đi mới nhất";
      }

      const canHostPlay =
        !value &&
        !s.winner &&
        s.activePlayer &&
        s.turn === "X";

      cell.disabled = !canHostPlay;

      cell.addEventListener("click", async () => {
        if (
          !state ||
          state.board[index] ||
          state.winner ||
          !state.activePlayer ||
          state.turn !== "X"
        ) {
          return;
        }

        cell.disabled = true;

        await post("/api/admin/move", { index });
      });

      fragment.appendChild(cell);
    });

    boardEl.replaceChildren(fragment);
  }

  // =========================
  // DANH SÁCH CHỜ DUYỆT
  // =========================

  function renderPendingQueue(s) {
    const pending = document.getElementById("pendingQueue");
    if (!pending) return;

    pending.innerHTML = "";

    const players = s.pendingQueue || [];

    if (!players.length) {
      pending.textContent = "Chưa có yêu cầu đăng ký mới.";
      return;
    }

    players.forEach(player => {
      const row = document.createElement("div");
      row.className = "queueitem";

      const username = player.username || player.name || "";

      const label = document.createElement("span");
      label.textContent = "@" + username + " · Chờ duyệt";

      const approve = createButton("✓ Duyệt", async () => {
        const result = await post(
          "/api/admin/approve-player",
          { username }
        );

        if (result.ok) {
          alert("Đã duyệt @" + username);
        }
      });

      const reject = createButton("✕ Từ chối", async () => {
        if (!confirm("Từ chối @" + username + "?")) return;

        await post("/api/admin/reject-player", {
          username
        });
      });

      row.append(label, approve, reject);
      pending.appendChild(row);
    });
  }

  // =========================
  // DANH SÁCH ĐÃ DUYỆT
  // =========================

  function renderQueue(s) {
    const queue = document.getElementById("queue");
    if (!queue) return;

    queue.innerHTML = "";

    const players = s.queue || [];

    if (!players.length) {
      queue.textContent = "Chưa có người chơi được duyệt.";
      return;
    }

    players.forEach(player => {
      const row = document.createElement("div");
      row.className = "queueitem";

      const username = player.username || player.name || "";

      const label = document.createElement("span");
      label.textContent = "@" + username;

      const button = createButton("Chọn đấu", async () => {
        await post("/api/admin/select", {
          username
        });
      });

      row.append(label, button);
      queue.appendChild(row);
    });
  }

  // =========================
  // THÔNG TIN VÀ ĐIỂM
  // =========================

  function renderInfo(s) {
    const status = document.getElementById("status");

    if (status) {
      if (s.winner) {
        status.textContent =
          s.winner === "X"
            ? "Kết quả: Chủ LIVE thắng!"
            : `Kết quả: @${s.activePlayer} thắng!`;
      } else if (!s.activePlayer) {
        status.textContent = "Đang chờ chủ LIVE chọn người chơi.";
      } else {
        status.textContent =
          s.turn === "X"
            ? "Đến lượt chủ LIVE (X)"
            : `Đến lượt @${s.activePlayer || "người xem"} (O)`;
      }
    }

    const hostScore = document.getElementById("hostScore");
    const viewerScore = document.getElementById("viewerScore");

    if (hostScore) {
      hostScore.textContent = s.scores?.host ?? 0;
    }

    if (viewerScore) {
      viewerScore.textContent = s.scores?.viewers ?? 0;
    }

    const opponent = document.getElementById("opponent");

    if (opponent) {
      opponent.textContent = s.activePlayer
        ? "@" + s.activePlayer
        : "Chưa chọn";
    }
  }

  // =========================
  // ĐẤU LẠI
  // =========================

  function renderRematch(s) {
    if (!rematchPanel) return;

    if (!s.winner || !s.activePlayer) {
      rematchPanel.hidden = true;
      rematchPanel.innerHTML = "";
      return;
    }

    rematchPanel.hidden = false;

    const request = s.rematchRequest;

    // Người xem đã yêu cầu đấu lại
    if (request === "viewer") {
      rematchPanel.innerHTML = `
        <div class="rematch-content">
          <strong>Người xem muốn đấu lại!</strong>
          <p>@${escapeHTML(s.activePlayer)} đang chờ chủ LIVE xác nhận.</p>
        </div>
      `;

      const confirmButton = createButton(
        "✓ Đồng ý đấu lại",
        async () => {
          if (!confirm("Bắt đầu ván đấu lại với người chơi này?")) {
            return;
          }

          await post("/api/admin/rematch-confirm");
        },
        "rematch-button"
      );

      rematchPanel.querySelector(".rematch-content")
        ?.appendChild(confirmButton);

      return;
    }

    // Chủ LIVE đã yêu cầu đấu lại
    if (request === "host") {
      rematchPanel.innerHTML = `
        <div class="rematch-content">
          <strong>Đã gửi yêu cầu đấu lại!</strong>
          <p>Đang chờ @${escapeHTML(s.activePlayer)} xác nhận.</p>
          <span class="rematch-wait">Vui lòng chờ...</span>
        </div>
      `;

      return;
    }

    // Chưa có yêu cầu đấu lại
    rematchPanel.innerHTML = `
      <div class="rematch-content">
        <strong>Ván đấu đã kết thúc!</strong>
        <p>Bạn có muốn đấu thêm một ván với @${escapeHTML(s.activePlayer)}?</p>
      </div>
    `;

    const requestButton = createButton(
      "↻ Yêu cầu đấu lại",
      async () => {
        if (!confirm("Gửi yêu cầu đấu lại cho người xem?")) {
          return;
        }

        await post("/api/admin/rematch-request");
      },
      "rematch-button"
    );

    rematchPanel.querySelector(".rematch-content")
      ?.appendChild(requestButton);
  }

  // =========================
  // NHẬN TRẠNG THÁI
  // =========================

  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    const previous = state;

    checkEffects(previous, s);

    state = s;

    if (Number.isFinite(Number(s.serverTime))) {
      serverClockOffset = Number(s.serverTime) - Date.now();
    }

    renderInfo(s);
    renderBoard(s);
    renderPendingQueue(s);
    renderQueue(s);
    renderTimer();
    renderRematch(s);

    lastBoardCount = s.board.filter(Boolean).length;
    lastWinner = s.winner || null;
  }

  // =========================
  // CẬP NHẬT ĐỒNG HỒ
  // =========================

  setInterval(() => {
    if (state) renderTimer();
  }, 200);

  // =========================
  // SOCKET.IO
  // =========================

  socket.on("state", render);

  socket.on("connect", () => {
    console.log("Caro LIVE đã kết nối máy chủ.");
  });

  socket.on("disconnect", () => {
    const status = document.getElementById("status");

    if (status) {
      status.textContent = "Mất kết nối máy chủ...";
    }
  });

  socket.on("connect_error", error => {
    console.error("Socket lỗi:", error.message);
  });

  // =========================
  // KẾT THÚC VÁN / VÁN MỚI
  // =========================

  document.getElementById("next")?.addEventListener(
    "click",
    async () => {
      if (!confirm("Kết thúc ván và trở về hàng chờ?")) return;

      await post("/api/admin/next");
    }
  );

  // =========================
  // RESET ĐIỂM
  // =========================

  document.getElementById("reset")?.addEventListener(
    "click",
    async () => {
      if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) return;

      await post("/api/admin/reset-score");
    }
  );

  // =========================
  // THÊM NGƯỜI CHƠI THỦ CÔNG
  // =========================

  document.getElementById("addPlayer")?.addEventListener(
    "click",
    async () => {
      const input = document.getElementById("giftUser");
      const username = input?.value.trim();

      if (!username) {
        alert("Nhập tên TikTok người chơi.");
        return;
      }

      const result = await post("/api/admin/add-player", {
        username,
        giftName: "Đã xác nhận thủ công"
      });

      if (result.ok && input) {
        input.value = "";
      }
    }
  );

  // =========================
  // BẬT / TẮT ÂM THANH
  // =========================

  const soundToggle = document.getElementById("soundToggle");

  function updateSoundButton() {
    if (!soundToggle || !window.CaroSound) return;

    soundToggle.textContent = window.CaroSound.isEnabled()
      ? "🔊 Âm thanh: BẬT"
      : "🔇 Âm thanh: TẮT";
  }

  soundToggle?.addEventListener("click", () => {
    if (!window.CaroSound) {
      alert("Không tìm thấy file sound.js!");
      return;
    }

    const enabled = window.CaroSound.toggle();

    updateSoundButton();

    if (enabled) {
      window.CaroSound.move();
    }
  });

  updateSoundButton();

})();
