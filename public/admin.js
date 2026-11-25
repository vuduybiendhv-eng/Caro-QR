
(() => {
  const socket = io();

  const boardEl = document.getElementById("board");
  let state = null;
  let serverClockOffset = 0;

  const pin = () =>
    document.getElementById("pin")?.value || "";

  // PHÁT HIỆU ỨNG VÀ ÂM THANH
  function playEffect(name) {
    try {
      const effects = window.CaroEffects;

      if (effects && typeof effects[name] === "function") {
        effects[name]();
      }

      const sound = window.CaroSound;

      if (sound && typeof sound[name] === "function") {
        sound[name]();
      }
    } catch (error) {
      console.warn("Không chạy được hiệu ứng:", name, error);
    }
  }

  // KIỂM TRA KHI CÓ QUÂN MỚI HOẶC KẾT THÚC VÁN
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

      if (!response.ok) {
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

    if (className) button.className = className;

    button.addEventListener("click", action);

    return button;
  }

  // ĐỒNG HỒ CÁT
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

    if (s.winner || !Number.isFinite(deadline) || deadline <= 0) {
      panel.classList.add("timer-idle");

      if (s.winner) {
        if (owner) owner.textContent = "🏁 VÁN ĐẤU ĐÃ KẾT THÚC";
        number.textContent = "0";

        if (message) {
          message.textContent =
            s.winner === "X"
              ? "Chủ LIVE chiến thắng!"
              : "Người chơi chiến thắng!";
        }
      } else {
        if (owner) owner.textContent = "⏳ ĐANG CHỜ LƯỢT CHƠI";
        number.textContent = "30";

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
    const progress = Math.max(0, Math.min(1, remainingMs / totalTime));

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

  // VẼ BÀN CỜ
  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    boardEl.innerHTML = "";

    s.board.forEach((value, index) => {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";

      if (value === "X") cell.classList.add("X", "piece-x");
      if (value === "O") cell.classList.add("O", "piece-o");

      if (value === "X" || value === "O") {
        const stone = document.createElement("span");
        stone.className = "stone";
        stone.setAttribute("aria-hidden", "true");
        cell.appendChild(stone);
      }

      cell.disabled =
        !!value ||
        !!s.winner ||
        s.turn !== "X";

      cell.addEventListener("click", async () => {
        if (
          !state ||
          state.board[index] ||
          state.winner ||
          state.turn !== "X"
        ) return;

        cell.disabled = true;

        const result = await post("/api/admin/move", { index });

        if (!result.ok && state) {
          renderBoard(state);
        }
      });

      boardEl.appendChild(cell);
    });
  }

  // DANH SÁCH CHỜ DUYỆT
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

      const label = document.createElement("span");
      label.textContent = "@" + player.username + " · Chờ duyệt";

      const approve = createButton("✓ Duyệt", async () => {
        const result = await post(
          "/api/admin/approve-player",
          { username: player.username }
        );

        if (result.ok) {
          alert("Đã duyệt @" + player.username);
        }
      });

      const reject = createButton("✕ Từ chối", async () => {
        if (!confirm("Từ chối @" + player.username + "?")) return;

        await post("/api/admin/reject-player", {
          username: player.username
        });
      });

      row.append(label, approve, reject);
      pending.appendChild(row);
    });
  }

  // DANH SÁCH ĐÃ DUYỆT
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

      const label = document.createElement("span");
      label.textContent = "@" + player.username;

      const button = createButton("Chọn đấu", async () => {
        await post("/api/admin/select", {
          username: player.username
        });
      });

      row.append(label, button);
      queue.appendChild(row);
    });
  }

  // THÔNG TIN VÀ ĐIỂM
  function renderInfo(s) {
    const status = document.getElementById("status");

    if (status) {
      status.textContent = s.winner
        ? (
            s.winner === "X"
              ? "Kết quả: Chủ LIVE thắng!"
              : `Kết quả: @${s.activePlayer} thắng!`
          )
        : (
            s.turn === "X"
              ? "Đến lượt chủ LIVE (X)"
              : `Đến lượt @${s.activePlayer || "người xem"} (O)`
          );
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

  // NHẬN TRẠNG THÁI
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

    console.log(
      "Đã cập nhật bàn cờ:",
      s.turn,
      s.board.filter(Boolean).length,
      "quân"
    );
  }

  // CẬP NHẬT ĐỒNG HỒ MỖI 200 MILI GIÂY
  setInterval(() => {
    if (state) renderTimer();
  }, 200);

  // SOCKET.IO
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

  // KẾT THÚC VÁN / VÁN MỚI
  document.getElementById("next")?.addEventListener(
    "click",
    async () => {
      if (!confirm("Kết thúc ván và bắt đầu ván mới?")) return;

      await post("/api/admin/next");
    }
  );

  // RESET ĐIỂM
  document.getElementById("reset")?.addEventListener(
    "click",
    async () => {
      if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) return;

      await post("/api/admin/reset-score");
    }
  );

  // THÊM NGƯỜI CHƠI THỦ CÔNG
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

  // BẬT / TẮT ÂM THANH
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
