
(() => {
  const socket = io();

  const boardEl = document.getElementById("board");
  let state = null;

  const pin = () =>
    document.getElementById("pin")?.value || "";

  // GỬI YÊU CẦU ĐẾN SERVER
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

  // TẠO NÚT
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

  // VẼ BÀN CỜ
  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    boardEl.innerHTML = "";

    s.board.forEach((value, index) => {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";

      // QUÂN X - VÀNG ĐỒNG
      if (value === "X") {
        cell.classList.add("X", "piece-x");
      }

      // QUÂN O - XANH NGỌC
      if (value === "O") {
        cell.classList.add("O", "piece-o");
      }

      // TẠO HÌNH QUÂN CỜ
      if (value === "X" || value === "O") {
        const stone = document.createElement("span");

        stone.className = "stone";
        stone.setAttribute("aria-hidden", "true");

        cell.appendChild(stone);
      }

      // CHỈ CHO HOST ĐÁNH KHI ĐẾN LƯỢT X
      cell.disabled =
        !!value ||
        !!s.winner ||
        s.turn !== "X";

      // HOST ĐÁNH QUÂN X
      cell.addEventListener("click", async () => {
        if (
          !state ||
          state.board[index] ||
          state.winner ||
          state.turn !== "X"
        ) {
          return;
        }

        cell.disabled = true;

        const result = await post("/api/admin/move", {
          index
        });

        if (!result.ok && state) {
          render(state);
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

      const approve = createButton(
        "✓ Duyệt",
        async () => {
          const result = await post(
            "/api/admin/approve-player",
            { username: player.username }
          );

          if (result.ok) {
            alert("Đã duyệt @" + player.username);
          }
        }
      );

      const reject = createButton(
        "✕ Từ chối",
        async () => {
          if (!confirm("Từ chối @" + player.username + "?")) {
            return;
          }

          await post("/api/admin/reject-player", {
            username: player.username
          });
        }
      );

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

      const button = createButton(
        "Chọn đấu",
        async () => {
          await post("/api/admin/select", {
            username: player.username
          });
        }
      );

      row.append(label, button);
      queue.appendChild(row);
    });
  }

  // CẬP NHẬT ĐIỂM VÀ THÔNG TIN
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

  // NHẬN TRẠNG THÁI MỚI TỪ SERVER
  function render(s) {
    if (!s || !Array.isArray(s.board)) return;

    state = s;

    renderInfo(s);
    renderBoard(s);
    renderPendingQueue(s);
    renderQueue(s);

    console.log(
      "Đã cập nhật bàn cờ:",
      s.turn,
      s.board.filter(Boolean).length,
      "quân"
    );
  }

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
      if (!confirm("Kết thúc ván và bắt đầu ván mới?")) {
        return;
      }

      await post("/api/admin/next");
    }
  );

  // RESET ĐIỂM
  document.getElementById("reset")?.addEventListener(
    "click",
    async () => {
      if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) {
        return;
      }

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

})();
