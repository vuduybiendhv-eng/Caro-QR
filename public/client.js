const socket = io();
const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");
let state = null, username = "";
function render(s) {
  state = s;
  document.getElementById("room").textContent = `${s.roomName} · 15×15`;
  document.getElementById("host").textContent = s.host;
  document.getElementById("hostScore").textContent = s.scores.host;
  document.getElementById("viewerScore").textContent = s.scores.viewers;
  document.getElementById("opponent").textContent = s.activePlayer || "Chưa chọn";
  document.getElementById("status").textContent = s.winner ? (s.winner==="X" ? "CHỦ LIVE THẮNG!" : `${s.activePlayer} CHIẾN THẮNG!`) : (s.turn==="O" ? `Đến lượt ${s.activePlayer || "người xem"} (O)` : "Đến lượt chủ LIVE (X)");
  boardEl.innerHTML = "";
  s.board.forEach((v,i) => {
    const b = document.createElement("button"); b.className = "cell "+(v||"");
    b.textContent = v || "·"; b.disabled = !!v || !!s.winner || s.turn !== "O" || !s.activePlayer;
    b.addEventListener("click", () => socket.emit("viewer:move", { index:i }));
    boardEl.appendChild(b);
  });
}
socket.on("state", render);
socket.on("notice", m => notice.textContent = m);
document.getElementById("join").onclick = () => {
  username = document.getElementById("username").value.trim();
  socket.emit("viewer:join", { username });
};
