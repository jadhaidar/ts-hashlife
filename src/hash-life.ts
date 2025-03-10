import { LifeCanvasDrawer } from "./draw";
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
  pattern_path = "examples/";

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
  running = false;
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

  handleLoadExampleFromFile = async (item: {
    value: string;
    label: string;
  }) => {
    try {
      const response = await fetch(`/examples/${item.value}`);
      if (!response.ok)
        throw new Error(
          `Failed to fetch example file, cause: ${response.statusText}`
        );
      const content = await response.text();
      const pattern = {
        pattern_text: content,
        pattern_id: item.label,
      };
      this.setup_pattern(pattern);
      return pattern;
    } catch (error) {
      console.error(error);
    }
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

  // ----------------------------------------
  // Helpers
  // ----------------------------------------

  private fit_pattern = () => {
    const bounds = life.get_root_bounds();
    drawer.fit_bounds({
      top: bounds.top + this.ui_padding.top,
      bottom: bounds.bottom + this.ui_padding.bottom,
      left: bounds.left + this.ui_padding.left,
      right: bounds.right + this.ui_padding.right,
    });
  };

  private setup_pattern = ({
    pattern_text,
    pattern_id,
  }: // pattern_source_url,
  // view_url,
  // title,
  {
    pattern_text: string;
    pattern_id: string;
    pattern_source_url?: string;
    view_url?: string;
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
        short_comment: "",
      };
    }

    this.handleStop(() => {
      if (pattern_id && !result.title) result.title = pattern_id;
      life.clear_pattern();

      if (!is_mc) {
        const bounds = life.get_bounds(result.field_x!, result.field_y!);
        life.make_center(result.field_x!, result.field_y!, bounds);
        life.setup_field(result.field_x!, result.field_y!, bounds);
      } else {
        const mc = load_macrocell(life, pattern_text);
        if (!mc) return;
        result = mc;
        const step = 15;
        life.set_step(step);
        // pattern.step = Math.pow(2, step).toString();
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

      const pattern = {
        title: result.title,
        description:
          result.comment.replace(/\n/g, " - ") +
          ((document.querySelector("meta[name=description]") as HTMLMetaElement)
            ?.content ?? ""),
        source_url: this.rle_link(pattern_id, true),
        view_url: this.view_link(pattern_id),
        urls: result.urls,
      } as Pattern;

      eventBus.emit("pattern:load", pattern);
    });
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
    drawer.cell_width = this.cell_width;
    drawer.default_cell_width = this.cell_width;
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

  private rle_link = (id: string, absolute = false) => {
    if (!id.endsWith(".mc")) {
      id = id + ".rle";
    }

    if (!absolute || location.hostname === "localhost")
      return pattern_path + id;

    return "https://hashlife.jadhaidar.com/" + pattern_path + id;
  };

  private view_link = (id: string) => {
    return `${location.origin}?pattern=${id}`;
  };
}

export default HashLife;
