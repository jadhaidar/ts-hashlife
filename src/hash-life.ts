import { clamp, LifeCanvasDrawer } from "./draw";
import { LifeUniverse, TreeNode } from "./life-universe";
import eventBus from "./event-bus";
import { formats, Pattern, Result } from "./formats";
import { load_macrocell } from "./macrocell";

const drawer = new LifeCanvasDrawer();
const life = new LifeUniverse();

const DEFAULT_BORDER = 2,
  DEFAULT_CELL = 10,
  DEFAULT_CELL_COLOR = "#f48c06",
  DEFAULT_BACKGROUND_COLOR = "#000814",
  DEFAULT_FPS = 60,
  /*
   * path to the folder with all patterns
   */
  PATTERNS_PATH = "/patterns";

export type HashLifeOptions = {
  max_fps?: number;
  border_width?: number;
  cell_width?: number;
  background_color?: string;
  cell_color?: string;
  ui_padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
};

class HashLife {
  private _running = false;
  private onStop: (() => void) | null = null;

  private max_fps: number;
  private border_width: number;
  private cell_width: number;
  private background_color: string;
  private cell_color: string;
  private ui_padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  constructor(opts: HashLifeOptions = {}) {
    this.max_fps = opts.max_fps ?? DEFAULT_FPS;
    this.border_width = opts.border_width ?? DEFAULT_BORDER;
    this.cell_width = opts.cell_width ?? DEFAULT_CELL;
    this.background_color = opts.background_color ?? DEFAULT_BACKGROUND_COLOR;
    this.cell_color = opts.cell_color ?? DEFAULT_CELL_COLOR;
    this.ui_padding = {
      top: opts.ui_padding?.top ?? 0,
      right: opts.ui_padding?.right ?? 0,
      bottom: opts.ui_padding?.bottom ?? 0,
      left: opts.ui_padding?.left ?? 0,
    };
  }

  get running() {
    return this._running;
  }

  set running(value) {
    this._running = value;
    eventBus.emit(value ? "start" : "stop", value);
  }

  // ----------------------------------------
  // Event handlers
  // ----------------------------------------

  handleInit(canvas: HTMLCanvasElement) {
    const init = drawer.init(canvas);
    if (!init) return false;

    this.handleWindowResize();
    this.reset_settings();

    return true;
  }

  handleStart = () => {
    if (this.running) return;

    let n = 0,
      start = Date.now(),
      frame_time = 1000 / this.max_fps,
      per_frame = frame_time,
      last_frame = start - per_frame;

    this.running = true;

    if (life.generation === 0) {
      life.save_rewind_state();
    }

    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      eventBus.emit("fps", (1000 / frame_time).toFixed(1));
    }, 666);

    const update = () => {
      if (!this.running) {
        if (interval) clearInterval(interval);
        eventBus.emit("fps", "00.0");

        if (this.onStop) {
          this.onStop();
          this.onStop = null;
        }
        return;
      }

      const time = Date.now();

      if (per_frame * n < time - start) {
        life.next_generation(true);
        drawer.redraw(life.root);

        if (life.root?.population && life.root.population > 0)
          eventBus.emit("population", life.root.population);

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
  };

  handleStop = (callback?: () => void) => {
    if (this.running) {
      this.running = false;
      if (callback) this.onStop = callback;
    } else {
      if (callback) callback();
    }
  };

  handleToggle = (callback?: () => void) => {
    if (this.running) this.handleStop(callback);
    else this.handleStart();
  };

  handleReset = () => {
    if (life.rewind_state) {
      this.handleStop(() => {
        life.restore_rewind_state();
        this.fit_pattern();
        drawer.redraw(life.root);
      });
    }
  };

  handleStep = () => {
    this.step(true);
  };

  handleSpeedUp = () => {
    life.set_step(life.step + 1);
  };

  handleSlowDown = () => {
    if (life.step <= 0) return;
    life.set_step(life.step - 1);
  };

  handleFitPattern = () => {
    this.fit_pattern();
    this.lazy_redraw(life.root);
  };

  handleLoadExampleFromFile = ({
    pattern_text,
    pattern_id,
    pattern_path,
    title,
  }: {
    pattern_text: string;
    pattern_id?: string;
    pattern_path?: string;
    title?: string;
  }) => {
    const is_mc = pattern_text.startsWith("[M2]");
    let result: Result;

    if (!is_mc) {
      const payload = formats.parse_pattern(pattern_text.trim());

      if (payload.error) {
        throw new Error(payload.error);
      } else {
        result = payload as Result;
      }
    } else {
      result = {
        comment: "",
        urls: [],
      };
    }

    this.handleStop(() => {
      life.clear_pattern();

      if (!is_mc) {
        const bounds = life.get_bounds(result.field_x!, result.field_y!);
        life.make_center(result.field_x!, result.field_y!, bounds);
        life.setup_field(result.field_x!, result.field_y!, bounds);
      } else {
        const mc = load_macrocell(life, pattern_text);
        if (!mc) {
          throw new Error("Failed to load macrocell");
        }
        result = mc;
        life.set_step(15);
      }

      life.save_rewind_state();

      if (result.rule_s && result.rule_b) {
        life.set_rules(result.rule_s, result.rule_b);
      } else {
        life.set_rules((1 << 2) | (1 << 3), 1 << 3); // Default rules
      }

      this.fit_pattern();
      drawer.redraw(life.root);

      if (life.root?.population)
        eventBus.emit("population", life.root.population);

      if (pattern_id && !result.title) result.title = pattern_id;
      const pattern: Pattern = {
        title: result.title || title || pattern_id || "Untitled",
        author: result.author,
        rule: result.rule,
        description: result.comment,
        source_url: PATTERNS_PATH + pattern_path,
        view_url: pattern_path ?? "",
        urls: result.urls,
      };

      eventBus.emit("pattern:load", pattern);
    });
  };

  handleLoadRandomizedPattern = ({
    density,
    width,
    height,
  }: {
    density: number;
    width: number;
    height: number;
  }) => {
    const normalizedDensity = clamp(density, 0, 1);
    const normalizedWidth = clamp(width, 100, 1000);
    const normalizedHeight = clamp(height, 100, 1000);

    this.handleStop(() => {
      life.clear_pattern();

      // Calculate number of cells based on density and dimensions
      const cellCount = Math.round(
        normalizedWidth * normalizedHeight * normalizedDensity
      );

      // Create arrays for cell coordinates
      const field_x = new Int32Array(cellCount);
      const field_y = new Int32Array(cellCount);

      // Generate random positions
      for (let i = 0; i < cellCount; i++) {
        field_x[i] = Math.floor(Math.random() * normalizedWidth);
        field_y[i] = Math.floor(Math.random() * normalizedHeight);
      }

      // Set up the universe with the random pattern
      const bounds = life.get_bounds(field_x, field_y);
      life.make_center(field_x, field_y, bounds);
      life.setup_field(field_x, field_y, bounds);

      // Save initial state for reset functionality
      life.save_rewind_state();

      // Fit pattern to view and redraw
      this.fit_pattern();
      drawer.redraw(life.root);

      // Update population count in UI
      if (life.root?.population) {
        eventBus.emit("population", life.root.population);
      }

      // Emit pattern load event with random pattern information
      const pattern: Pattern = {
        title: "Random pattern",
        author: "",
        rule: "",
        description: `Randomly generated pattern with density ${normalizedDensity.toFixed(
          2
        )}, width ${normalizedWidth}, height ${normalizedHeight}`,
        source_url: "",
        view_url: "",
        urls: [],
      };

      eventBus.emit("pattern:load", pattern);
    });
  };

  handleWindowResize = () => {
    drawer.set_size(
      window.innerWidth,
      document.body.offsetHeight || window.innerHeight
    );
    requestAnimationFrame(() => this.lazy_redraw(life.root));
  };

  handlePan = (dx: number, dy: number) => {
    drawer.pan(dx, dy);
    this.lazy_redraw(life.root);
  };

  handleZoom = (zoomRatio: number, x: number, y: number) => {
    drawer.zoom_at(zoomRatio, x, y);
    this.lazy_redraw(life.root);
  };

  handleSetUiPadding = (
    padding: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    } = {}
  ) => {
    this.ui_padding = { ...this.ui_padding, ...padding };
    this.fit_pattern();
  };

  // ----------------------------------------
  // Helpers
  // ----------------------------------------

  private fit_pattern = () => {
    const bounds = life.get_root_bounds();
    drawer.fit_bounds(
      {
        top: bounds.top,
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
      },
      {
        top: this.ui_padding.top,
        bottom: this.ui_padding.bottom,
        left: this.ui_padding.left,
        right: this.ui_padding.right,
      }
    );
  };

  private step = (is_single = false) => {
    const time = Date.now();

    if (life.generation === 0) {
      life.save_rewind_state();
    }

    life.next_generation(is_single);
    drawer.redraw(life.root);

    eventBus.emit("fps", (1000 / (Date.now() - time)).toFixed(1));
    if (life.root?.population)
      eventBus.emit("population", life.root.population);
  };

  private reset_settings = () => {
    drawer.background_color = this.background_color;

    drawer.cell_color = this.cell_color;
    drawer.default_cell_width = this.cell_width;
    drawer.cell_width = this.cell_width;
    drawer.border_width = this.border_width;

    drawer.center_view();

    life.rule_b = 1 << 3;
    life.rule_s = (1 << 2) | (1 << 3);
    life.set_step(0);
  };

  private lazy_redraw = (node: TreeNode | null) => {
    if (!this.running || this.max_fps < 15) {
      drawer.redraw(node);
    }
  };
}

export default HashLife;
