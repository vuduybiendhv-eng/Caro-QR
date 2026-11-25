const socket = io(), boardEl = document.getElementById("board");
let state = null, firstState=true;
const pin = () => document.getElementById("pin").value;
const soundButton=document.getElementById('soundToggle');
soundButton.onclick=()=>{const on=CaroSound.toggle();soundButton.textContent=on?'🔊 Bật âm thanh':'🔇 Tắt âm thanh';soundButton.classList.toggle('off',!on)};
async function post(path, body={}) {
  const r = await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","x-admin-pin":pin()},body:JSON.stringify(body)});
  const data = await r.json(); if(!r.ok) alert(data.error || "Có lỗi"); return data;
}
function render(s) {
  if(state&&!firstState){const oldCount=state.board.filter(Boolean).length,newCount=s.board.filter(Boolean).length;if(s.queue.length>state.queue.length)CaroSound.join();if(newCount>oldCount)CaroSound.move();if(!state.winner&&s.winner){CaroSound.win();CaroEffects.celebrate(s.winner==="X"?"CHỦ LIVE CHIẾN THẮNG!":"NGƯỜI CHƠI CHIẾN THẮNG!");}if(newCount===0&&oldCount>0&&!s.winner)CaroSound.reset();}
  firstState=false;state=s; document.getElementById("status").textContent = s.winner ? `🏆 Kết quả: ${s.winner} thắng` : `Lượt: ${s.turn}`;
  boardEl.innerHTML="";
  s.board.forEach((v,i)=>{const b=document.createElement("button");b.className="cell "+(v||"");b.textContent=v||"·";b.disabled=!!v||!!s.winner||s.turn!=="X";if(v)b.classList.add('pop');b.onclick=()=>post("/api/admin/move",{index:i});boardEl.appendChild(b);});
  const q=document.getElementById("queue");q.innerHTML="";
  if(!s.queue.length) q.textContent="Chưa có người tặng quà hợp lệ.";
  s.queue.forEach(p=>{const row=document.createElement("div");row.className="queueitem";const label=document.createElement("span");label.textContent=`@${p.username} · ${p.gift}`;const btn=document.createElement("button");btn.textContent="Chọn đấu";btn.onclick=()=>post("/api/admin/select",{username:p.username});row.append(label,btn);q.append(row);});
}
socket.on("state",render);
document.getElementById("next").onclick=()=>post("/api/admin/next");
document.getElementById("reset").onclick=()=>post("/api/admin/reset-score");
document.getElementById("addPlayer").onclick=async()=>{
 const username=document.getElementById("giftUser").value.trim();
 if(!username) return alert("Nhập tên TikTok người tặng.");
 const result=await post("/api/admin/add-player",{username,giftName:"Quà TikTok (đã xác nhận thủ công)"});
 if(result.ok) document.getElementById("giftUser").value="";
};
