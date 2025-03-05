// Get references to DOM elements
const canvas = document.getElementById("canvas");
const populationEl = document.getElementById("population");
const mouseXEl = document.getElementById("mouse-x");
const mouseYEl = document.getElementById("mouse-y");
const fpsEl = document.getElementById("fps");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const restartBtn = document.getElementById("restart-btn");
const speedUpBtn = document.getElementById("speed-up-btn");
const speedDownBtn = document.getElementById("speed-down-btn");
const fitBtn = document.getElementById("fit-btn");

// Constants
const DEFAULT_BORDER = 2;
const DEFAULT_CELL = 10;
const DEFAULT_FPS = 60;

const drawer = new window.HashLife.LifeCanvasDrawer();
const life = new window.HashLife.LifeUniverse();

// App state
let running = false;
let onStop = null;
let max_fps = DEFAULT_FPS;

// ----------------------------------------
// Initialization
// ----------------------------------------

function init() {
  // Initialize the canvas
  const initialized = drawer.init(canvas);
  if (!initialized) {
    console.error("Failed to initialize canvas");
    return;
  }

  // Set up initial view and settings
  handleWindowResize();
  resetSettings();

  // Set up a simple glider pattern
  setupGlider();

  // Set up event listeners
  setupEventListeners();
}

function resetSettings() {
  drawer.background_color = "#000814";
  drawer.cell_color = "#f48c06";
  drawer.border_width = DEFAULT_BORDER;
  drawer.cell_width = DEFAULT_CELL;

  // Set rules for Conway's Game of Life (B3/S23)
  life.rule_b = 1 << 3;
  life.rule_s = (1 << 2) | (1 << 3);
  life.set_step(0);

  max_fps = DEFAULT_FPS;

  drawer.center_view();
}

function setupGlider() {
  // Create a simple glider pattern
  const gliderPattern = `#N Glider
#O Richard K. Guy
#C The smallest, most common, and first discovered spaceship. Diagonal speed c/4.
#C www.conwaylife.com/wiki/index.php?title=Glider
x = 3, y = 3, rule = B3/S23
bob$2bo$3o!`;

  setupPattern({
    pattern_text: gliderPattern,
    pattern_id: "glider",
  });
}

// ----------------------------------------
// Event Handlers
// ----------------------------------------

function setupEventListeners() {
  // Window resize
  window.addEventListener("resize", debounce(handleWindowResize, 200));

  // Button listeners
  startBtn.addEventListener("click", handleStart);
  stopBtn.addEventListener("click", () => handleStop());
  restartBtn.addEventListener("click", () => {
    handleStop(() => {
      life.clear_pattern();
      setupGlider();
    });
  });
  speedUpBtn.addEventListener("click", () => {
    life.set_step(life.step + 1);
  });
  speedDownBtn.addEventListener("click", () => {
    if (life.step > 0) {
      life.set_step(life.step - 1);
    }
  });
  fitBtn.addEventListener("click", fitPattern);

  // Canvas interaction
  setupCanvasInteractions();

  // Keyboard shortcuts
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      running ? handleStop() : handleStart();
    }
  });
}

function setupCanvasInteractions() {
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  // Track mouse position
  canvas.addEventListener("mousemove", (event) => {
    updateHud(mouseXEl, Math.round(event.clientX));
    updateHud(mouseYEl, Math.round(event.clientY));

    if (isDragging) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      drawer.pan(-dx, -dy);
      lazyRedraw(life.root);

      lastX = event.clientX;
      lastY = event.clientY;
    }
  });

  // Handle drag start
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      // Left mouse button
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.style.cursor = "grabbing";
    }
  });

  // Handle drag end
  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = "default";
    }
  });

  // Handle zooming with wheel
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    drawer.zoom_at(zoomFactor, event.clientX, event.clientY);
    lazyRedraw(life.root);
  });

  // Touch events for mobile
  let lastDistance = 0;

  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      // Single touch for panning
      isDragging = true;
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      // Double touch for pinch-zoom
      lastDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
    }
  });

  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();

    if (event.touches.length === 1 && isDragging) {
      // Handle panning
      const dx = event.touches[0].clientX - lastX;
      const dy = event.touches[0].clientY - lastY;
      drawer.pan(-dx, -dy);

      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      // Handle pinch-zoom
      const currentDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );

      if (lastDistance > 0) {
        const zoomRatio = currentDistance / lastDistance;

        // Calculate the midpoint of the two touches
        const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

        drawer.zoom_at(zoomRatio, midX, midY);
      }

      lastDistance = currentDistance;
    }

    lazyRedraw(life.root);
  });

  canvas.addEventListener("touchend", () => {
    isDragging = false;
    lastDistance = 0;
  });
}

function handleWindowResize() {
  drawer.set_size(window.innerWidth, window.innerWidth);
  requestAnimationFrame(() => lazyRedraw(life.root));
}

// ----------------------------------------
// Game Loop and Controls
// ----------------------------------------

function handleStart() {
  if (running) return;

  let n = 0;
  let start = Date.now();
  let frame_time = 1000 / max_fps;
  let per_frame = frame_time;
  let last_frame = start - per_frame;

  running = true;
  startBtn.textContent = "Running...";

  if (life.generation === 0) {
    life.save_rewind_state();
  }

  let fpsInterval = null;

  if (fpsEl) {
    fpsInterval = setInterval(() => {
      updateHud(fpsEl, (1000 / frame_time).toFixed(1));
    }, 666);
  }

  const update = () => {
    if (!running) {
      if (fpsInterval) clearInterval(fpsInterval);
      updateHud(fpsEl, "00.0");
      startBtn.textContent = "Start";

      if (onStop) {
        onStop();
        onStop = null;
      }
      return;
    }

    const time = Date.now();

    if (per_frame * n < time - start) {
      life.next_generation(true);
      drawer.redraw(life.root);

      if (life.root?.population) {
        updateHud(populationEl, formatThousands(life.root.population));
      }

      n++;

      frame_time += (-last_frame - frame_time + (last_frame = time)) / 15;

      if (frame_time < 0.7 * per_frame) {
        n = 1;
        start = Date.now();
      }
    }

    window.requestAnimationFrame(update);
  };

  update();
}

function handleStop(callback) {
  if (running) {
    running = false;
    startBtn.textContent = "Start";

    if (callback) onStop = callback;
  } else {
    if (callback) callback();
  }
}

// ----------------------------------------
// Pattern Management
// ----------------------------------------

function setupPattern({ pattern_text, pattern_id }) {
  const is_mc = pattern_text.startsWith("[M2]");
  let result;

  if (!is_mc) {
    const payload = window.HashLife.formats.parse_pattern(pattern_text.trim());

    if (payload.error) {
      console.error(payload.error);
      return;
    } else {
      result = payload;
    }
  } else {
    result = {
      comment: "",
      urls: [],
      short_comment: "",
    };
  }

  handleStop(() => {
    if (pattern_id && !result.title) {
      result.title = pattern_id;
    }

    life.clear_pattern();

    if (!is_mc) {
      const bounds = life.get_bounds(result.field_x, result.field_y);
      life.make_center(result.field_x, result.field_y, bounds);
      life.setup_field(result.field_x, result.field_y, bounds);
    } else {
      const mc = window.HashLife.load_macrocell(life, pattern_text);
      if (!mc) return;
      result = mc;
      const step = 15;
      life.set_step(step);
    }

    life.save_rewind_state();

    if (result.rule_s && result.rule_b) {
      life.set_rules(result.rule_s, result.rule_b);
    } else {
      // Default rules: B3/S23 (Conway's Game of Life)
      life.set_rules((1 << 2) | (1 << 3), 1 << 3);
    }

    fitPattern();
    drawer.redraw(life.root);

    if (life.root?.population) {
      updateHud(populationEl, formatThousands(life.root.population));
    }
  });
}

function fitPattern() {
  const bounds = life.get_root_bounds();
  drawer.fit_bounds(bounds);
  lazyRedraw(life.root);
}

// ----------------------------------------
// Utility Functions
// ----------------------------------------

function lazyRedraw(node) {
  if (!running || max_fps < 15) {
    drawer.redraw(node);
  }
}

function updateHud(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function formatThousands(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize when the page is loaded
window.addEventListener("load", init);
