
(function () {
  let enabled = false;

  const audio = {
    win: new Audio("/win.mp3"),
    defeat: new Audio("/defeat.mp3")
  };

  // ÂM LƯỢNG TỐI ĐA
  audio.win.volume = 1.0;
  audio.defeat.volume = 1.0;

  audio.win.preload = "auto";
  audio.defeat.preload = "auto";

  function play(name) {
    if (!enabled || !audio[name]) return;

    try {
      const sound = audio[name];

      sound.pause();
      sound.currentTime = 0;
      sound.volume = 1.0;

      const result = sound.play();

      if (result) {
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

    move() {},
    join() {},
    reset() {},

    win() {
      play("win");
    },

    defeat() {
      play("defeat");
    }
  };
})();
