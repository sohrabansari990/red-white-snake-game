(() => {
  const GRID_SIZE = 20;
  const BOARD_PX = 480;
  const CELL_PX = BOARD_PX / GRID_SIZE;
  const HIGH_SCORE_KEY = "red_white_snake_best";

  const DIRECTIONS = {
    UP: { x: 0, y: -1, opposite: "DOWN" },
    DOWN: { x: 0, y: 1, opposite: "UP" },
    LEFT: { x: -1, y: 0, opposite: "RIGHT" },
    RIGHT: { x: 1, y: 0, opposite: "LEFT" },
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const pauseBtn = document.getElementById("pause-btn");
  const startBtn = document.getElementById("start-btn");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlay-kicker");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySubtitle = document.getElementById("overlay-subtitle");
  const speedChips = document.querySelectorAll(".chip[data-speed]");
  const dpadButtons = document.querySelectorAll(".dpad-btn[data-dir]");

  let baseSpeedMs = 110;
  let snake = [];
  let food = { x: 15, y: 10 };
  let direction = "RIGHT";
  let directionQueue = [];
  let score = 0;
  let highScore = loadHighScore();
  let status = "idle"; // "idle" | "running" | "paused" | "gameover"
  let tickTimer = null;
  let touchStart = null;

  highScoreEl.textContent = String(highScore);

  function loadHighScore() {
    try {
      const saved = Number(localStorage.getItem(HIGH_SCORE_KEY));
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore(value) {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(value));
    } catch {
      // Ignore storage errors in restricted contexts.
    }
  }

  function setupCanvasHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_PX * dpr;
    canvas.height = BOARD_PX * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetGameState() {
    snake = [
      { x: 6, y: 10 },
      { x: 5, y: 10 },
      { x: 4, y: 10 },
    ];
    direction = "RIGHT";
    directionQueue = [];
    score = 0;
    scoreEl.textContent = "0";
    spawnFood();
  }

  function spawnFood() {
    const occupied = new Set(snake.map((seg) => `${seg.x},${seg.y}`));
    const freeCells = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) {
          freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) {
      endGame("You filled the entire board!");
      return;
    }

    food = freeCells[Math.floor(Math.random() * freeCells.length)];
  }

  function startGame() {
    stopLoop();
    resetGameState();
    status = "running";
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    overlay.classList.add("hidden");
    draw();
    scheduleNextTick();
  }

  function togglePause() {
    if (status === "running") {
      status = "paused";
      stopLoop();
      pauseBtn.textContent = "Resume";
      showOverlay("PAUSED", "Game Paused", "Take a breather. Press Resume or Space to continue.", "Resume");
    } else if (status === "paused") {
      status = "running";
      pauseBtn.textContent = "Pause";
      overlay.classList.add("hidden");
      scheduleNextTick();
    }
  }

  function endGame(reason) {
    status = "gameover";
    stopLoop();
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    draw();
    showOverlay("GAME OVER", `Score: ${score}`, reason, "Play Again");
  }

  function showOverlay(kicker, title, subtitle, buttonLabel) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle;
    startBtn.textContent = buttonLabel;
    overlay.classList.remove("hidden");
  }

  function stopLoop() {
    if (tickTimer !== null) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  function currentTickMs() {
    const speedUp = Math.min(40, Math.floor(score / 3) * 3);
    return Math.max(55, baseSpeedMs - speedUp);
  }

  function scheduleNextTick() {
    stopLoop();
    if (status !== "running") return;
    tickTimer = setTimeout(() => {
      step();
      if (status === "running") {
        draw();
        scheduleNextTick();
      }
    }, currentTickMs());
  }

  function queueDirection(nextDir) {
    if (status !== "running") return;
    const lastPlanned = directionQueue.length > 0 ? directionQueue[directionQueue.length - 1] : direction;
    if (nextDir === lastPlanned || DIRECTIONS[nextDir].opposite === lastPlanned) {
      return;
    }
    if (directionQueue.length < 2) {
      directionQueue.push(nextDir);
    }
  }

  function step() {
    if (directionQueue.length > 0) {
      direction = directionQueue.shift();
    }

    const vec = DIRECTIONS[direction];
    const head = snake[0];
    const nextHead = { x: head.x + vec.x, y: head.y + vec.y };

    // Wall collision check
    if (nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE) {
      endGame("You hit the red wall!");
      return;
    }

    const willEat = nextHead.x === food.x && nextHead.y === food.y;
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);

    // Self collision check
    const hitSelf = bodyToCheck.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y);
    if (hitSelf) {
      endGame("You ate yourself!");
      return;
    }

    snake.unshift(nextHead);
    if (willEat) {
      score += 1;
      scoreEl.textContent = String(score);
      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = String(highScore);
        saveHighScore(highScore);
      }
      spawnFood();
    } else {
      snake.pop();
    }
  }

  function draw() {
    // White board background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

    // Subtle red-tinted grid lines
    ctx.strokeStyle = "#fee2e2";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i += 1) {
      const pos = i * CELL_PX;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, BOARD_PX);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(BOARD_PX, pos);
      ctx.stroke();
    }

    // Draw snack (food)
    drawFood();

    // Draw snake body & head
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const seg = snake[i];
      const isHead = i === 0;
      drawSegment(seg.x, seg.y, isHead, i);
    }
  }

  function drawFood() {
    const cx = food.x * CELL_PX + CELL_PX / 2;
    const cy = food.y * CELL_PX + CELL_PX / 2;
    const radius = CELL_PX * 0.36;

    // Outer soft halo
    ctx.fillStyle = "rgba(220, 38, 38, 0.16)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Main red snack
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Crisp white highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSegment(gridX, gridY, isHead, index) {
    const pad = isHead ? 1.5 : 2.5;
    const x = gridX * CELL_PX + pad;
    const y = gridY * CELL_PX + pad;
    const size = CELL_PX - pad * 2;
    const radius = isHead ? 7 : 5;

    ctx.fillStyle = isHead ? "#991b1b" : index % 2 === 0 ? "#dc2626" : "#ef4444";
    roundRect(ctx, x, y, size, size, radius);
    ctx.fill();

    if (isHead) {
      drawEyes(gridX, gridY);
    }
  }

  function drawEyes(gridX, gridY) {
    const cx = gridX * CELL_PX + CELL_PX / 2;
    const cy = gridY * CELL_PX + CELL_PX / 2;
    const offset = CELL_PX * 0.18;
    const forward = CELL_PX * 0.16;

    let eye1 = { x: cx, y: cy };
    let eye2 = { x: cx, y: cy };

    if (direction === "RIGHT") {
      eye1 = { x: cx + forward, y: cy - offset };
      eye2 = { x: cx + forward, y: cy + offset };
    } else if (direction === "LEFT") {
      eye1 = { x: cx - forward, y: cy - offset };
      eye2 = { x: cx - forward, y: cy + offset };
    } else if (direction === "UP") {
      eye1 = { x: cx - offset, y: cy - forward };
      eye2 = { x: cx + offset, y: cy - forward };
    } else {
      eye1 = { x: cx - offset, y: cy + forward };
      eye2 = { x: cx + offset, y: cy + forward };
    }

    ctx.fillStyle = "#ffffff";
    for (const eye of [eye1, eye2]) {
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  // Event listeners
  startBtn.addEventListener("click", () => {
    if (status === "paused") {
      togglePause();
    } else {
      startGame();
    }
  });

  pauseBtn.addEventListener("click", togglePause);

  speedChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      speedChips.forEach((btn) => btn.classList.remove("active"));
      chip.classList.add("active");
      baseSpeedMs = Number(chip.dataset.speed) || 110;
    });
  });

  dpadButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      queueDirection(btn.dataset.dir);
    });
  });

  document.addEventListener("keydown", (event) => {
    const keyMap = {
      ArrowUp: "UP",
      KeyW: "UP",
      ArrowDown: "DOWN",
      KeyS: "DOWN",
      ArrowLeft: "LEFT",
      KeyA: "LEFT",
      ArrowRight: "RIGHT",
      KeyD: "RIGHT",
    };

    if (keyMap[event.code]) {
      event.preventDefault();
      queueDirection(keyMap[event.code]);
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (status === "idle" || status === "gameover") {
        startGame();
      } else {
        togglePause();
      }
      return;
    }

    if (event.code === "KeyP" && (status === "running" || status === "paused")) {
      togglePause();
    } else if (event.code === "Enter" && (status === "idle" || status === "gameover")) {
      startGame();
    }
  });

  canvas.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    if (touch) {
      touchStart = { x: touch.clientX, y: touch.clientY };
    }
  }, { passive: true });

  canvas.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      queueDirection(dy > 0 ? "DOWN" : "UP");
    }
  }, { passive: true });

  // Initial render
  setupCanvasHiDPI();
  resetGameState();
  draw();
})();
