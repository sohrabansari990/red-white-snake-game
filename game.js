(() => {
  const GRID_SIZE = 20;
  const BOARD_PX = 480;
  const CELL_PX = BOARD_PX / GRID_SIZE;
  const SNACKS_PER_LEVEL = 5;
  const BONUS_DURATION_MS = 7000;
  const HIGH_SCORE_KEY = "red_white_snake_best";

  const DIRECTIONS = {
    UP: { x: 0, y: -1, opposite: "DOWN" },
    DOWN: { x: 0, y: 1, opposite: "UP" },
    LEFT: { x: -1, y: 0, opposite: "RIGHT" },
    RIGHT: { x: 1, y: 0, opposite: "LEFT" },
  };

  // Level definitions. Spawn row y=10 (x=0..9) is kept clear on every level.
  const LEVELS = [
    {
      name: "Classic Arena",
      speedOffset: 0,
      buildObstacles: () => [],
    },
    {
      name: "Twin Pillars",
      speedOffset: 6,
      buildObstacles: () => {
        const blocks = [];
        for (let y = 4; y <= 8; y += 1) {
          blocks.push({ x: 5, y }, { x: 14, y });
        }
        for (let y = 12; y <= 15; y += 1) {
          blocks.push({ x: 5, y }, { x: 14, y });
        }
        return blocks;
      },
    },
    {
      name: "Crimson Gates",
      speedOffset: 12,
      buildObstacles: () => {
        const blocks = [];
        for (let x = 3; x <= 7; x += 1) {
          blocks.push({ x, y: 4 }, { x, y: 15 });
        }
        for (let x = 12; x <= 16; x += 1) {
          blocks.push({ x, y: 4 }, { x, y: 15 });
        }
        return blocks;
      },
    },
    {
      name: "The Crossbox",
      speedOffset: 18,
      buildObstacles: () => {
        const blocks = [];
        for (let y = 3; y <= 6; y += 1) {
          blocks.push({ x: 10, y });
        }
        for (let y = 13; y <= 16; y += 1) {
          blocks.push({ x: 10, y });
        }
        for (let x = 3; x <= 6; x += 1) {
          blocks.push({ x, y: 6 }, { x, y: 14 });
        }
        for (let x = 13; x <= 16; x += 1) {
          blocks.push({ x, y: 6 }, { x, y: 14 });
        }
        return blocks;
      },
    },
    {
      name: "Crimson Gauntlet",
      speedOffset: 24,
      buildObstacles: () => {
        const blocks = [];
        for (let x = 3; x <= 6; x += 1) {
          blocks.push({ x, y: 3 }, { x, y: 16 });
        }
        for (let x = 13; x <= 16; x += 1) {
          blocks.push({ x, y: 3 }, { x, y: 16 });
        }
        for (let y = 5; y <= 8; y += 1) {
          blocks.push({ x: 8, y }, { x: 12, y });
        }
        for (let y = 12; y <= 15; y += 1) {
          blocks.push({ x: 8, y }, { x: 12, y });
        }
        return blocks;
      },
    },
  ];

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const highScoreEl = document.getElementById("high-score");
  const levelNameEl = document.getElementById("level-name");
  const levelCountEl = document.getElementById("level-count");
  const levelProgressEl = document.getElementById("level-progress");

  const pauseBtn = document.getElementById("pause-btn");
  const soundBtn = document.getElementById("sound-btn");
  const startBtn = document.getElementById("start-btn");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlay-kicker");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySubtitle = document.getElementById("overlay-subtitle");

  const speedChips = document.querySelectorAll(".chip[data-speed]");
  const bgChips = document.querySelectorAll(".chip[data-bg]");
  const dpadButtons = document.querySelectorAll(".dpad-btn[data-dir]");

  let baseSpeedMs = 110;
  let boardBgStyle = "grid"; // "grid" | "dots" | "check"
  let soundEnabled = true;
  let audioCtx = null;

  let snake = [];
  let obstacles = [];
  let obstacleSet = new Set();
  let food = { x: 15, y: 10 };
  let bonusFood = null; // { x, y, expiresAt }
  let direction = "RIGHT";
  let directionQueue = [];
  let score = 0;
  let level = 1;
  let snacksInLevel = 0;
  let totalSnacks = 0;
  let highScore = loadHighScore();
  let status = "idle"; // "idle" | "running" | "paused" | "levelup" | "gameover"
  let tickTimer = null;
  let animFrame = null;
  let touchStart = null;

  let particles = [];
  let popups = [];

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

  function playTone(freq, durationSec, type = "sine", gainVal = 0.08, delay = 0) {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch {
      // Ignore audio errors.
    }
  }

  function playSound(kind) {
    if (kind === "eat") {
      playTone(520, 0.08, "triangle", 0.08, 0);
      playTone(720, 0.09, "triangle", 0.07, 0.04);
    } else if (kind === "bonus") {
      playTone(660, 0.09, "sine", 0.09, 0);
      playTone(880, 0.09, "sine", 0.09, 0.06);
      playTone(1120, 0.14, "sine", 0.08, 0.12);
    } else if (kind === "levelup") {
      playTone(523, 0.1, "triangle", 0.09, 0);
      playTone(659, 0.1, "triangle", 0.09, 0.08);
      playTone(784, 0.16, "triangle", 0.09, 0.16);
    } else if (kind === "gameover") {
      playTone(260, 0.14, "sawtooth", 0.07, 0);
      playTone(180, 0.24, "sawtooth", 0.07, 0.12);
    }
  }

  function setupCanvasHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_PX * dpr;
    canvas.height = BOARD_PX * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getLevelConfig(lvl) {
    const idx = Math.min(lvl - 1, LEVELS.length - 1);
    return LEVELS[idx];
  }

  function loadLevelLayout(lvl) {
    const cfg = getLevelConfig(lvl);
    obstacles = cfg.buildObstacles();
    obstacleSet = new Set(obstacles.map((o) => `${o.x},${o.y}`));
  }

  function resetSnakePosition() {
    snake = [
      { x: 6, y: 10 },
      { x: 5, y: 10 },
      { x: 4, y: 10 },
    ];
    direction = "RIGHT";
    directionQueue = [];
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
    const cfg = getLevelConfig(level);
    levelNameEl.textContent = `Level ${level} \u2022 ${cfg.name}`;
    levelCountEl.textContent = `${snacksInLevel} / ${SNACKS_PER_LEVEL} snacks`;
    levelProgressEl.style.width = `${(snacksInLevel / SNACKS_PER_LEVEL) * 100}%`;
  }

  function resetGameState() {
    score = 0;
    level = 1;
    snacksInLevel = 0;
    totalSnacks = 0;
    bonusFood = null;
    particles = [];
    popups = [];
    loadLevelLayout(level);
    resetSnakePosition();
    updateHUD();
    spawnFood();
  }

  function getFreeCells() {
    const occupied = new Set([
      ...snake.map((seg) => `${seg.x},${seg.y}`),
      ...obstacleSet,
    ]);
    if (food) occupied.add(`${food.x},${food.y}`);
    if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);

    const freeCells = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) {
          freeCells.push({ x, y });
        }
      }
    }
    return freeCells;
  }

  function spawnFood() {
    food = null;
    const freeCells = getFreeCells();
    if (freeCells.length === 0) {
      endGame("You filled the entire board!");
      return;
    }
    food = freeCells[Math.floor(Math.random() * freeCells.length)];
  }

  function spawnBonusFood() {
    const freeCells = getFreeCells();
    if (freeCells.length === 0) return;
    const cell = freeCells[Math.floor(Math.random() * freeCells.length)];
    bonusFood = {
      x: cell.x,
      y: cell.y,
      expiresAt: performance.now() + BONUS_DURATION_MS,
    };
  }

  function emitParticles(gridX, gridY, count = 12) {
    const cx = gridX * CELL_PX + CELL_PX / 2;
    const cy = gridY * CELL_PX + CELL_PX / 2;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 1.2 + Math.random() * 2.4;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 2.5 + Math.random() * 2.5,
        color: i % 2 === 0 ? "#dc2626" : "#fecaca",
      });
    }
  }

  function addPopup(gridX, gridY, text) {
    popups.push({
      x: gridX * CELL_PX + CELL_PX / 2,
      y: gridY * CELL_PX + CELL_PX / 2,
      text,
      life: 1,
    });
  }

  function startGame() {
    stopLoop();
    resetGameState();
    status = "running";
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    overlay.classList.add("hidden");
    startRenderLoop();
    scheduleNextTick();
  }

  function continueNextLevel() {
    status = "running";
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    overlay.classList.add("hidden");
    startRenderLoop();
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

  function triggerLevelUp() {
    level += 1;
    snacksInLevel = 0;
    bonusFood = null;
    loadLevelLayout(level);
    resetSnakePosition();
    spawnFood();
    updateHUD();

    status = "levelup";
    stopLoop();
    pauseBtn.disabled = true;
    playSound("levelup");

    const cfg = getLevelConfig(level);
    showOverlay(
      "LEVEL UP!",
      `Level ${level}: ${cfg.name}`,
      "New red barriers unlocked and speed increased. Ready for the next arena?",
      `Start Level ${level}`
    );
  }

  function endGame(reason) {
    status = "gameover";
    stopLoop();
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    playSound("gameover");
    showOverlay("GAME OVER", `Score: ${score}`, `${reason} Reached Level ${level}.`, "Play Again");
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
    const cfg = getLevelConfig(level);
    const extraLevelBoost = Math.max(0, level - LEVELS.length) * 5;
    const scoreBoost = Math.min(20, Math.floor(score / 6) * 2);
    return Math.max(52, baseSpeedMs - cfg.speedOffset - extraLevelBoost - scoreBoost);
  }

  function scheduleNextTick() {
    stopLoop();
    if (status !== "running") return;
    tickTimer = setTimeout(() => {
      step();
      if (status === "running") {
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

  function addScore(points) {
    score += points;
    if (score > highScore) {
      highScore = score;
      highScoreEl.textContent = String(highScore);
      saveHighScore(highScore);
    }
  }

  function step() {
    if (directionQueue.length > 0) {
      direction = directionQueue.shift();
    }

    if (bonusFood && performance.now() >= bonusFood.expiresAt) {
      bonusFood = null;
    }

    const vec = DIRECTIONS[direction];
    const head = snake[0];
    const nextHead = { x: head.x + vec.x, y: head.y + vec.y };

    // Outer wall collision check
    if (nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE) {
      emitParticles(head.x, head.y, 16);
      endGame("You touched the outer red wall!");
      return;
    }

    // Inner barrier collision check
    if (obstacleSet.has(`${nextHead.x},${nextHead.y}`)) {
      emitParticles(head.x, head.y, 16);
      endGame("You crashed into a red barrier!");
      return;
    }

    const willEatFood = food && nextHead.x === food.x && nextHead.y === food.y;
    const willEatBonus = bonusFood && nextHead.x === bonusFood.x && nextHead.y === bonusFood.y;
    const willGrow = willEatFood || willEatBonus;
    const bodyToCheck = willGrow ? snake : snake.slice(0, -1);

    // Self collision check
    if (bodyToCheck.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y)) {
      emitParticles(nextHead.x, nextHead.y, 16);
      endGame("You ate yourself!");
      return;
    }

    snake.unshift(nextHead);
    if (!willGrow) {
      snake.pop();
      return;
    }

    if (willEatBonus) {
      addScore(3);
      emitParticles(nextHead.x, nextHead.y, 16);
      addPopup(nextHead.x, nextHead.y, "+3 BONUS");
      playSound("bonus");
      bonusFood = null;
      updateHUD();
    }

    if (willEatFood) {
      addScore(1);
      snacksInLevel += 1;
      totalSnacks += 1;
      emitParticles(nextHead.x, nextHead.y, 10);
      addPopup(nextHead.x, nextHead.y, "+1");
      playSound("eat");

      if (snacksInLevel >= SNACKS_PER_LEVEL) {
        triggerLevelUp();
        return;
      }

      spawnFood();
      if (!bonusFood && totalSnacks % 4 === 0) {
        spawnBonusFood();
      }
      updateHUD();
    }
  }

  function drawBoardBackground() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

    if (boardBgStyle === "grid") {
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
    } else if (boardBgStyle === "dots") {
      ctx.fillStyle = "#fecaca";
      for (let y = 1; y < GRID_SIZE; y += 1) {
        for (let x = 1; x < GRID_SIZE; x += 1) {
          ctx.beginPath();
          ctx.arc(x * CELL_PX, y * CELL_PX, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (boardBgStyle === "check") {
      ctx.fillStyle = "#fff5f5";
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          if ((x + y) % 2 === 1) {
            ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
          }
        }
      }
    }
  }

  function drawObstacles() {
    for (const block of obstacles) {
      const x = block.x * CELL_PX + 1.5;
      const y = block.y * CELL_PX + 1.5;
      const size = CELL_PX - 3;

      ctx.fillStyle = "#991b1b";
      roundRect(ctx, x, y, size, size, 4);
      ctx.fill();

      // White inner accent so barriers look crisp and distinct
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + size - 4);
      ctx.lineTo(x + size - 4, y + 4);
      ctx.stroke();
    }
  }

  function drawFood(now) {
    if (!food) return;
    const cx = food.x * CELL_PX + CELL_PX / 2;
    const cy = food.y * CELL_PX + CELL_PX / 2;
    const pulse = 1 + Math.sin(now * 0.008) * 0.07;
    const radius = CELL_PX * 0.35 * pulse;

    ctx.fillStyle = "rgba(220, 38, 38, 0.16)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBonusFood(now) {
    if (!bonusFood) return;
    const remainingRatio = Math.max(0, (bonusFood.expiresAt - now) / BONUS_DURATION_MS);
    const cx = bonusFood.x * CELL_PX + CELL_PX / 2;
    const cy = bonusFood.y * CELL_PX + CELL_PX / 2;
    const radius = CELL_PX * 0.38;

    // Countdown ring
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingRatio);
    ctx.stroke();

    // Diamond-styled red & white bonus snack
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#b91c1c";
    const box = radius * 1.45;
    roundRect(ctx, -box / 2, -box / 2, box, box, 3);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    const inner = box * 0.42;
    ctx.fillRect(-inner / 2, -inner / 2, inner, inner);
    ctx.restore();
  }

  function drawSegment(gridX, gridY, isHead, index) {
    const pad = isHead ? 1.5 : 2.4;
    const x = gridX * CELL_PX + pad;
    const y = gridY * CELL_PX + pad;
    const size = CELL_PX - pad * 2;
    const radius = isHead ? 7 : 5;

    ctx.fillStyle = isHead ? "#991b1b" : index % 2 === 0 ? "#dc2626" : "#ef4444";
    roundRect(ctx, x, y, size, size, radius);
    ctx.fill();

    if (!isHead) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.beginPath();
      ctx.arc(gridX * CELL_PX + CELL_PX / 2, gridY * CELL_PX + CELL_PX / 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
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

  function updateAndDrawEffects() {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.045;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const pop = popups[i];
      pop.y -= 0.7;
      pop.life -= 0.03;
      if (pop.life <= 0) {
        popups.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = pop.life;
      ctx.fillStyle = "#991b1b";
      ctx.font = "800 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  function draw(now = performance.now()) {
    drawBoardBackground();
    drawObstacles();
    drawFood(now);
    drawBonusFood(now);

    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const seg = snake[i];
      drawSegment(seg.x, seg.y, i === 0, i);
    }

    updateAndDrawEffects();
  }

  function startRenderLoop() {
    if (animFrame !== null) return;
    const frame = (now) => {
      draw(now);
      if (status === "running" || particles.length > 0 || popups.length > 0) {
        animFrame = requestAnimationFrame(frame);
      } else {
        animFrame = null;
      }
    };
    animFrame = requestAnimationFrame(frame);
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
    } else if (status === "levelup") {
      continueNextLevel();
    } else {
      startGame();
    }
  });

  pauseBtn.addEventListener("click", togglePause);

  soundBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = soundEnabled ? "Sound: On" : "Sound: Off";
    soundBtn.setAttribute("aria-pressed", String(soundEnabled));
  });

  speedChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      speedChips.forEach((btn) => btn.classList.remove("active"));
      chip.classList.add("active");
      baseSpeedMs = Number(chip.dataset.speed) || 110;
    });
  });

  bgChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      bgChips.forEach((btn) => btn.classList.remove("active"));
      chip.classList.add("active");
      boardBgStyle = chip.dataset.bg || "grid";
      draw();
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
      } else if (status === "levelup") {
        continueNextLevel();
      } else {
        togglePause();
      }
      return;
    }

    if (event.code === "KeyP" && (status === "running" || status === "paused")) {
      togglePause();
    } else if (event.code === "Enter") {
      if (status === "idle" || status === "gameover") {
        startGame();
      } else if (status === "levelup") {
        continueNextLevel();
      }
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
