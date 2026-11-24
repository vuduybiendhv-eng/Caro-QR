const socket = io(), boardEl = document.getElementById("board");
let state = null;
const pin = () => document.getElementById("pin").value;
async function post(path, body={}) {
  const r = await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","x-admin-pin":pin()},body:JSON.stringify(body)});
  const data = await r.json(); if(!r.ok) alert(data.error || "Có lỗi"); return data;
}
function render(s) {
  state=s; document.getElementById("status").textContent = s.winner ? `Kết quả: ${s.winner} thắng` : `Lượt: ${s.turn}`;
  boardEl.innerHTML="";
  s.board.forEach((v,i)=>{const b=document.createElement("button");b.className="cell "+(v||"");b.textContent=v||"·";b.disabled=!!v||!!s.winner||s.turn!=="X";b.onclick=()=>post("/api/admin/move",{index:i});boardEl.appendChild(b);});
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
