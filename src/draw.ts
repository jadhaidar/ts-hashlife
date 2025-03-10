import { TreeNode } from "./life-universe";
import EventBus from "./event-bus";

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

export class LifeCanvasDrawer {
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;

  private image_data!: ImageData;
  private image_data_data!: Int32Array;

  private pixel_ratio: number = 1;
  private cell_color_rgb!: { r: number; g: number; b: number };

  private canvas_width: number = 0;
  private canvas_height: number = 0;

  private _canvas_offset_x = 0;
  private _canvas_offset_y = 0;
  private _cell_width = 0;
  private _default_cell_width = 0;

  public border_width: number = 0;
  public background_color: string | null = null;
  public cell_color: string | null = null;

  constructor() {}

  // ----------------------------------------
  // Getters and setters
  // ----------------------------------------

  get default_cell_width(): number {
    return this._default_cell_width;
  }

  set default_cell_width(value: number) {
    this._default_cell_width = value;
  }

  private get canvas_offset_x(): number {
    return this._canvas_offset_x;
  }

  private set canvas_offset_x(value: number) {
    this._canvas_offset_x = value;
    EventBus.emit("pan:x", value.toFixed(0));
  }

  private get canvas_offset_y(): number {
    return this._canvas_offset_y;
  }

  private set canvas_offset_y(value: number) {
    this._canvas_offset_y = value;
    EventBus.emit("pan:y", value.toFixed(0));
  }

  get cell_width(): number {
    return this._cell_width;
  }

  set cell_width(value: number) {
    this._cell_width = value;
    this.border_width = Math.floor((value - 5) / 5) + 1;

    const ratio = value / this._default_cell_width;
    EventBus.emit(
      "zoom",
      ratio >= 1 ? `1:${Math.round(ratio)}` : `${Math.round(1 / ratio)}:1`
    );
  }

  private set_cell_width = (cell_width: number): boolean => {
    const clampedWidth = clamp(cell_width, 0.01, 500);
    if (clampedWidth === this.cell_width) return false;

    this.cell_width = clampedWidth;
    return true;
  };

  // ----------------------------------------
  //
  // ----------------------------------------

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    if (!canvas?.getContext) return false;

    this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    document.body.style.overscrollBehavior = "none";
    return true;
  }

  set_size(width: number, height: number): void {
    if (width !== this.canvas_width || height !== this.canvas_height) {
      const factor = window.devicePixelRatio || 1;
      this.pixel_ratio = factor;

      this.canvas.width = Math.round(width * factor);
      this.canvas.height = Math.round(height * factor);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      this.canvas_width = this.canvas.width;
      this.canvas_height = this.canvas.height;

      this.image_data = this.context.createImageData(
        this.canvas_width,
        this.canvas_height
      );
      this.image_data_data = new Int32Array(this.image_data.data.buffer);

      for (let i = 0; i < width * height; i++) {
        this.image_data_data[i] = 0xff << 24;
      }
    }
  }

  private draw_node(
    node: TreeNode,
    size: number,
    left: number,
    top: number
  ): void {
    if (node.population === 0) {
      return;
    }

    const adjustedLeft = left + this.canvas_offset_x;
    const adjustedTop = top + this.canvas_offset_y;
    const adjustedSize = size;

    if (
      adjustedLeft + adjustedSize < 0 ||
      adjustedTop + adjustedSize < 0 ||
      adjustedLeft >= this.canvas_width ||
      adjustedTop >= this.canvas_height
    ) {
      return;
    }

    if (node.level === 0 || adjustedSize <= 1) {
      if (node.population) {
        this.fill_square(adjustedLeft, adjustedTop, adjustedSize);
      }
    } else {
      size /= 2;
      this.draw_node((node as TreeNode).nw!, size, left, top);
      this.draw_node((node as TreeNode).ne!, size, left + size, top);
      this.draw_node((node as TreeNode).sw!, size, left, top + size);
      this.draw_node((node as TreeNode).se!, size, left + size, top + size);
    }
  }

  private fill_square(x: number, y: number, size: number): void {
    x = Math.round(x);
    y = Math.round(y);
    size = Math.round(size);

    let width = size - this.border_width;
    let height = width;

    if (x < 0) {
      width += x;
      x = 0;
    }

    if (x + width > this.canvas_width) {
      width = this.canvas_width - x;
    }

    if (y < 0) {
      height += y;
      y = 0;
    }

    if (y + height > this.canvas_height) {
      height = this.canvas_height - y;
    }

    if (width <= 0 || height <= 0) {
      return;
    }

    let pointer = x + y * this.canvas_width;
    const row_width = this.canvas_width - width;
    const color =
      this.cell_color_rgb.r |
      (this.cell_color_rgb.g << 8) |
      (this.cell_color_rgb.b << 16) |
      (0xff << 24);

    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        this.image_data_data[pointer] = color;
        pointer++;
      }
      pointer += row_width;
    }
  }

  redraw(node: any): void {
    const bg_color_rgb = this.color2rgb(this.background_color || "#000");
    const bg_color_int =
      bg_color_rgb.r |
      (bg_color_rgb.g << 8) |
      (bg_color_rgb.b << 16) |
      (0xff << 24);

    this.cell_color_rgb = this.color2rgb(this.cell_color || "#000");

    const count = this.canvas_width * this.canvas_height;

    for (let i = 0; i < count; i++) {
      this.image_data_data[i] = bg_color_int;
    }

    const size = Math.pow(2, node.level - 1) * this.cell_width;

    this.draw_node(node, 2 * size, -size, -size);

    this.context.putImageData(this.image_data, 0, 0);

    if (this.cell_width > 10) this.draw_grid_lines();
  }

  private draw_grid_lines(): void {
    const ctx = this.context;

    ctx.strokeStyle = `rgba(180, 180, 180, ${
      this.cell_width > 15 ? 0.2 : 0.4
    })`;
    ctx.lineWidth = Math.min(
      (Math.floor((this.cell_width - 10) / 10) + 1) / 4,
      1
    );

    const startX = this.canvas_offset_x % this.cell_width;
    const startY = this.canvas_offset_y % this.cell_width;

    // Vertical lines
    for (let x = startX; x < this.canvas_width; x += this.cell_width) {
      ctx.beginPath();
      ctx.moveTo(x - this.border_width / 2, 0);
      ctx.lineTo(x - this.border_width / 2, this.canvas_height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = startY; y < this.canvas_height; y += this.cell_width) {
      ctx.beginPath();
      ctx.moveTo(0, y - this.border_width / 2);
      ctx.lineTo(this.canvas_width, y - this.border_width / 2);
      ctx.stroke();
    }
  }

  pan(dx: number, dy: number): void {
    this.canvas_offset_x -= dx * this.pixel_ratio;
    this.canvas_offset_y -= dy * this.pixel_ratio;
  }

  center_view(): void {
    this.canvas_offset_x = this.canvas_width >> 1;
    this.canvas_offset_y = this.canvas_height >> 1;
  }

  private zoom(out: boolean, center_x: number, center_y: number): void {
    if (out) {
      const didUpdate = this.set_cell_width(this.cell_width / 2);
      if (!didUpdate) return;

      this.canvas_offset_x -= Math.round((this.canvas_offset_x - center_x) / 2);
      this.canvas_offset_y -= Math.round((this.canvas_offset_y - center_y) / 2);
    } else {
      const didUpdate = this.set_cell_width(this.cell_width * 2);
      if (!didUpdate) return;

      this.canvas_offset_x += Math.round(this.canvas_offset_x - center_x);
      this.canvas_offset_y += Math.round(this.canvas_offset_y - center_y);
    }
  }

  zoom_at(
    zoom_factor: number,
    pinch_origin_x: number,
    pinch_origin_y: number
  ): void {
    // Store the old cell width before updating
    const old_cell_width = this.cell_width;

    // Update the cell width with the new zoom factor
    const didUpdate = this.set_cell_width(this.cell_width * zoom_factor);
    if (!didUpdate) return;

    // Calculate the new scale factor
    const new_cell_width = this.cell_width;
    const scale_factor = new_cell_width / old_cell_width;

    // Adjust the canvas offsets to zoom relative to the pinch origin
    this.canvas_offset_x +=
      (1 - scale_factor) *
      (pinch_origin_x * this.pixel_ratio - this.canvas_offset_x);
    this.canvas_offset_y +=
      (1 - scale_factor) *
      (pinch_origin_y * this.pixel_ratio - this.canvas_offset_y);
  }

  zoom_centered(out: boolean): void {
    this.zoom(out, this.canvas_width >> 1, this.canvas_height >> 1);
  }

  zoom_to(level: number): void {
    while (this.cell_width > level) {
      this.zoom_centered(true);
    }
    while (this.cell_width * 2 < level) {
      this.zoom_centered(false);
    }
  }

  fit_bounds(bounds: {
    right: number;
    left: number;
    bottom: number;
    top: number;
  }): void {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;

    if (isFinite(width) && isFinite(height)) {
      const relative_size = Math.min(
        16, // maximum cell size
        this.canvas_width / width,
        this.canvas_height / height
      );
      this.zoom_to(relative_size);

      this.canvas_offset_x = Math.round(
        this.canvas_width / 2 - (bounds.left + width / 2) * this.cell_width
      );
      this.canvas_offset_y = Math.round(
        this.canvas_height / 2 - (bounds.top + height / 2) * this.cell_width
      );
    } else {
      this.zoom_to(16);
      this.canvas_offset_x = this.canvas_width >> 1;
      this.canvas_offset_y = this.canvas_height >> 1;
    }
  }

  // draw_cell(x: number, y: number, set: boolean): void {
  //   const size = this.cell_width + this.cell_width * this.zoom_factor;
  //   const cell_x = x * size + this.canvas_offset_x;
  //   const cell_y = y * size + this.canvas_offset_y;
  //   const width = Math.ceil(size) - size * this.border_width;
  //   console.log(size, cell_x, cell_y, width)

  //   this.context.fillStyle = set
  //     ? this.cell_color || "#000"
  //     : this.background_color || "#000";
  //   this.context.fillRect(cell_x, cell_y, width, width);
  // }

  pixel2cell(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(
        (x * this.pixel_ratio - this.canvas_offset_x + this.border_width / 2) /
          this.cell_width
      ),
      y: Math.floor(
        (y * this.pixel_ratio - this.canvas_offset_y + this.border_width / 2) /
          this.cell_width
      ),
    };
  }

  private color2rgb(color: string): { r: number; g: number; b: number } {
    if (color.length === 4) {
      return {
        r: parseInt(color[1] + color[1], 16),
        g: parseInt(color[2] + color[2], 16),
        b: parseInt(color[3] + color[3], 16),
      };
    } else {
      return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16),
      };
    }
  }
}
