
(() => {
  "use strict";

  let enabled = false;
  let audioContext = null;
  let button = null;

  function getButton() {
    if (!button) {
      button = document.getElementById("soundToggle");
    }
    return button;
  }

  function updateButton() {
    const btn = getButton();
    if (!btn) return;

    btn.textContent = enabled
      ? "🔊 Âm thanh: ĐANG BẬT"
      : "🔇 Âm thanh: ĐANG TẮT";

    btn.setAttribute("aria-pressed", String(enabled));
  }

  function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtx) {
      console.warn("Trình duyệt không hỗ trợ Web Audio.");
      return null;
    }

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioCtx();
    }

    return audioContext;
  }

  async function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) return false;

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      return ctx.state === "running";
    } catch (error) {
      console.warn("Không mở được âm thanh:", error);
      return false;
    }
  }

  function playToneNow(
    frequency,
    duration,
    type = "sine",
    volume = 0.15,
    delay = 0
  ) {
    const ctx = audioContext;

    if (!ctx || ctx.state !== "running") return;

    try {
      const start = ctx.currentTime + delay;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(
        volume,
        start + 0.015
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        start + duration
      );

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.04);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch (error) {
      console.warn("Lỗi phát âm thanh:", error);
    }
  }

  async function playTone(
    frequency,
    duration,
    type = "sine",
    volume = 0.15,
    delay = 0
  ) {
    if (!enabled) return;

    const ready = await unlockAudio();

    if (!ready || !enabled) return;

    playToneNow(frequency, duration, type, volume, delay);
  }

  function playMove() {
    playTone(620, 0.09, "sine", 0.20);
  }

  function playJoin() {
    playTone(700, 0.10, "sine", 0.16, 0);
    playTone(900, 0.12, "sine", 0.18, 0.13);
  }

  function playReset() {
    playTone(500, 0.10, "sine", 0.15);
  }

  function playWin() {
    playTone(523, 0.18, "sine", 0.20, 0);
    playTone(659, 0.18, "sine", 0.20, 0.17);
    playTone(784, 0.22, "sine", 0.22, 0.34);
    playTone(1047, 0.42, "sine", 0.24, 0.55);
  }

  function playDefeat() {
    playTone(440, 0.22, "triangle", 0.18, 0);
    playTone(349, 0.25, "triangle", 0.18, 0.21);
    playTone(262, 0.42, "triangle", 0.20, 0.45);
  }

  async function toggle() {
    enabled = !enabled;
    updateButton();

    if (enabled) {
      const ready = await unlockAudio();

      if (ready && enabled) {
        playToneNow(660, 0.14, "sine", 0.20);
      } else {
        console.warn("Âm thanh chưa sẵn sàng trên thiết bị.");
      }
    }

    return enabled;
  }

  window.CaroSound = {
    toggle,
    isEnabled: () => enabled,
    move: playMove,
    join: playJoin,
    reset: playReset,
    win: playWin,
    defeat: playDefeat
  };

  function setupButton() {
    const btn = getButton();

    if (btn && !btn.dataset.soundReady) {
      btn.dataset.soundReady = "1";
      btn.addEventListener("click", toggle);
    }

    updateButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupButton, {
      once: true
    });
  } else {
    setupButton();
  }

  console.log("Caro LIVE Sound đã sẵn sàng.");
})();
