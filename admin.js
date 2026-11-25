
const socket = io();
const boardEl = document.getElementById("board");

let state = null;

const pin = () => document.getElementById("pin")?.value || "";

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

function render(s) {
  if (!s || !Array.isArray(s.board) || !boardEl) return;

  state = s;

  const status = document.getElementById("status");

  if (status) {
    status.textContent = s.winner
      ? `Kết quả: ${s.winner} thắng`
      : `Lượt: ${s.turn}`;
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

    cell.disabled = !!value || !!s.winner || s.turn !== "X";

    cell.addEventListener("click", async () => {
      if (!state || state.board[index] || state.turn !== "X" || state.winner) {
        return;
      }

      await post("/api/admin/move", { index });
    });

    boardEl.appendChild(cell);
  });

  // DANH SACH CHO DUYET
  const pending = document.getElementById("pendingQueue");

  if (pending) {
    pending.innerHTML = "";

    const pendingList = s.pendingQueue || [];

    if (!pendingList.length) {
      pending.textContent = "Chưa có yêu cầu đăng ký mới.";
    }

    pendingList.forEach(player => {
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

  // DANH SACH DA DUOC DUYET
  const queue = document.getElementById("queue");

  if (queue) {
    queue.innerHTML = "";

    const players = s.queue || [];

    if (!players.length) {
      queue.textContent = "Chưa có người chơi được duyệt.";
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

  // DIEM SO
  const hostScore = document.getElementById("hostScore");
  const viewerScore = document.getElementById("viewerScore");

  if (hostScore) hostScore.textContent = s.scores?.host ?? 0;
  if (viewerScore) viewerScore.textContent = s.scores?.viewers ?? 0;

  // DOI THU
  const opponent = document.getElementById("opponent");

  if (opponent) {
    opponent.textContent = s.activePlayer
      ? "@" + s.activePlayer
      : "Chưa chọn";
  }
}

socket.on("state", render);

socket.on("connect", () => {
  console.log("Caro LIVE đã kết nối.");
});

socket.on("disconnect", () => {
  const status = document.getElementById("status");
  if (status) status.textContent = "Mất kết nối máy chủ...";
});

document.getElementById("next")?.addEventListener("click", async () => {
  if (!confirm("Kết thúc ván và bắt đầu ván mới?")) return;
  await post("/api/admin/next");
});

document.getElementById("reset")?.addEventListener("click", async () => {
  if (!confirm("Bạn muốn xóa toàn bộ điểm số?")) return;
  await post("/api/admin/reset-score");
});

document.getElementById("addPlayer")?.addEventListener("click", async () => {
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

  if (result.ok && input) input.value = "";
});
