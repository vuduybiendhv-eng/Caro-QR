
(function () {
  let enabled = false;
  let audioContext = null;

  const button = document.getElementById("soundToggle");

  function updateButton() {
    if (!button) return;

    button.textContent = enabled
      ? "🔊 Âm thanh: ĐANG BẬT"
      : "🔇 Âm thanh: ĐANG TẮT";

    button.setAttribute("aria-pressed", String(enabled));
  }

  function unlockAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    if (!audioContext) {
      audioContext = new AudioCtx();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(console.warn);
    }

    return true;
  }

  function tone(frequency, duration, type = "sine", volume = 0.15, delay = 0) {
    if (!enabled || !unlockAudio()) return;

    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function playMove() {
    tone(620, 0.09, "sine", 0.18);
  }

  function playWin() {
    tone(523, 0.18, "sine", 0.2, 0);
    tone(659, 0.18, "sine", 0.2, 0.16);
    tone(784, 0.22, "sine", 0.22, 0.32);
    tone(1047, 0.42, "sine", 0.24, 0.54);
  }

  function playDefeat() {
    tone(440, 0.22, "triangle", 0.18, 0);
    tone(349, 0.25, "triangle", 0.18, 0.2);
    tone(262, 0.42, "triangle", 0.2, 0.43);
  }

  function playJoin() {
    tone(700, 0.1, "sine", 0.15);
    tone(900, 0.12, "sine", 0.15, 0.12);
  }

  window.CaroSound = {
    toggle() {
      enabled = !enabled;

      if (enabled) {
        unlockAudio();
        tone(660, 0.12, "sine", 0.12);
      }

      updateButton();
      return enabled;
    },

    isEnabled() {
      return enabled;
    },

    move: playMove,
    join: playJoin,
    reset() {
      tone(500, 0.1, "sine", 0.1);
    },
    win: playWin,
    defeat: playDefeat
  };

  if (button) {
    button.addEventListener("click", () => {
      window.CaroSound.toggle();
    });
  }

  updateButton();
})();
