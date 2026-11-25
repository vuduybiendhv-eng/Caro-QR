

(() => {
  const music = new Audio("/caro-live-music.wav");
  music.loop = true;
  music.volume = 0.25;

  const bars = document.querySelectorAll(".soundbar");

  bars.forEach((bar) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "🎵 Bật nhạc nền";
    button.id = "musicToggle";

    button.addEventListener("click", async () => {
      if (music.paused) {
        try {
          await music.play();
          button.textContent = "🎵 Tắt nhạc nền";
        } catch (error) {
          button.textContent = "⚠️ Chạm để bật nhạc";
        }
      } else {
        music.pause();
        button.textContent = "🎵 Bật nhạc nền";
      }
    });

    bar.appendChild(button);
  });
})();
