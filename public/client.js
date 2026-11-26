
(() => {
  "use strict";

  const socket = io();

  // ===== DOM =====
  const boardEl = document.getElementById("board");
  const noticeEl = document.getElementById("notice");
  const statusEl = document.getElementById("status");
  const soundToggle = document.getElementById("soundToggle");

  const joinSection =
    document.querySelector(".caro-layout > .join") ||
    document.getElementById("join");

  const joinBtn = document.getElementById("join");
  const usernameInput = document.getElementById("username");

  // ===== LOCAL STATE =====
  let state = null;
  let myName = localStorage.getItem("caro_username") || "";
  let registered = false;
  let pendingMove = false;
  let lastRenderedMove = null;
  let lastWinner = null;
  let lastBoardCount = 0;
  let noticeTimeout = null;

  // ===== REMATCH PANEL =====
  const rematchPanel = document.createElement("section");
  rematchPanel.id = "rematchPanel";
  rematchPanel.className = "rematch-panel";
  rematchPanel.hidden = true;

  if (joinSection && joinSection.parentNode) {
    joinSection.parentNode.insertBefore(rematchPanel, joinSection.nextSibling);
  } else if (boardEl && boardEl.parentNode) {
    boardEl.parentNode.insertBefore(rematchPanel, boardEl.nextSibling);
  }

  // ===== HELPERS =====
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function showNotice(message, duration = 3500) {
    if (!noticeEl) return;

    noticeEl.textContent = message;
    noticeEl.classList.add("show");

    clearTimeout(noticeTimeout);
    noticeTimeout = setTimeout(() => {
      noticeEl.classList.remove("show");
    }, duration);
  }

  function playSound(type) {
    if (soundToggle && !soundToggle.checked) return;

    if (window.CaroSound && typeof window.CaroSound[type] === "function") {
      window.CaroSound[type]();
    }
  }

  function playEffect(type) {
    if (!window.CaroEffects) return;

    if (typeof window.CaroEffects[type] === "function") {
      window.CaroEffects[type]();
    }
  }

  function boardCount(board) {
    return Array.isArray(board)
      ? board.filter(Boolean).length
      : 0;
  }

  function getMyQueueItem(s) {
    if (!myName) return null;

    const all = [
      ...(Array.isArray(s.pendingQueue) ? s.pendingQueue : []),
      ...(Array.isArray(s.queue) ? s.queue : [])
    ];

    return all.find(item => {
      const name = typeof item === "string" ? item : item?.name;
      return name && name.toLowerCase() === myName.toLowerCase();
    }) || null;
  }

  function isMyGame(s) {
    if (!s?.activePlayer || !myName) return false;

    const activeName = typeof s.activePlayer === "string"
      ? s.activePlayer
      : s.activePlayer.name;

    return activeName &&
      activeName.toLowerCase() === myName.toLowerCase();
  }

  // ===== REGISTRATION =====
  function registerViewer() {
    if (!myName || !socket.connected) return;

    socket.emit("viewer:register", {
      username: myName,
      name: myName
    });

    registered = true;
  }

  function submitJoin() {
    const name = usernameInput?.value?.trim() || "";

    if (!name) {
      showNotice("Bạn hãy nhập tên trước nhé!");
      usernameInput?.focus();
      return;
    }

    if (name.length > 24) {
      showNotice("Tên không được dài quá 24 ký tự.");
      return;
    }

    myName = name;
    localStorage.setItem("caro_username", myName);

    registerViewer();
    showNotice("Đã gửi yêu cầu tham gia. Vui lòng chờ chủ LIVE duyệt!");

    renderRegistration();
  }

  function renderRegistration() {
    if (!joinSection) return;

    const item = state ? getMyQueueItem(state) : null;
    const active = state ? isMyGame(state) : false;

    if (active) {
      joinSection.hidden = true;
      return;
    }

    if (item) {
      joinSection.hidden = true;
      return;
    }

    if (state?.winner) {
      joinSection.hidden = true;
      return;
    }

    joinSection.hidden = false;

    if (usernameInput && myName) {
      usernameInput.value = myName;
    }
  }

  // ===== STATUS =====
  function renderStatus(s) {
    if (!statusEl) return;

    if (s.winner) {
      const winnerText = s.winner === "X"
        ? "CHỦ LIVE đã chiến thắng!"
        : "BẠN ĐÃ CHIẾN THẮNG!";

      statusEl.textContent = winnerText;
      return;
    }

    if (!s.activePlayer) {
      statusEl.textContent = "Đang chờ chủ LIVE chọn người chơi...";
      return;
    }

    const activeName = typeof s.activePlayer === "string"
      ? s.activePlayer
      : s.activePlayer.name;

    if (!isMyGame(s)) {
      statusEl.textContent = `Đang diễn ra trận đấu với ${activeName || "người chơi khác"}`;
      return;
    }

    statusEl.textContent = s.turn === "O"
      ? "ĐẾN LƯỢT BẠN ĐÁNH!"
      : "Đang chờ chủ LIVE đánh...";
  }

  // ===== BOARD =====
  function renderBoard(s) {
    if (!boardEl || !Array.isArray(s.board)) return;

    const fragment = document.createDocumentFragment();

    const lastMove = s.lastMove ||
      (Array.isArray(s.lastMoves) && s.lastMoves.length
        ? s.lastMoves[s.lastMoves.length - 1]
        : null);

    const lastIndex = typeof lastMove === "number"
      ? lastMove
      : lastMove?.index;

    s.board.forEach((value, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);

      if (value === "X") {
        cell.classList.add("x");
        cell.textContent = "X";
      } else if (value === "O") {
        cell.classList.add("o");
        cell.textContent = "O";
      }

      if (index === lastIndex) {
        cell.classList.add("last-move");
        cell.setAttribute("aria-label", "Nước đi mới nhất");
      }

      const canPlay =
        isMyGame(s) &&
        s.turn === "O" &&
        !s.winner &&
        !value &&
        !pendingMove;

      cell.disabled = !canPlay;
      cell.addEventListener("click", () => sendMove(index));

      fragment.appendChild(cell);
    });

    boardEl.replaceChildren(fragment);
  }

  function sendMove(index) {
    if (!state || !isMyGame(state)) return;
    if (state.turn !== "O" || state.winner || pendingMove) return;
    if (state.board?.[index]) return;

    pendingMove = true;

    socket.emit("viewer:move", {
      index,
      username: myName
    });

    setTimeout(() => {
      pendingMove = false;
      if (state) renderBoard(state);
    }, 1800);
  }

  // ===== SCORE =====
  function renderScores(s) {
    const hostScoreEl =
      document.getElementById("hostScore") ||
      document.querySelector(".host-score");

    const viewerScoreEl =
      document.getElementById("viewerScore") ||
      document.querySelector(".viewer-score");

    if (hostScoreEl) {
      hostScoreEl.textContent = s.scores?.host ?? 0;
    }

    if (viewerScoreEl) {
      viewerScoreEl.textContent = s.scores?.viewers ?? 0;
    }
  }

  // ===== QUEUE / PLAYER INFO =====
  function renderPlayerInfo(s) {
    const opponentEl =
      document.getElementById("opponent") ||
      document.querySelector(".opponent");

    if (!opponentEl) return;

    if (!s.activePlayer) {
      opponentEl.textContent = "Chưa có đối thủ";
      return;
    }

    const name = typeof s.activePlayer === "string"
      ? s.activePlayer
      : s.activePlayer.name;

    opponentEl.textContent = name || "Người chơi";
  }

  // ===== TIMER =====
  function renderTimer(s) {
    const timerEl =
      document.getElementById("timer") ||
      document.querySelector(".timer");

    if (!timerEl) return;

    if (s.winner || !s.activePlayer) {
      timerEl.textContent = "--";
      return;
    }

    if (s.turn === "O") {
      timerEl.textContent = isMyGame(s)
        ? "LƯỢT CỦA BẠN"
        : "LƯỢT NGƯỜI XEM";
    } else {
      timerEl.textContent = "LƯỢT CHỦ LIVE";
    }
  }

  // ===== REMATCH =====
  function renderRematch(s) {
    if (!rematchPanel) return;

    if (!s.winner || !s.activePlayer || !isMyGame(s)) {
      rematchPanel.hidden = true;
      rematchPanel.innerHTML = "";
      return;
    }

    rematchPanel.hidden = false;

    const request = s.rematchRequest;
    const viewerRequested = request === "viewer";
    const hostRequested = request === "host";

    if (viewerRequested) {
      rematchPanel.innerHTML = `
        <div class="rematch-content">
          <strong>Đã gửi yêu cầu đấu lại!</strong>
          <p>Đang chờ chủ LIVE xác nhận.</p>
          <span class="rematch-wait">Vui lòng chờ...</span>
        </div>
      `;
      return;
    }

    if (hostRequested) {
      rematchPanel.innerHTML = `
        <div class="rematch-content">
          <strong>Chủ LIVE muốn đấu lại!</strong>
          <p>Bạn có đồng ý chơi thêm một ván không?</p>
          <button type="button" id="confirmRematch" class="rematch-button">
            Đồng ý đấu lại
          </button>
        </div>
      `;

      document.getElementById("confirmRematch")
        ?.addEventListener("click", () => {
          socket.emit("viewer:rematch-confirm");
          showNotice("Đã gửi xác nhận đấu lại!");
        });

      return;
    }

    rematchPanel.innerHTML = `
      <div class="rematch-content">
        <strong>Ván đấu đã kết thúc!</strong>
        <p>Bạn có muốn đấu thêm một ván với chủ LIVE không?</p>
        <button type="button" id="requestRematch" class="rematch-button">
          Đấu lại
        </button>
      </div>
    `;

    document.getElementById("requestRematch")
      ?.addEventListener("click", () => {
        socket.emit("viewer:rematch-request");
        showNotice("Đã gửi yêu cầu đấu lại!");
      });
  }

  // ===== GAME EFFECTS =====
  function checkGameEffects(s) {
    const count = boardCount(s.board);

    if (count > lastBoardCount) {
      playSound("move");
    }

    lastBoardCount = count;

    if (s.winner && s.winner !== lastWinner) {
      if (s.winner === "O") {
        playSound("win");
        playEffect("win");
      } else {
        playSound("defeat");
        playEffect("defeat");
      }
    }

    if (!s.winner && lastWinner) {
      lastBoardCount = count;
    }

    lastWinner = s.winner || null;
  }

  // ===== MAIN RENDER =====
  function render(s) {
    if (!s) return;

    state = s;

    checkGameEffects(s);
    renderBoard(s);
    renderStatus(s);
    renderScores(s);
    renderPlayerInfo(s);
    renderTimer(s);
    renderRegistration();
    renderRematch(s);
  }

  // ===== EVENTS =====
  if (joinBtn) {
    joinBtn.addEventListener("click", event => {
      event.preventDefault();
      submitJoin();
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitJoin();
      }
    });
  }

  socket.on("connect", () => {
    registered = false;

    if (myName) {
      registerViewer();
    }

    showNotice("Đã kết nối phòng Caro LIVE.");
  });

  socket.on("disconnect", () => {
    registered = false;
    showNotice("Mất kết nối. Đang thử kết nối lại...");
  });

  socket.on("state", s => {
    pendingMove = false;
    render(s);
  });

  socket.on("notice", message => {
    showNotice(
      typeof message === "string"
        ? message
        : message?.message || "Có thông báo mới."
    );
  });

  socket.on("viewer:move:accepted", () => {
    pendingMove = false;
  });

  socket.on("viewer:move:rejected", message => {
    pendingMove = false;

    showNotice(
      typeof message === "string"
        ? message
        : message?.message || "Nước đi chưa được chấp nhận."
    );

    if (state) renderBoard(state);
  });

  socket.on("viewer:rematch:accepted", () => {
    showNotice("Yêu cầu đấu lại đã được chấp nhận!");
  });

  socket.on("viewer:rematch:rejected", message => {
    showNotice(
      typeof message === "string"
        ? message
        : message?.message || "Yêu cầu đấu lại chưa được chấp nhận."
    );
  });

  // ===== INITIAL LOAD =====
  if (usernameInput && myName) {
    usernameInput.value = myName;
  }

  fetch("/api/state")
    .then(response => {
      if (!response.ok) throw new Error("Không tải được trạng thái phòng");
      return response.json();
    })
    .then(s => render(s))
    .catch(() => {
      showNotice("Đang chờ dữ liệu phòng Caro LIVE...");
    });

  if (myName) {
    registerViewer();
  }

})();
