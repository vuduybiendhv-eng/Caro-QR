const socket=io();const el=document.getElementById("board");
socket.on("state",s=>{
 document.getElementById("room").textContent=s.roomName+" · 15×15";
 document.getElementById("host").textContent=s.host;
 document.getElementById("hostScore").textContent=s.scores.host;
 document.getElementById("viewerScore").textContent=s.scores.viewers;
 document.getElementById("opponent").textContent=s.activePlayer||"ĐANG CHỜ ĐỐI THỦ";
 document.getElementById("status").textContent=s.winner?(s.winner==="X"?"CHỦ LIVE CHIẾN THẮNG!":s.activePlayer+" CHIẾN THẮNG!"):(s.activePlayer?(s.turn==="X"?"LƯỢT CHỦ LIVE":"LƯỢT NGƯỜI XEM"):"ĐANG CHỜ NGƯỜI CHƠI");
 el.innerHTML="";
 s.board.forEach(v=>{const b=document.createElement("div");b.className="cell "+(v||"");b.textContent=v||"·";el.append(b);});
});