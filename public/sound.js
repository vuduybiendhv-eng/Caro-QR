
(function () {
  let enabled = false;

  const audio = {
    move: new Audio(),
    join: new Audio(),
    win: new Audio("https://sfxmint.com/dl/baby-babble-09.mp3"),
    defeat: new Audio("https://sfxmint.com/dl/baby-crying-03.mp3"),
    reset: new Audio()
  };

  audio.win.preload = "auto";
  audio.defeat.preload = "auto";

  function play(name) {
    if (!enabled || !audio[name]) return;

    try {
      const sound = audio[name];
      sound.pause();
      sound.currentTime = 0;

      const result = sound.play();

      if (result && typeof result.catch === "function") {
        result.catch(error => {
          console.warn("Không phát được âm thanh:", error);
        });
      }
    } catch (error) {
      console.warn("Lỗi âm thanh:", error);
    }
  }

  window.CaroSound = {
    toggle() {
      enabled = !enabled;
      return enabled;
    },

    isEnabled() {
      return enabled;
    },

    move() {
      // Tiếng đặt quân
    },

    join() {},

    win() {
      play("win");
    },

    defeat() {
      play("defeat");
    },

    reset() {}
  };
})();
