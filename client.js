
const socket = io();

const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");

let state = null;
let username = "";
let registered = false;

function showNotice(message) {
  if (notice) notice.textContent = message;
}

function render(s) {
  state = s;

  document.getElementById("room").textContent =
    `${s.roomName} · 15×15`;

  document.getElementById("host").textContent = s.host;
  document.getElementById("hostScore").textContent = s.scores.host;
  document.getElementById("viewerScore").textContent = s.scores.viewers;
  document.getElementById("opponent").textContent =
    s.activePlayer || "Chưa chọn";

  document.getElementById("status").textContent = s.winner
    ? (s.winner === "X"
        ? "CHỦ LIVE THẮNG!"
        : `${s.activePlayer} CHIẾN THẮNG!`)
    : (s.turn === "O"
        ? `Đến lượt ${s.activePlayer || "người xem"} (O)`
        : "Đến lượt chủ LIVE (X)");

  boardEl.innerHTML = "";

  s.board.forEach((v, i) => {
    const b = document.createElement("button");
    b.className = "cell " + (v || "");
    b.textContent = v || "·";

    b.disabled =
      !!v ||
      !!s.winner ||
      s.turn !== "O" ||
      !s.activePlayer ||
      s.activePlayer !== username;

    b.addEventListener("click", () => {
      socket.emit("viewer:move", { index: i });
    });

    boardEl.appendChild(b);
  });

  if (username && s.pendingQueue?.some(p => p.username === username)) {
    showNotice("📨 Yêu cầu của bạn đang chờ chủ LIVE duyệt.");
  } else if (username && s.queue?.some(p => p.username === username)) {
    showNotice("✅ Bạn đã được duyệt! Hãy chờ chủ LIVE chọn vào trận.");
  } else if (username && s.activePlayer === username) {
    showNotice("🎮 Bạn đang tham gia trận đấu!");
  }
}

socket.on("state", render);

socket.on("notice", message => {
  showNotice(message);
});

document.getElementById("join").onclick = () => {
  const input = document.getElementById("username");
  username = input.value.trim().replace(/^@/, "");

  if (!username) {
    showNotice("Bạn hãy nhập tên TikTok trước nhé.");
    return;
  }

  if (registered) {
    showNotice("Bạn đã gửi yêu cầu rồi, vui lòng chờ duyệt nhé.");
    return;
  }

  registered = true;
  socket.emit("viewer:register", { username });
  showNotice("📨 Đã gửi yêu cầu. Vui lòng chờ chủ LIVE duyệt!");
};
