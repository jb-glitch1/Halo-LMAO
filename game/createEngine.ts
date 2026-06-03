import { Engine } from "./engine";
import "./bots"; // side-effect: registers the bot brain with the engine
import type { MatchConfig } from "./types";

export function createEngine(config: MatchConfig): Engine {
  return new Engine(config);
}

export { Engine };
