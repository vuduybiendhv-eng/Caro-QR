
const socket = io();
const boardEl = document.getElementById("board");

let state = null;
let firstState = true;

const pin = () => document.getElementById("pin")?.value || "";

const soundButton = document.getElementById("soundToggle");

if (soundButton) {
  soundButton.onclick = () => {
    const on = CaroSound.toggle();

    soundButton.textContent = on
      ? "🔊 Bật âm thanh"
      : "🔇 Tắt âm thanh";

    soundButton.classList.toggle("off", !on);
  };
}

// GỬI YÊU CẦU LÊN MÁY CHỦ
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
      return data;
    }

    return data;
  } catch (error) {
    alert("Không kết nối được máy chủ. Hãy thử lại.");
    return { ok: false };
  }
}

// TẠO DÒNG NGƯỜI CHƠI
function createPlayerRow(player, type) {
  const row = document.createElement("div");
  row.className = "queueitem";

  const label = document.createElement("span");
  label.textContent = `@${player.username}`;

  row.appendChild(label);

  if (type === "pending") {
    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.textContent = "✓ Duyệt";

    approveButton.onclick = async () => {
      approveButton.disabled = true;

      const result = await post("/api/admin/approve-player", {
        username: player.username
      });

      if (!result.ok) approveButton.disabled = false;
    };

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.textContent = "✕ Từ chối";

    rejectButton.onclick = async () => {
      if (!confirm(`Từ chối yêu cầu của @${player.username}?`)) return;

      rejectButton.disabled = true;

      const result = await post("/api/admin/reject-player", {
        username: player.username
      });

      if (!result.ok) rejectButton.disabled = false;
    };

    row.append(approveButton, rejectButton);
  }

  if (type === "approved") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Chọn đấu";

    button.onclick = () => {
      post("/api/admin/select", {
        username: player.username
      });
    };

    row.appendChild(button);
  }

  return row;
}

// HIỂN THỊ DANH SÁCH
function renderLists(s) {
  const pendingEl = document.getElementById("pendingQueue");
  const queueEl = document.getElementById("queue");

  // NGƯỜI XEM ĐANG CHỜ DUYỆT
  if (pendingEl) {
    pendingEl.innerHTML = "";

    const pending = Array.isArray(s.pendingQueue)
      ? s.pendingQueue
      : [];

    if (!pending.length) {
      pendingEl.textContent = "Chưa có yêu cầu đăng ký mới.";
    } else {
      pending.forEach(player => {
        pendingEl.appendChild(
          createPlayerRow(player, "pending")
        );
      });
    }
  }

  // NGƯỜI ĐÃ ĐƯỢC DUYỆT
  if (queueEl) {
    queueEl.innerHTML = "";

    const queue = Array.isArray(s.queue) ? s.queue : [];

    if (!queue.length) {
      queueEl.textContent = "Chưa có người chơi đã được duyệt.";
    } else {
      queue.forEach(player => {
        queueEl.appendChild(
          createPlayerRow(player, "approved")
        );
      });
    }
  }
}

// HIỂN THỊ BÀN CỜ VÀ TRẠNG THÁI
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  if (state && !firstState) {
    const oldCount = state.board.filter(Boolean).length;
    const newCount = s.board.filter(Boolean).length;

    if (
      s.queue &&
      state.queue &&
      s.queue.length > state.queue.length
    ) {
      CaroSound.join();
    }

    if (newCount > oldCount) {
      CaroSound.move();
    }

    if (!state.winner && s.winner) {
      CaroSound.win();

      if (window.CaroEffects) {
        if (s.winner === "X") {
          CaroEffects.win("CHỦ LIVE CHIẾN THẮNG!");
        } else {
          CaroEffects.defeat("CHỦ LIVE THUA CUỘC!");
        }
      }
    }

    if (newCount === 0 && oldCount > 0 && !s.winner) {
      CaroSound.reset();
    }
  }

  firstState = false;
  state = s;

  const status = document.getElementById("status");

  if (status) {
    status.textContent = s.winner
      ? `🏆 Kết quả: ${s.winner} thắng`
      : `Lượt: ${s.turn}`;
  }

  // VẼ BÀN CỜ
  if (boardEl) {
    boardEl.innerHTML = "";

    s.board.forEach((value, index) => {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell " + (value || "");
      cell.textContent = value || "·";

      cell.disabled =
        !!value ||
        !!s.winner ||
        s.turn !== "X";

      if (value) {
        cell.classList.add("pop");
      }

      cell.onclick = () => {
        post("/api/admin/move", { index });
      };

      boardEl.appendChild(cell);
    });
  }

  // CẬP NHẬT HAI DANH SÁCH
  renderLists(s);
}

// NHẬN TRẠNG THÁI TỪ MÁY CHỦ
socket.on("state", render);

socket.on("connect", () => {
  const status = document.getElementById("status");

  if (status && !state) {
    status.textContent = "Đã kết nối máy chủ";
  }
});

socket.on("disconnect", () => {
  const status = document.getElementById("status");

  if (status) {
    status.textContent = "Mất kết nối, đang thử lại…";
  }
});

socket.on("connect_error", () => {
  const status = document.getElementById("status");

  if (status) {
    status.textContent = "Không kết nối được máy chủ!";
  }
});

// CÁC NÚT ĐIỀU KHIỂN
document.getElementById("next")?.addEventListener("click", () => {
  post("/api/admin/next");
});

document.getElementById("reset")?.addEventListener("click", () => {
  post("/api/admin/reset-score");
});

// THÊM NGƯỜI ĐÃ XÁC NHẬN QUÀ THỦ CÔNG
document.getElementById("addPlayer")?.addEventListener("click", async () => {
  const input = document.getElementById("giftUser");
  const username = input?.value.trim().replace(/^@/, "");

  if (!username) {
    alert("Nhập tên TikTok người tặng.");
    return;
  }

  const result = await post("/api/admin/add-player", {
    username,
    giftName: "Quà TikTok (đã xác nhận thủ công)"
  });

  if (result.ok && input) {
    input.value = "";
  }
});
