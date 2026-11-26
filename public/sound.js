
/* =========================================================
   CARO LIVE - SOUND.JS
   Âm thanh MP3 thắng/thua và âm báo nước đi.
   Nút bật/tắt chỉ hiển thị biểu tượng.
   ========================================================= */

(() => {
  "use strict";

  let enabled = false;
  let audioContext = null;
  let button = null;

  // MP3 trong thư mục public
  const audioFiles = {
    win: "/win.mp3",
    defeat: "/defeat.mp3"
  };

  const audioCache = {};

  // -------------------------------------------------------
  // NÚT ÂM THANH
  // -------------------------------------------------------

  function getButton() {
    if (!button) {
      button = document.getElementById("soundToggle");
    }
    return button;
  }

  function updateButton() {
    const btn = getButton();
    if (!btn) return;

    btn.textContent = enabled ? "🔊" : "🔇";
    btn.setAttribute("aria-label", enabled ? "Tắt âm thanh" : "Bật âm thanh");
    btn.setAttribute("aria-pressed", String(enabled));
    btn.title = enabled ? "Tắt âm thanh" : "Bật âm thanh";
  }

  // -------------------------------------------------------
  // MỞ AUDIO CONTEXT CHO ANDROID
  // -------------------------------------------------------

  function getAudioContext() {
    const AudioCtx =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioCtx) return null;

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

  // -------------------------------------------------------
  // ÂM BÁO NƯỚC ĐI
  // -------------------------------------------------------

  function playTone(
    frequency,
    duration,
    type = "sine",
    volume = 0.15
  ) {
    if (!enabled) return;

    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

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
      console.warn("Lỗi âm báo:", error);
    }
  }

  function playMove() {
    playTone(620, 0.09, "sine", 0.18);
  }

  function playJoin() {
    playTone(700, 0.10, "sine", 0.16);

    setTimeout(() => {
      playTone(900, 0.12, "sine", 0.18);
    }, 130);
  }

  function playReset() {
    playTone(500, 0.10, "sine", 0.15);
  }

  // -------------------------------------------------------
  // PHÁT MP3
  // -------------------------------------------------------

  function getAudio(name) {
    if (!audioCache[name]) {
      const file = audioFiles[name];
      if (!file) return null;

      const audio = new Audio(file);
      audio.preload = "auto";
      audio.volume = 1;

      audioCache[name] = audio;
    }

    return audioCache[name];
  }

  async function playMP3(name) {
    if (!enabled) return;

    const audio = getAudio(name);
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.warn(`Không phát được ${name}.mp3:`, error);
    }
  }

  function playWin() {
    playMP3("win");
  }

  function playDefeat() {
    playMP3("defeat");
  }

  // -------------------------------------------------------
  // BẬT / TẮT
  // -------------------------------------------------------

  async function toggle() {
    enabled = !enabled;
    updateButton();

    if (enabled) {
      const ready = await unlockAudio();

      if (ready && enabled) {
        playTone(660, 0.12, "sine", 0.16);
      }
    } else {
      // Tắt ngay cả âm thanh MP3 đang phát.
      Object.values(audioCache).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }

    return enabled;
  }

  // -------------------------------------------------------
  // API DÙNG CHO CLIENT.JS VÀ ADMIN.JS
  // -------------------------------------------------------

  window.CaroSound = {
    toggle,
    isEnabled: () => enabled,
    move: playMove,
    join: playJoin,
    reset: playReset,
    win: playWin,
    defeat: playDefeat
  };

  // -------------------------------------------------------
  // GẮN NÚT MỘT LẦN
  // -------------------------------------------------------

  function setupButton() {
    const btn = getButton();

    if (btn && !btn.dataset.soundReady) {
      btn.dataset.soundReady = "1";
      btn.addEventListener("click", toggle);
    }

    updateButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      setupButton,
      { once: true }
    );
  } else {
    setupButton();
  }

  console.log("Caro LIVE Sound MP3 đã sẵn sàng.");
})();
