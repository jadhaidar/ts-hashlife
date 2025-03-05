import { LifeUniverse, TreeNode } from "./LifeUniverse";
import { LifeCanvasDrawer } from "./draw";
import { formats, Pattern, Result } from "./formats";
import { load_macrocell } from "./macrocell";

import * as mathUtils from "./utils/math";
import * as stringUtils from "./utils/string";
import * as funcUtils from "./utils/func";

const utils = {
  string: stringUtils,
  func: funcUtils,
  math: mathUtils,
};

const HashLife = {
  LifeUniverse,
  TreeNode,
  LifeCanvasDrawer,
  formats,
  load_macrocell,
  utils,
};

export {
  // Core components
  LifeUniverse,
  TreeNode,
  LifeCanvasDrawer,
  formats,
  load_macrocell,

  // Types
  type Pattern,
  type Result,

  // Utilities
  utils,
};

export default HashLife;
