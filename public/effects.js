(()=>{
 const canvas=document.getElementById('celebrationCanvas'); if(!canvas)return;
 const ctx=canvas.getContext('2d'); let w=0,h=0,leaves=[],bits=[],raf=0;
 const rand=(a,b)=>Math.random()*(b-a)+a;
 function resize(){const d=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);}
 function leaf(){return{x:rand(-20,w+20),y:rand(-h,0),size:rand(7,15),speed:rand(.35,1.15),drift:rand(-.45,.45),rot:rand(0,Math.PI*2),spin:rand(-.025,.025),hue:rand(28,48)}}
 function init(){resize();leaves=Array.from({length:Math.max(12,Math.min(28,Math.round(w/18)))},leaf);tick();}
 function tick(){ctx.clearRect(0,0,w,h);for(const l of leaves){l.y+=l.speed;l.x+=l.drift+Math.sin(l.y*.012)*.35;l.rot+=l.spin;if(l.y>h+20){Object.assign(l,leaf(),{y:-20});}ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rot);ctx.fillStyle=`hsla(${l.hue},75%,${rand(42,58)}%,.78)`;ctx.beginPath();ctx.ellipse(0,0,l.size*.48,l.size,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(90,65,20,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-l.size*.7);ctx.lineTo(0,l.size*.7);ctx.stroke();ctx.restore();}
 for(let i=bits.length-1;i>=0;i--){const b=bits[i];b.x+=b.vx;b.y+=b.vy;b.vy+=.055;b.life--;ctx.globalAlpha=Math.max(0,b.life/b.max);ctx.fillStyle=b.color;if(b.kind==='spark'){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}else{ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);ctx.fillRect(-b.r,-b.r/2,b.r*2,b.r);ctx.restore();}if(b.life<=0)bits.splice(i,1);}ctx.globalAlpha=1;raf=requestAnimationFrame(tick);}
 function burst(x,y,n=90){const colors=['#ffe36e','#ff7aa8','#8df5cf','#83c9ff','#d9a1ff','#fff'];for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),v=rand(1.2,5.8),life=rand(45,95);bits.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-rand(1,3),life,max:life,r:rand(2,5),rot:rand(0,6),color:colors[Math.floor(rand(0,colors.length))],kind:Math.random()<.65?'confetti':'spark'});}}
 function celebrate(message){const el=document.getElementById('victoryBanner');if(el){el.textContent='🏆 '+message+' 🎉';el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}burst(w*.5,h*.3,150);setTimeout(()=>burst(w*.22,h*.38,75),280);setTimeout(()=>burst(w*.78,h*.38,75),520);}
 addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf)}else{tick()}});init();window.CaroEffects={celebrate};
})();
