const socket = io();
const boardEl = document.getElementById("board");
const notice = document.getElementById("notice");
let state = null, username = "", firstState = true;
const soundButton=document.getElementById('soundToggle');
soundButton.onclick=()=>{const on=CaroSound.toggle();soundButton.textContent=on?'🔊 Bật âm thanh':'🔇 Tắt âm thanh';soundButton.classList.toggle('off',!on)};
function render(s) {
  if(state&&!firstState){const oldCount=state.board.filter(Boolean).length,newCount=s.board.filter(Boolean).length;if(newCount>oldCount)CaroSound.move();if(!state.winner&&s.winner){CaroSound.win();CaroEffects.celebrate(s.winner==="X"?"CHỦ LIVE CHIẾN THẮNG!":"NGƯỜI CHƠI CHIẾN THẮNG!");}}
  firstState=false;state = s;
  document.getElementById("room").textContent = `${s.roomName} · 15×15`;
  document.getElementById("host").textContent = s.host;
  document.getElementById("hostScore").textContent = s.scores.host;
  document.getElementById("viewerScore").textContent = s.scores.viewers;
  document.getElementById("opponent").textContent = s.activePlayer || "Chưa chọn";
  document.getElementById("status").textContent = s.winner ? (s.winner==="X" ? "🏆 CHỦ LIVE THẮNG!" : `🏆 ${s.activePlayer} CHIẾN THẮNG!`) : (s.turn==="O" ? `Đến lượt ${s.activePlayer || "người xem"} (O)` : "Đến lượt chủ LIVE (X)");
  boardEl.innerHTML = "";
  s.board.forEach((v,i) => {
    const b = document.createElement("button"); b.className = "cell "+(v||""); if(v)b.setAttribute("aria-label", v === "X" ? "Quân trắng" : "Quân đen");
    b.textContent = v ? "" : ""; b.disabled = !!v || !!s.winner || s.turn !== "O" || !s.activePlayer;
    if(v)b.classList.add('pop');
    b.addEventListener("click", () => socket.emit("viewer:move", { index:i }));
    boardEl.appendChild(b);
  });
}
socket.on("state", render);
socket.on("notice", m => notice.textContent = m);
document.getElementById("join").onclick = () => {
  username = document.getElementById("username").value.trim();
  if(!username){notice.textContent='Bạn nhập tên TikTok trước nhé.';return;}
  socket.emit("viewer:join", { username });
};
