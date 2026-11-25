
(() => {
  const canvas = document.getElementById("celebrationCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  let w = 0;
  let h = 0;
  let leaves = [];
  let particles = [];
  let raf = 0;
  let resultTimer = null;
  let removeTimer = null;

  const rand = (min, max) =>
    Math.random() * (max - min) + min;

  // CSS HIỆU UNG
  const style = document.createElement("style");

  style.textContent = `
    #celebrationCanvas {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9998;
    }

    #caroResultOverlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(30, 12, 5, .48);
      opacity: 0;
      pointer-events: none;
      transition: opacity .3s ease;
    }

    #caroResultOverlay.show {
      opacity: 1;
    }

    #caroResultOverlay .result-card {
      width: min(330px, 90vw);
      padding: 18px;
      border: 4px solid #f6ce68;
      border-radius: 24px;
      text-align: center;
      background: linear-gradient(145deg, #fff0c6, #b76b2c);
      box-shadow: 0 0 35px rgba(255, 199, 69, .65);
      transform: scale(.65) rotate(-4deg);
      animation: caroResultPop .5s cubic-bezier(.2,1.5,.4,1) forwards;
    }

    #caroResultOverlay.defeat .result-card {
      border-color: #82c9f5;
      background: linear-gradient(145deg, #e0f4ff, #526f9b);
      box-shadow: 0 0 35px rgba(91, 177, 255, .55);
    }

    #caroResultOverlay .result-animation {
      display: block;
      width: min(230px, 70vw);
      height: min(230px, 30vh);
      margin: 0 auto 8px;
      object-fit: contain;
      border-radius: 14px;
    }

    #caroResultOverlay .result-title {
      margin: 8px 0;
      color: #8b480d;
      font-size: 42px;
      font-weight: 1000;
      letter-spacing: 3px;
      text-shadow: 0 3px 0 #ffdf83;
    }

    #caroResultOverlay.defeat .result-title {
      color: #173b68;
      text-shadow: 0 2px 0 #b8e3ff;
    }

    #caroResultOverlay .result-message {
      color: #633817;
      font-size: 16px;
      font-weight: 800;
    }

    #caroResultOverlay.defeat .result-message {
      color: #173b68;
    }

    @keyframes caroResultPop {
      to {
        transform: scale(1) rotate(0);
      }
    }

    @media (max-width: 650px) {
      #caroResultOverlay .result-card {
        width: min(280px, 88vw);
        padding: 13px;
      }

      #caroResultOverlay .result-animation {
        width: min(190px, 65vw);
        height: min(190px, 27vh);
      }

      #caroResultOverlay .result-title {
        font-size: 34px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #caroResultOverlay,
      #caroResultOverlay * {
        animation: none !important;
        transition: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  // KICH THUOC CANVAS
  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);

    w = window.innerWidth;
    h = window.innerHeight;

    canvas.width = w * d;
    canvas.height = h * d;

    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  // LA VANG
  function makeLeaf() {
    return {
      x: rand(-20, w + 20),
      y: rand(-h, 0),
      size: rand(7, 15),
      speed: rand(.35, 1.15),
      drift: rand(-.45, .45),
      rot: rand(0, Math.PI * 2),
      spin: rand(-.025, .025),
      hue: rand(28, 48)
    };
  }

  function drawLeaf(leaf) {
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.rot);

    ctx.fillStyle =
      `hsla(${leaf.hue},75%,${rand(42,58)}%,.78)`;

    ctx.beginPath();
    ctx.ellipse(
      0, 0,
      leaf.size * .48,
      leaf.size,
      0, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "rgba(90,65,20,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -leaf.size * .7);
    ctx.lineTo(0, leaf.size * .7);
    ctx.stroke();

    ctx.restore();
  }

  // TAO HAT HIEU UNG
  function burst(x, y, count = 80, type = "win") {
    const colors = type === "defeat"
      ? ["#8bd8ff", "#b8e8ff", "#d9f5ff", "#659de0", "#ffffff"]
      : ["#ffe36e", "#ffb52e", "#fff3a0", "#ff7aa8", "#8df5cf", "#ffffff"];

    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(1.2, 5.8);
      const life = rand(45, 95);

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(1, 3),
        gravity: type === "defeat" ? .025 : .055,
        life,
        max: life,
        radius: rand(2, 5),
        rotation: rand(0, 6),
        color: colors[Math.floor(rand(0, colors.length))],
        kind: type === "defeat"
          ? (Math.random() < .5 ? "drop" : "spark")
          : (Math.random() < .65 ? "confetti" : "spark")
      });
    }
  }

  // VE HAT
  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;

      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;

      if (p.kind === "spark") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "drop") {
        ctx.beginPath();
        ctx.ellipse(
          p.x, p.y,
          p.radius * .65,
          p.radius * 1.5,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(
          -p.radius,
          -p.radius / 2,
          p.radius * 2,
          p.radius
        );
        ctx.restore();
      }

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    ctx.globalAlpha = 1;
  }

  // VONG LAP HIEU UNG
  function tick() {
    ctx.clearRect(0, 0, w, h);

    for (const leaf of leaves) {
      leaf.y += leaf.speed;
      leaf.x += leaf.drift + Math.sin(leaf.y * .012) * .35;
      leaf.rot += leaf.spin;

      if (leaf.y > h + 20) {
        Object.assign(leaf, makeLeaf(), { y: -20 });
      }

      drawLeaf(leaf);
    }

    drawParticles();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();

    leaves = Array.from(
      { length: Math.max(12, Math.min(28, Math.round(w / 18))) },
      makeLeaf
    );

    tick();
  }

  // HIEU UNG KHI DANH QUAN
  function move() {
    burst(w / 2, h / 2, 22, "win");
  }

  // HIEN ANH WIN HOAC DEFEAT
  function showResult(type, message) {
    let overlay = document.getElementById("caroResultOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "caroResultOverlay";
      document.body.appendChild(overlay);
    }

    clearTimeout(resultTimer);
    clearTimeout(removeTimer);

    const isDefeat = type === "defeat";
    const image = isDefeat ? "/defeat.gif" : "/win.gif";

    overlay.className = isDefeat ? "defeat" : "win";

    const card = document.createElement("div");
    card.className = "result-card";

    const img = document.createElement("img");
    img.className = "result-animation";
    img.src = image;
    img.alt = isDefeat ? "DEFEAT" : "WIN";

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = isDefeat ? "DEFEAT" : "WIN";

    const description = document.createElement("div");
    description.className = "result-message";
    description.textContent = message || (
      isDefeat
        ? "Cố gắng ở ván sau nhé!"
        : "Chiến thắng tuyệt vời!"
    );

    card.append(img, title, description);
    overlay.replaceChildren(card);

    requestAnimationFrame(() => {
      overlay.classList.add("show");
    });

    if (isDefeat) {
      burst(w * .5, h * .35, 110, "defeat");
      setTimeout(() => {
        burst(w * .3, h * .4, 45, "defeat");
      }, 250);
    } else {
      burst(w * .5, h * .3, 150, "win");

      setTimeout(() => {
        burst(w * .22, h * .38, 75, "win");
      }, 280);

      setTimeout(() => {
        burst(w * .78, h * .38, 75, "win");
      }, 520);
    }

    resultTimer = setTimeout(() => {
      overlay.classList.remove("show");

      removeTimer = setTimeout(() => {
        if (overlay && !overlay.classList.contains("show")) {
          overlay.remove();
        }
      }, 350);
    }, 4000);
  }

  function celebrate(message) {
    showResult("win", message || "CHIẾN THẮNG!");
  }

  function defeat(message) {
    showResult("defeat", message || "CỐ GẮNG Ở VÁN SAU NHÉ!");
  }

  window.addEventListener("resize", resize);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      tick();
    }
  });

  start();

  window.CaroEffects = {
    move,
    celebrate,
    defeat,
    win: (message) => showResult("win", message || "CHIẾN THẮNG!")
  };
})();
 
