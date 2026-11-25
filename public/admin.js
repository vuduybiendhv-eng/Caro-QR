
const socket = io();
const boardEl = document.getElementById("board");

let state = null;
let firstState = true;

const pin = () => document.getElementById("pin").value;

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

// GUI YEU CAU LEN MAY CHU
async function post(path, body = {}) {
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
  }

  return data;
}

// HIEN THI BAN CO VA TRANG THAI
function render(s) {
  if (!s || !Array.isArray(s.board)) return;

  if (state && !firstState) {
    const oldCount = state.board.filter(Boolean).length;
    const newCount = s.board.filter(Boolean).length;

    if (s.queue && state.queue && s.queue.length > state.queue.length) {
      CaroSound.join();
    }

    if (newCount > oldCount) {
      CaroSound.move();
    }

    // CHU LIVE LA QUAN X
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

  // VE BAN CO
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

  // DANH SACH NGUOI CHO
  const queueEl = document.getElementById("queue");

  if (queueEl) {
    queueEl.innerHTML = "";

    const queue = Array.isArray(s.queue) ? s.queue : [];

    if (!queue.length) {
      queueEl.textContent = "Chưa có người tặng quà hợp lệ.";
    }

    queue.forEach(player => {
      const row = document.createElement("div");
      row.className = "queueitem";

      const label = document.createElement("span");
      label.textContent = `@${player.username} · ${player.gift}`;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Chọn đấu";

      button.onclick = () => {
        post("/api/admin/select", {
          username: player.username
        });
      };

      row.append(label, button);
      queueEl.appendChild(row);
    });
  }
}

// NHAN TRANG THAI TU MAY CHU
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

// CAC NUT DIEU KHIEN
const nextButton = document.getElementById("next");

if (nextButton) {
  nextButton.onclick = () => {
    post("/api/admin/next");
  };
}

const resetButton = document.getElementById("reset");

if (resetButton) {
  resetButton.onclick = () => {
    post("/api/admin/reset-score");
  };
}

// THEM NGUOI CHOI DA XAC NHAN QUA
const addPlayerButton = document.getElementById("addPlayer");

if (addPlayerButton) {
  addPlayerButton.onclick = async () => {
    const input = document.getElementById("giftUser");
    const username = input ? input.value.trim() : "";

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
  };
}
