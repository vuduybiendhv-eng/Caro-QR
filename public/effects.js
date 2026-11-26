
/* =========================================================
   CARO LIVE - EFFECTS.JS
   Hiệu ứng Tết: hoa mai, hoa đào, pháo giấy,
   GIF chiến thắng và thất bại.
   Không tự phát âm thanh.
   ========================================================= */

(() => {
  "use strict";

  const canvas = document.getElementById("celebrationCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;

  let flowers = [];
  let particles = [];

  let raf = 0;
  let resultTimer = null;
  let removeTimer = null;

  let isRunning = false;

  const rand = (min, max) =>
    Math.random() * (max - min) + min;

  // ========================================================
  // CSS HIỆU ỨNG KẾT QUẢ
  // ========================================================

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

  // ========================================================
  // KÍCH THƯỚC CANVAS
  // ========================================================

  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);

    w = window.innerWidth;
    h = window.innerHeight;

    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  // ========================================================
  // KIỂM TRA VÙNG BÀN CỜ
  // ========================================================

  function getBoardRect() {
    const board = document.getElementById("board");
    if (!board) return null;

    const rect = board.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom < 0 ||
      rect.top > h ||
      rect.right < 0 ||
      rect.left > w
    ) {
      return null;
    }

    return rect;
  }

  function isInsideBoard(x, y, margin = 12) {
    const rect = getBoardRect();
    if (!rect) return false;

    return (
      x >= rect.left - margin &&
      x <= rect.right + margin &&
      y >= rect.top - margin &&
      y <= rect.bottom + margin
    );
  }

  // ========================================================
  // TẠO HOA MAI / HOA ĐÀO
  // ========================================================

  function makeFlower() {
    let flower = {
      x: rand(0, w),
      y: rand(-h, -10),
      size: rand(6, 11),
      speed: rand(.35, .9),
      drift: rand(-.35, .35),
      rot: rand(0, Math.PI * 2),
      spin: rand(-.018, .018),
      sway: rand(0, Math.PI * 2),
      swaySpeed: rand(.008, .018),
      type: Math.random() < .5 ? "mai" : "dao"
    };

    // Nếu hoa xuất hiện trong vùng bàn cờ,
    // chuyển hoa ra một trong hai bên.
    if (isInsideBoard(flower.x, 0, 20)) {
      const rect = getBoardRect();

      if (rect) {
        flower.x = Math.random() < .5
          ? rect.left - 25
          : rect.right + 25;
      }
    }

    return flower;
  }

  // ========================================================
  // VẼ CÁNH HOA
  // ========================================================

  function drawPetal(size, color, highlight) {
    ctx.fillStyle = color;
    ctx.beginPath();

    ctx.ellipse(
      0,
      -size * .62,
      size * .34,
      size * .58,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = highlight;
    ctx.beginPath();

    ctx.ellipse(
      -size * .08,
      -size * .72,
      size * .11,
      size * .27,
      -.15,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  // ========================================================
  // VẼ HOA MAI / HOA ĐÀO
  // ========================================================

  function drawFlower(flower) {
    ctx.save();

    ctx.translate(flower.x, flower.y);
    ctx.rotate(flower.rot);

    const s = flower.size;
    const isMai = flower.type === "mai";

    const petalColor = isMai ? "#ffd84d" : "#ff9fbd";
    const highlight = isMai ? "#fff0a0" : "#ffd3e1";
    const centerColor = isMai ? "#e98a18" : "#c94e78";

    ctx.globalAlpha = isMai ? .88 : .82;

    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / 5);
      drawPetal(s, petalColor, highlight);
      ctx.restore();
    }

    ctx.fillStyle = centerColor;
    ctx.beginPath();
    ctx.arc(0, 0, s * .19, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff5ce";
    ctx.beginPath();
    ctx.arc(-s * .045, -s * .045, s * .065, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ========================================================
  // TẠO PHÁO GIẤY
  // ========================================================

  function burst(x, y, count = 80, type = "win") {
    const colors = type === "defeat"
      ? [
          "#8bd8ff",
          "#b8e8ff",
          "#d9f5ff",
          "#659de0",
          "#ffffff"
        ]
      : [
          "#ffe36e",
          "#ffb52e",
          "#fff3a0",
          "#ff7aa8",
          "#8df5cf",
          "#ffffff"
        ];

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
        spin: rand(-.12, .12),
        color: colors[Math.floor(rand(0, colors.length))],
        kind: type === "defeat"
          ? (Math.random() < .5 ? "drop" : "spark")
          : (Math.random() < .65 ? "confetti" : "spark")
      });
    }
  }

  // ========================================================
  // VẼ HẠT HIỆU ỨNG
  // ========================================================

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.spin;
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
          p.x,
          p.y,
          p.radius * .65,
          p.radius * 1.5,
          0,
          0,
          Math.PI * 2
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

  // ========================================================
  // VÒNG LẶP HOA RƠI
  // ========================================================

  function tick() {
    if (!isRunning) return;

    ctx.clearRect(0, 0, w, h);

    for (const flower of flowers) {
      flower.y += flower.speed;

      flower.sway += flower.swaySpeed;
      flower.x += flower.drift + Math.sin(flower.sway) * .45;
      flower.rot += flower.spin;

      if (flower.y > h + 25) {
        Object.assign(flower, makeFlower(), {
          y: -25
        });
      }

      // Không vẽ hoa trong khu vực bàn cờ.
      const margin = flower.size + 8;

      if (!isInsideBoard(flower.x, flower.y, margin)) {
        drawFlower(flower);
      }
    }

    // Pháo giấy chỉ xuất hiện khi kết thúc ván.
    drawParticles();

    raf = requestAnimationFrame(tick);
  }

  // ========================================================
  // KHỞI ĐỘNG / DỪNG
  // ========================================================

  function start() {
    cancelAnimationFrame(raf);

    resize();

    flowers = Array.from(
      {
        length: Math.max(
          15,
          Math.min(32, Math.round(w / 16))
        )
      },
      makeFlower
    );

    isRunning = true;
    tick();
  }

  function stop() {
    isRunning = false;
    cancelAnimationFrame(raf);
  }

  // ========================================================
  // HIỆU ỨNG KHI ĐÁNH QUÂN
  // ========================================================

  function move() {
    // Không tạo pháo giấy trên bàn cờ.
    // Âm báo nước đi được xử lý riêng trong sound.js.
  }

  // ========================================================
  // HIỆU ỨNG KẾT QUẢ
  // ========================================================

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

    img.onerror = () => {
      img.style.display = "none";
    };

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
        if (
          overlay &&
          !overlay.classList.contains("show")
        ) {
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

  // ========================================================
  // SỰ KIỆN TRÌNH DUYỆT
  // ========================================================

  window.addEventListener("resize", () => {
    resize();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  // ========================================================
  // KHỞI ĐỘNG
  // ========================================================

  start();

  window.CaroEffects = {
    move,
    celebrate,
    defeat,
    win: message => showResult(
      "win",
      message || "CHIẾN THẮNG!"
    )
  };

  console.log("Caro LIVE Effects đã sẵn sàng.");
})();
