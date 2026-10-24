/**
 * `baton explain` and `baton init` once had their own root rule; every command
 * now shares `resolveProjectRoot` (it never settles on the home folder). The old
 * name stays so they keep importing from here.
 */
export { resolveProjectRoot as resolveExplainRoot } from "../paths.js";
