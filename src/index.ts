import { LifeUniverse, TreeNode } from "./life-universe";
import { LifeCanvasDrawer } from "./draw";
import { formats, Result, Pattern } from "./formats";
import { load_macrocell } from "./macrocell";
import EventBus, { EventMap } from "./event-bus";
import Game from "./hash-life";

const HashLife = {
  EventBus,
  Game,
  LifeUniverse,
  TreeNode,
  LifeCanvasDrawer,
  formats,
  load_macrocell,
};

export {
  // Core components
  EventBus,
  Game as HashLife,

  // Types
  type Result,
  type Pattern,
  type EventMap,
};

export default HashLife;
