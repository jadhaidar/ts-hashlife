"use strict";

import eventBus from "./event-bus";

const LOAD_FACTOR = 0.9;
const INITIAL_SIZE = 16;
const HASHMAP_LIMIT = 24;

const MASK_LEFT = 1;
const MASK_TOP = 2;
const MASK_RIGHT = 4;
const MASK_BOTTOM = 8;

export class TreeNode {
  nw: TreeNode | null;
  ne: TreeNode | null;
  sw: TreeNode | null;
  se: TreeNode | null;
  id: number;
  level: number;
  population: number;
  cache: TreeNode | null;
  quick_cache: TreeNode | null;
  hashmap_next: TreeNode | undefined;

  constructor(
    nw: TreeNode | null,
    ne: TreeNode | null,
    sw: TreeNode | null,
    se: TreeNode | null,
    id: number,
    level?: number,
    population?: number
  ) {
    this.nw = nw || null;
    this.ne = ne || null;
    this.sw = sw || null;
    this.se = se || null;
    this.id = id;

    if (level !== undefined && population !== undefined) {
      this.level = level;
      this.population = population;
    } else if (nw !== null && nw.level !== undefined) {
      this.level = nw.level + 1;
      this.population =
        (nw.population || 0) +
        (ne!.population || 0) +
        (sw!.population || 0) +
        (se!.population || 0);
    } else {
      // Leaf node
      this.level = 0;
      this.population = 0;
    }

    this.cache = null;
    this.quick_cache = null;
    this.hashmap_next = undefined;
  }
}

export class LifeUniverse {
  last_id: number;
  hashmap_size: number;
  max_load: number;
  hashmap: (TreeNode | undefined)[];
  empty_tree_cache: TreeNode[];
  level2_cache: (TreeNode | undefined)[];
  _powers: Float64Array;
  _bitcounts: Int8Array;
  rule_b: number;
  rule_s: number;
  root: TreeNode | null;
  rewind_state: TreeNode | null;
  false_leaf: TreeNode;
  true_leaf: TreeNode;

  private _step: number = 0;
  private _generation: number = 0;

  constructor() {
    this.last_id = 0;
    this.hashmap_size = 0;
    this.max_load = 0;
    this.hashmap = [];
    this.empty_tree_cache = [];
    this.level2_cache = [];
    this._powers = new Float64Array(1024);
    this._powers[0] = 1;
    for (let i = 1; i < 1024; i++) {
      this._powers[i] = this._powers[i - 1] * 2;
    }
    this._bitcounts = new Int8Array(0x758);
    this._bitcounts.set([0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]);
    for (let i = 0x10; i < 0x758; i++) {
      this._bitcounts[i] =
        this._bitcounts[i & 0xf] +
        this._bitcounts[(i >> 4) & 0xf] +
        this._bitcounts[i >> 8];
    }
    this.rule_b = 1 << 3;
    this.rule_s = (1 << 2) | (1 << 3);
    this.root = null;
    this.rewind_state = null;
    this.step = 0;
    this.generation = 0;
    this.false_leaf = new TreeNode(null, null, null, null, 3, 0, 0);
    this.true_leaf = new TreeNode(null, null, null, null, 2, 0, 1);
    this.clear_pattern();
  }

  get step(): number {
    return this._step;
  }

  set step(value: number) {
    this._step = value;
    eventBus.emit("step", value);
  }

  get generation(): number {
    return this._generation;
  }

  set generation(value: number) {
    this._generation = value;
    eventBus.emit("generation", value);
  }

  pow2(x: number): number {
    if (x >= 1024) return Infinity;
    return this._powers[x];
  }

  save_rewind_state(): void {
    this.rewind_state = this.root;
  }

  restore_rewind_state(): void {
    this.generation = 0;
    this.root = this.rewind_state;
    this.garbage_collect();
  }

  eval_mask(bitmask: number): number {
    const rule = bitmask & 32 ? this.rule_s : this.rule_b;
    return (rule >> this._bitcounts[bitmask & 0x757]) & 1;
  }

  level1_create(bitmask: number): TreeNode {
    return this.create_tree(
      bitmask & 1 ? this.true_leaf : this.false_leaf,
      bitmask & 2 ? this.true_leaf : this.false_leaf,
      bitmask & 4 ? this.true_leaf : this.false_leaf,
      bitmask & 8 ? this.true_leaf : this.false_leaf
    );
  }

  set_bit(x: number, y: number, living: boolean): void {
    const level = this.get_level_from_bounds({ x: x, y: y });
    if (this.root === null) {
      this.root = this.empty_tree(level);
    }

    if (living) {
      while (level > this.root.level) {
        this.root = this.expand_universe(this.root);
      }
    } else {
      if (level > this.root.level) {
        return;
      }
    }

    this.root = this.node_set_bit(this.root, x, y, living);
  }

  get_bit(x: number, y: number): boolean {
    const level = this.get_level_from_bounds({ x: x, y: y });
    if (this.root === null || level > this.root.level) {
      return false;
    } else {
      return this.node_get_bit(this.root, x, y);
    }
  }

  get_root_bounds(): {
    top: number;
    left: number;
    bottom: number;
    right: number;
  } {
    if (this.root === null || this.root.population === 0) {
      return {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
      };
    }

    const bounds = {
        top: Infinity,
        left: Infinity,
        bottom: -Infinity,
        right: -Infinity,
      },
      offset = this.pow2(this.root.level - 1);

    this.node_get_boundary(
      this.root,
      -offset,
      -offset,
      MASK_TOP | MASK_LEFT | MASK_BOTTOM | MASK_RIGHT,
      bounds
    );

    return bounds;
  }

  empty_tree(level: number): TreeNode {
    if (this.empty_tree_cache[level]) {
      return this.empty_tree_cache[level];
    }

    let t: TreeNode;

    if (level === 1) {
      t = this.false_leaf;
    } else {
      t = this.empty_tree(level - 1);
    }

    return (this.empty_tree_cache[level] = this.create_tree(t, t, t, t));
  }

  expand_universe(node: TreeNode): TreeNode {
    const t = this.empty_tree(node.level - 1);

    return this.create_tree(
      this.create_tree(t, t, t, node.nw!),
      this.create_tree(t, t, node.ne!, t),
      this.create_tree(t, node.sw!, t, t),
      this.create_tree(node.se!, t, t, t)
    );
  }

  uncache(also_quick: boolean): void {
    for (let i = 0; i <= this.hashmap_size; i++) {
      const node = this.hashmap[i];
      if (node !== undefined) {
        node.cache = null;
        node.hashmap_next = undefined;
        if (also_quick) node.quick_cache = null;
      }
    }
  }

  in_hashmap(n: TreeNode): boolean {
    const hash =
      this.calc_hash(n.nw!.id, n.ne!.id, n.sw!.id, n.se!.id) &
      this.hashmap_size;
    let node = this.hashmap[hash];

    while (true) {
      if (node === undefined) {
        return false;
      } else if (node === n) {
        return true;
      }
      node = node.hashmap_next;
    }
  }

  hashmap_insert(n: TreeNode): void {
    const hash =
      this.calc_hash(n.nw!.id, n.ne!.id, n.sw!.id, n.se!.id) &
      this.hashmap_size;
    let node = this.hashmap[hash];
    let prev: TreeNode | undefined;

    while (true) {
      if (node === undefined) {
        if (prev !== undefined) {
          prev.hashmap_next = n;
        } else {
          this.hashmap[hash] = n;
        }
        return;
      }
      prev = node;
      node = node.hashmap_next;
    }
  }

  create_tree(
    nw: TreeNode,
    ne: TreeNode,
    sw: TreeNode,
    se: TreeNode
  ): TreeNode {
    const hash = this.calc_hash(nw.id, ne.id, sw.id, se.id) & this.hashmap_size;
    let node = this.hashmap[hash];
    let prev: TreeNode | undefined;

    while (true) {
      if (node === undefined) {
        if (this.last_id > this.max_load) {
          this.garbage_collect();
          return this.create_tree(nw, ne, sw, se);
        }

        const new_node = new TreeNode(nw, ne, sw, se, this.last_id++);
        if (prev !== undefined) {
          prev.hashmap_next = new_node;
        } else {
          this.hashmap[hash] = new_node;
        }
        return new_node;
      } else if (
        node.nw === nw &&
        node.ne === ne &&
        node.sw === sw &&
        node.se === se
      ) {
        return node;
      }
      prev = node;
      node = node.hashmap_next;
    }
  }

  next_generation(is_single: boolean): void {
    let root = this.root!;
    while (
      (is_single && root.level <= this.step + 2) ||
      root.nw!.population !== root.nw!.se!.se!.population ||
      root.ne!.population !== root.ne!.sw!.sw!.population ||
      root.sw!.population !== root.sw!.ne!.ne!.population ||
      root.se!.population !== root.se!.nw!.nw!.population
    ) {
      root = this.expand_universe(root);
    }

    if (is_single) {
      this.generation += this.pow2(this.step);
      root = this.node_next_generation(root);
    } else {
      this.generation += this.pow2(this.root!.level - 2);
      root = this.node_quick_next_generation(root);
    }

    this.root = root;
  }

  garbage_collect(): void {
    if (this.hashmap_size < (1 << HASHMAP_LIMIT) - 1) {
      this.hashmap_size = (this.hashmap_size << 1) | 1;
      this.hashmap = [];
    }

    this.max_load = (this.hashmap_size * LOAD_FACTOR) | 0;

    for (let i = 0; i <= this.hashmap_size; i++) this.hashmap[i] = undefined;

    this.last_id = 4;
    this.node_hash(this.root!);
  }

  calc_hash(
    nw_id: number,
    ne_id: number,
    sw_id: number,
    se_id: number
  ): number {
    return (((nw_id * 23) ^ ne_id) * 23) ^ (sw_id * 23) ^ se_id;
  }

  clear_pattern(): void {
    this.last_id = 4;
    this.hashmap_size = (1 << INITIAL_SIZE) - 1;
    this.max_load = (this.hashmap_size * LOAD_FACTOR) | 0;
    this.hashmap = [];
    this.empty_tree_cache = [];
    this.level2_cache = Array(0x10000);

    for (let i = 0; i <= this.hashmap_size; i++) this.hashmap[i] = undefined;

    this.root = this.empty_tree(3);
    this.generation = 0;
  }

  get_bounds(
    field_x: Int32Array | number[],
    field_y: Int32Array | number[]
  ): { top: number; left: number; bottom: number; right: number } {
    if (!field_x.length) {
      return {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
      };
    }

    const bounds = {
      top: field_y[0],
      left: field_x[0],
      bottom: field_y[0],
      right: field_x[0],
    };
    const len = field_x.length;

    for (let i = 1; i < len; i++) {
      const x = field_x[i],
        y = field_y[i];

      if (x < bounds.left) {
        bounds.left = x;
      } else if (x > bounds.right) {
        bounds.right = x;
      }

      if (y < bounds.top) {
        bounds.top = y;
      } else if (y > bounds.bottom) {
        bounds.bottom = y;
      }
    }

    return bounds;
  }

  get_level_from_bounds(bounds: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    bottom?: number;
    right?: number;
  }): number {
    let max = 4;
    const keys = Object.keys(bounds);

    for (let i = 0; i < keys.length; i++) {
      const coordinate = (bounds as any)[keys[i]];

      if (coordinate + 1 > max) {
        max = coordinate + 1;
      } else if (-coordinate > max) {
        max = -coordinate;
      }
    }

    return Math.ceil(Math.log(max) / Math.LN2) + 1;
  }

  make_center(
    field_x: Int32Array | number[],
    field_y: Int32Array | number[],
    bounds: { left: number; right: number; top: number; bottom: number }
  ): void {
    const offset_x = Math.round((bounds.left - bounds.right) / 2) - bounds.left,
      offset_y = Math.round((bounds.top - bounds.bottom) / 2) - bounds.top;

    this.move_field(field_x, field_y, offset_x, offset_y);

    bounds.left += offset_x;
    bounds.right += offset_x;
    bounds.top += offset_y;
    bounds.bottom += offset_y;
  }

  move_field(
    field_x: Int32Array | number[],
    field_y: Int32Array | number[],
    offset_x: number,
    offset_y: number
  ): void {
    const len = field_x.length;

    for (let i = 0; i < len; i++) {
      field_x[i] += offset_x;
      field_y[i] += offset_y;
    }
  }

  setup_field(
    field_x: Int32Array | number[],
    field_y: Int32Array | number[],
    bounds?: { left: number; right: number; top: number; bottom: number }
  ): void {
    if (bounds === undefined) {
      bounds = this.get_bounds(field_x, field_y);
    }

    const level = this.get_level_from_bounds(bounds),
      offset = this.pow2(level - 1),
      count = field_x.length;

    this.move_field(field_x, field_y, offset, offset);
    this.root = this.setup_field_recurse(0, count - 1, field_x, field_y, level);
  }

  partition(
    start: number,
    end: number,
    test_field: Int32Array | number[],
    other_field: Int32Array | number[],
    offset: number
  ): number {
    let i = start,
      j = end,
      swap: number;

    while (i <= j) {
      while (i <= end && (test_field[i] & offset) === 0) {
        i++;
      }

      while (j > start && test_field[j] & offset) {
        j--;
      }

      if (i >= j) {
        break;
      }

      swap = test_field[i];
      test_field[i] = test_field[j];
      test_field[j] = swap;

      swap = other_field[i];
      other_field[i] = other_field[j];
      other_field[j] = swap;

      i++;
      j--;
    }

    return i;
  }

  setup_field_recurse(
    start: number,
    end: number,
    field_x: Int32Array | number[],
    field_y: Int32Array | number[],
    level: number
  ): TreeNode {
    if (start > end) {
      return this.empty_tree(level);
    }

    if (level === 2) {
      return this.level2_setup(start, end, field_x, field_y);
    }

    level--;

    const offset = 1 << level,
      part3 = this.partition(start, end, field_y, field_x, offset),
      part2 = this.partition(start, part3 - 1, field_x, field_y, offset),
      part4 = this.partition(part3, end, field_x, field_y, offset);

    return this.create_tree(
      this.setup_field_recurse(start, part2 - 1, field_x, field_y, level),
      this.setup_field_recurse(part2, part3 - 1, field_x, field_y, level),
      this.setup_field_recurse(part3, part4 - 1, field_x, field_y, level),
      this.setup_field_recurse(part4, end, field_x, field_y, level)
    );
  }

  level2_setup(
    start: number,
    end: number,
    field_x: Int32Array | number[],
    field_y: Int32Array | number[]
  ): TreeNode {
    let set = 0,
      x: number,
      y: number;

    for (let i = start; i <= end; i++) {
      x = field_x[i];
      y = field_y[i];
      set |= 1 << ((x & 1) | (((y & 1) | (x & 2)) << 1) | ((y & 2) << 2));
    }

    if (this.level2_cache[set]) {
      return this.level2_cache[set]!;
    }

    return (this.level2_cache[set] = this.create_tree(
      this.level1_create(set),
      this.level1_create(set >> 4),
      this.level1_create(set >> 8),
      this.level1_create(set >> 12)
    ));
  }

  set_step(step: number): void {
    if (step !== this.step) {
      this.step = step;
      this.uncache(false);
      this.empty_tree_cache = [];
      this.level2_cache = Array(0x10000);
    }
  }

  set_rules(s: number, b: number): void {
    if (this.rule_s !== s || this.rule_b !== b) {
      this.rule_s = s;
      this.rule_b = b;
      this.uncache(true);
      this.empty_tree_cache = [];
      this.level2_cache = Array(0x10000);
    }
  }

  node_set_bit(
    node: TreeNode,
    x: number,
    y: number,
    living: boolean
  ): TreeNode {
    if (node.level === 0) {
      return living ? this.true_leaf : this.false_leaf;
    }

    const offset = node.level === 1 ? 0 : this.pow2(node.level - 2);
    let nw = node.nw,
      ne = node.ne,
      sw = node.sw,
      se = node.se;

    if (x < 0) {
      if (y < 0) {
        nw = this.node_set_bit(nw!, x + offset, y + offset, living);
      } else {
        sw = this.node_set_bit(sw!, x + offset, y - offset, living);
      }
    } else {
      if (y < 0) {
        ne = this.node_set_bit(ne!, x - offset, y + offset, living);
      } else {
        se = this.node_set_bit(se!, x - offset, y - offset, living);
      }
    }

    return this.create_tree(nw!, ne!, sw!, se!);
  }

  node_get_bit(node: TreeNode, x: number, y: number): boolean {
    if (node.population === 0) {
      return false;
    }
    if (node.level === 0) {
      return true;
    }

    const offset = node.level === 1 ? 0 : this.pow2(node.level - 2);

    if (x < 0) {
      if (y < 0) {
        return this.node_get_bit(node.nw!, x + offset, y + offset);
      } else {
        return this.node_get_bit(node.sw!, x + offset, y - offset);
      }
    } else {
      if (y < 0) {
        return this.node_get_bit(node.ne!, x - offset, y + offset);
      } else {
        return this.node_get_bit(node.se!, x - offset, y - offset);
      }
    }
  }

  node_get_field(
    node: TreeNode,
    left: number,
    top: number,
    field: { x: number; y: number }[]
  ): void {
    if (node.population === 0) {
      return;
    }

    if (node.level === 0) {
      field.push({ x: left, y: top });
    } else {
      const offset = this.pow2(node.level - 1);

      this.node_get_field(node.nw!, left, top, field);
      this.node_get_field(node.sw!, left, top + offset, field);
      this.node_get_field(node.ne!, left + offset, top, field);
      this.node_get_field(node.se!, left + offset, top + offset, field);
    }
  }

  node_level2_next(node: TreeNode): TreeNode {
    const nw = node.nw!,
      ne = node.ne!,
      sw = node.sw!,
      se = node.se!;
    const bitmask =
      (nw.nw!.population << 15) |
      (nw.ne!.population << 14) |
      (ne.nw!.population << 13) |
      (ne.ne!.population << 12) |
      (nw.sw!.population << 11) |
      (nw.se!.population << 10) |
      (ne.sw!.population << 9) |
      (ne.se!.population << 8) |
      (sw.nw!.population << 7) |
      (sw.ne!.population << 6) |
      (se.nw!.population << 5) |
      (se.ne!.population << 4) |
      (sw.sw!.population << 3) |
      (sw.se!.population << 2) |
      (se.sw!.population << 1) |
      se.se!.population;

    return this.level1_create(
      this.eval_mask(bitmask >> 5) |
        (this.eval_mask(bitmask >> 4) << 1) |
        (this.eval_mask(bitmask >> 1) << 2) |
        (this.eval_mask(bitmask) << 3)
    );
  }

  node_next_generation(node: TreeNode): TreeNode {
    if (node.cache) {
      return node.cache;
    }

    if (this.step === node.level - 2) {
      return this.node_quick_next_generation(node);
    }

    if (node.level === 2) {
      if (node.quick_cache) {
        return node.quick_cache;
      } else {
        return (node.quick_cache = this.node_level2_next(node));
      }
    }

    const nw = node.nw!,
      ne = node.ne!,
      sw = node.sw!,
      se = node.se!,
      n00 = this.create_tree(nw.nw!.se!, nw.ne!.sw!, nw.sw!.ne!, nw.se!.nw!),
      n01 = this.create_tree(nw.ne!.se!, ne.nw!.sw!, nw.se!.ne!, ne.sw!.nw!),
      n02 = this.create_tree(ne.nw!.se!, ne.ne!.sw!, ne.sw!.ne!, ne.se!.nw!),
      n10 = this.create_tree(nw.sw!.se!, nw.se!.sw!, sw.nw!.ne!, sw.ne!.nw!),
      n11 = this.create_tree(nw.se!.se!, ne.sw!.sw!, sw.ne!.ne!, se.nw!.nw!),
      n12 = this.create_tree(ne.sw!.se!, ne.se!.sw!, se.nw!.ne!, se.ne!.nw!),
      n20 = this.create_tree(sw.nw!.se!, sw.ne!.sw!, sw.sw!.ne!, sw.se!.nw!),
      n21 = this.create_tree(sw.ne!.se!, se.nw!.sw!, sw.se!.ne!, se.sw!.nw!),
      n22 = this.create_tree(se.nw!.se!, se.ne!.sw!, se.sw!.ne!, se.se!.nw!);

    return (node.cache = this.create_tree(
      this.node_next_generation(this.create_tree(n00, n01, n10, n11)),
      this.node_next_generation(this.create_tree(n01, n02, n11, n12)),
      this.node_next_generation(this.create_tree(n10, n11, n20, n21)),
      this.node_next_generation(this.create_tree(n11, n12, n21, n22))
    ));
  }

  node_quick_next_generation(node: TreeNode): TreeNode {
    if (node.quick_cache !== null) {
      return node.quick_cache;
    }

    if (node.level === 2) {
      return (node.quick_cache = this.node_level2_next(node));
    }

    const nw = node.nw!,
      ne = node.ne!,
      sw = node.sw!,
      se = node.se!,
      n00 = this.node_quick_next_generation(nw),
      n01 = this.node_quick_next_generation(
        this.create_tree(nw.ne!, ne.nw!, nw.se!, ne.sw!)
      ),
      n02 = this.node_quick_next_generation(ne),
      n10 = this.node_quick_next_generation(
        this.create_tree(nw.sw!, nw.se!, sw.nw!, sw.ne!)
      ),
      n11 = this.node_quick_next_generation(
        this.create_tree(nw.se!, ne.sw!, sw.ne!, se.nw!)
      ),
      n12 = this.node_quick_next_generation(
        this.create_tree(ne.sw!, ne.se!, se.nw!, se.ne!)
      ),
      n20 = this.node_quick_next_generation(sw),
      n21 = this.node_quick_next_generation(
        this.create_tree(sw.ne!, se.nw!, sw.se!, se.sw!)
      ),
      n22 = this.node_quick_next_generation(se);

    return (node.quick_cache = this.create_tree(
      this.node_quick_next_generation(this.create_tree(n00, n01, n10, n11)),
      this.node_quick_next_generation(this.create_tree(n01, n02, n11, n12)),
      this.node_quick_next_generation(this.create_tree(n10, n11, n20, n21)),
      this.node_quick_next_generation(this.create_tree(n11, n12, n21, n22))
    ));
  }

  node_hash(node: TreeNode): void {
    if (!this.in_hashmap(node)) {
      node.id = this.last_id++;
      node.hashmap_next = undefined;

      if (node.level > 1) {
        this.node_hash(node.nw!);
        this.node_hash(node.ne!);
        this.node_hash(node.sw!);
        this.node_hash(node.se!);

        if (node.cache) {
          this.node_hash(node.cache);
        }
        if (node.quick_cache) {
          this.node_hash(node.quick_cache);
        }
      }

      this.hashmap_insert(node);
    }
  }

  node_get_boundary(
    node: TreeNode,
    left: number,
    top: number,
    find_mask: number,
    boundary: { top: number; left: number; bottom: number; right: number }
  ): void {
    if (node.population === 0 || !find_mask) {
      return;
    }

    if (node.level === 0) {
      if (left < boundary.left) boundary.left = left;
      if (left > boundary.right) boundary.right = left;
      if (top < boundary.top) boundary.top = top;
      if (top > boundary.bottom) boundary.bottom = top;
    } else {
      const offset = this.pow2(node.level - 1);
      if (
        left >= boundary.left &&
        left + offset * 2 <= boundary.right &&
        top >= boundary.top &&
        top + offset * 2 <= boundary.bottom
      ) {
        return;
      }

      let find_nw = find_mask,
        find_sw = find_mask,
        find_ne = find_mask,
        find_se = find_mask;

      if (node.nw!.population) {
        find_sw &= ~MASK_TOP;
        find_ne &= ~MASK_LEFT;
        find_se &= ~MASK_TOP & ~MASK_LEFT;
      }
      if (node.sw!.population) {
        find_se &= ~MASK_LEFT;
        find_nw &= ~MASK_BOTTOM;
        find_ne &= ~MASK_BOTTOM & ~MASK_LEFT;
      }
      if (node.ne!.population) {
        find_nw &= ~MASK_RIGHT;
        find_se &= ~MASK_TOP;
        find_sw &= ~MASK_TOP & ~MASK_RIGHT;
      }
      if (node.se!.population) {
        find_sw &= ~MASK_RIGHT;
        find_ne &= ~MASK_BOTTOM;
        find_nw &= ~MASK_BOTTOM & ~MASK_RIGHT;
      }

      this.node_get_boundary(node.nw!, left, top, find_nw, boundary);
      this.node_get_boundary(node.sw!, left, top + offset, find_sw, boundary);
      this.node_get_boundary(node.ne!, left + offset, top, find_ne, boundary);
      this.node_get_boundary(
        node.se!,
        left + offset,
        top + offset,
        find_se,
        boundary
      );
    }
  }
}
