
(() => {
  "use strict";

  const music = new Audio("/caro-live-music.wav");
  const button = document.getElementById("musicToggle");

  music.loop = true;
  music.volume = 0.25;
  music.preload = "auto";

  let playing = false;

  function updateButton() {
    if (!button) return;

    button.textContent = playing ? "🎶" : "🎵";
    button.setAttribute("aria-label", playing ? "Tắt nhạc nền" : "Bật nhạc nền");
    button.setAttribute("aria-pressed", String(playing));
    button.title = playing ? "Tắt nhạc nền" : "Bật nhạc nền";
  }

  async function toggleMusic() {
    if (!music.paused) {
      music.pause();
      playing = false;
      updateButton();
      return;
    }

    try {
      await music.play();
      playing = true;
      updateButton();
    } catch (error) {
      playing = false;
      updateButton();
      console.warn("Không phát được nhạc nền:", error);
    }
  }

  if (button) {
    button.addEventListener("click", toggleMusic);
  }

  music.addEventListener("pause", () => {
    playing = false;
    updateButton();
  });

  music.addEventListener("play", () => {
    playing = true;
    updateButton();
  });

  updateButton();

  window.CaroMusic = {
    toggle: toggleMusic,
    isPlaying: () => !music.paused,
    stop: () => music.pause()
  };

  console.log("Caro LIVE Music đã sẵn sàng.");
})();
