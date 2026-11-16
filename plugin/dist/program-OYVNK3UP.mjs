#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  collectStats,
  renderStats
} from "./chunk-IUOIEUCI.mjs";
import {
  isLoadBearing,
  normalizeQueryPath,
  preflight,
  preflightMoreInformation,
  renderPreflight
} from "./chunk-RFZJQVPG.mjs";
import {
  checkCommands,
  verifyTask
} from "./chunk-RXMNA6I5.mjs";
import {
  runHook
} from "./chunk-5ORYQIKS.mjs";
import {
  package_default
} from "./chunk-DGC5IJ2Y.mjs";
import {
  HOOK_EVENTS
} from "./chunk-Z3Y3YQIP.mjs";
import {
  buildMission,
  parseBudget,
  writePacketCache
} from "./chunk-FVM2XUEA.mjs";
import {
  appendDriftLog,
  bodyHash,
  classifyFreshness,
  driftJson,
  evaluateFreshness,
  failingSections,
  flagEvents,
  renderDriftText
} from "./chunk-TUW6WTQN.mjs";
import {
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import {
  loadSectionIndex,
  parseFrontmatter,
  parseSections
} from "./chunk-3GYDKCE7.mjs";
import {
  fencedLines,
  findFences
} from "./chunk-7ITVWEWP.mjs";
import {
  adrFileName,
  adrNumberFrom,
  localDate,
  nextAdrNumber,
  numberTaken,
  pad4,
  parseAdrRef,
  placeholdersIn,
  renderAdr,
  setFrontmatterField,
  statusKind,
  statusOf,
  supersededStatus
} from "./chunk-5VA3OZXQ.mjs";
import {
  defaultConfig,
  loadConfig
} from "./chunk-BW2ZAPTV.mjs";
import "./chunk-SF6UCQ5U.mjs";
import "./chunk-QNOEYN3Z.mjs";
import {
  require_dist
} from "./chunk-HAV7IRWM.mjs";
import {
  STATE_PATH,
  runHandoff
} from "./chunk-P4A7COR5.mjs";
import "./chunk-JONWDC7U.mjs";
import "./chunk-6V7F4CRM.mjs";
import {
  git,
  headSha,
  isGitRepo,
  porcelainPath,
  statusLines
} from "./chunk-MEHZNG47.mjs";
import {
  BatonError,
  ExitCode,
  notImplemented
} from "./chunk-YXJRO53B.mjs";
import {
  openTaskService,
  resolveActor
} from "./chunk-M47P2UXW.mjs";
import {
  DEP_TYPES,
  ISSUE_TYPES,
  TaskError,
  isDepType,
  isIssueType,
  isStatus,
  parsePriority,
  readTextOrEmpty,
  writeFileAtomic
} from "./chunk-QYQVMIUC.mjs";
import {
  CONTEXT_DIR,
  ContextPaths,
  contextPath,
  resolveProjectRoot,
  samePath,
  toRepoPath
} from "./chunk-HVIRJWHJ.mjs";
import {
  __toESM
} from "./chunk-UC4Y6CAD.mjs";

// node_modules/commander/lib/error.js
var CommanderError = class extends Error {
  /**
   * Constructs the CommanderError class
   * @param {number} exitCode suggested exit code which could be used with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   */
  constructor(exitCode, code, message) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = void 0;
  }
};
var InvalidArgumentError = class extends CommanderError {
  /**
   * Constructs the InvalidArgumentError class
   * @param {string} [message] explanation of why argument is invalid
   */
  constructor(message) {
    super(1, "commander.invalidArgument", message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
};

// node_modules/commander/lib/argument.js
var Argument = class {
  /**
   * Initialize a new command argument with the given name and description.
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @param {string} name
   * @param {string} [description]
   */
  constructor(name, description) {
    this.description = description || "";
    this.variadic = false;
    this.parseArg = void 0;
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.argChoices = void 0;
    switch (name[0]) {
      case "<":
        this.required = true;
        this._name = name.slice(1, -1);
        break;
      case "[":
        this.required = false;
        this._name = name.slice(1, -1);
        break;
      default:
        this.required = true;
        this._name = name;
        break;
    }
    if (this._name.endsWith("...")) {
      this.variadic = true;
      this._name = this._name.slice(0, -3);
    }
  }
  /**
   * Return argument name.
   *
   * @return {string}
   */
  name() {
    return this._name;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Argument}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Set the custom handler for processing CLI command arguments into argument values.
   *
   * @param {Function} [fn]
   * @return {Argument}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Only allow argument value to be one of choices.
   *
   * @param {string[]} values
   * @return {Argument}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Make argument required.
   *
   * @returns {Argument}
   */
  argRequired() {
    this.required = true;
    return this;
  }
  /**
   * Make argument optional.
   *
   * @returns {Argument}
   */
  argOptional() {
    this.required = false;
    return this;
  }
};
function humanReadableArgName(arg) {
  const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
  return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
}

// node_modules/commander/lib/command.js
import { EventEmitter } from "events";
import childProcess from "child_process";
import path from "path";
import fs from "fs";
import process2 from "process";
import { stripVTControlCharacters as stripVTControlCharacters2 } from "util";

// node_modules/commander/lib/help.js
import { stripVTControlCharacters } from "util";
var Help = class {
  constructor() {
    this.helpWidth = void 0;
    this.minWidthToWrap = 40;
    this.sortSubcommands = false;
    this.sortOptions = false;
    this.showGlobalOptions = false;
  }
  /**
   * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
   * and just before calling `formatHelp()`.
   *
   * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
   *
   * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
   */
  prepareContext(contextOptions) {
    this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
  }
  /**
   * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
   *
   * @param {Command} cmd
   * @returns {Command[]}
   */
  visibleCommands(cmd) {
    const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
    const helpCommand = cmd._getHelpCommand();
    if (helpCommand && !helpCommand._hidden) {
      visibleCommands.push(helpCommand);
    }
    if (this.sortSubcommands) {
      visibleCommands.sort((a, b) => {
        return a.name().localeCompare(b.name());
      });
    }
    return visibleCommands;
  }
  /**
   * Compare options for sort.
   *
   * @param {Option} a
   * @param {Option} b
   * @returns {number}
   */
  compareOptions(a, b) {
    const getSortKey = (option) => {
      return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
    };
    return getSortKey(a).localeCompare(getSortKey(b));
  }
  /**
   * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleOptions(cmd) {
    const visibleOptions = cmd.options.filter((option) => !option.hidden);
    const helpOption = cmd._getHelpOption();
    if (helpOption && !helpOption.hidden) {
      const removeShort = helpOption.short && cmd._findOption(helpOption.short);
      const removeLong = helpOption.long && cmd._findOption(helpOption.long);
      if (!removeShort && !removeLong) {
        visibleOptions.push(helpOption);
      } else if (helpOption.long && !removeLong) {
        visibleOptions.push(
          cmd.createOption(helpOption.long, helpOption.description)
        );
      } else if (helpOption.short && !removeShort) {
        visibleOptions.push(
          cmd.createOption(helpOption.short, helpOption.description)
        );
      }
    }
    if (this.sortOptions) {
      visibleOptions.sort(this.compareOptions);
    }
    return visibleOptions;
  }
  /**
   * Get an array of the visible global options. (Not including help.)
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleGlobalOptions(cmd) {
    if (!this.showGlobalOptions) return [];
    const globalOptions = [];
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      const visibleOptions = ancestorCmd.options.filter(
        (option) => !option.hidden
      );
      globalOptions.push(...visibleOptions);
    }
    if (this.sortOptions) {
      globalOptions.sort(this.compareOptions);
    }
    return globalOptions;
  }
  /**
   * Get an array of the arguments if any have a description.
   *
   * @param {Command} cmd
   * @returns {Argument[]}
   */
  visibleArguments(cmd) {
    if (cmd._argsDescription) {
      cmd.registeredArguments.forEach((argument) => {
        argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
      });
    }
    if (cmd.registeredArguments.find((argument) => argument.description)) {
      return cmd.registeredArguments;
    }
    return [];
  }
  /**
   * Get the command term to show in the list of subcommands.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandTerm(cmd) {
    const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
    return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
    (args ? " " + args : "");
  }
  /**
   * Get the option term to show in the list of options.
   *
   * @param {Option} option
   * @returns {string}
   */
  optionTerm(option) {
    return option.flags;
  }
  /**
   * Get the argument term to show in the list of arguments.
   *
   * @param {Argument} argument
   * @returns {string}
   */
  argumentTerm(argument) {
    return argument.name();
  }
  /**
   * Get the longest command term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestSubcommandTermLength(cmd, helper) {
    return helper.visibleCommands(cmd).reduce((max, command) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleSubcommandTerm(helper.subcommandTerm(command))
        )
      );
    }, 0);
  }
  /**
   * Get the longest option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestOptionTermLength(cmd, helper) {
    return helper.visibleOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest global option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestGlobalOptionTermLength(cmd, helper) {
    return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest argument term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestArgumentTermLength(cmd, helper) {
    return helper.visibleArguments(cmd).reduce((max, argument) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleArgumentTerm(helper.argumentTerm(argument))
        )
      );
    }, 0);
  }
  /**
   * Get the command usage to be displayed at the top of the built-in help.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandUsage(cmd) {
    let cmdName = cmd._name;
    if (cmd._aliases[0]) {
      cmdName = cmdName + "|" + cmd._aliases[0];
    }
    let ancestorCmdNames = "";
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
    }
    return ancestorCmdNames + cmdName + " " + cmd.usage();
  }
  /**
   * Get the description for the command.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandDescription(cmd) {
    return cmd.description();
  }
  /**
   * Get the subcommand summary to show in the list of subcommands.
   * (Fallback to description for backwards compatibility.)
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandDescription(cmd) {
    return cmd.summary() || cmd.description();
  }
  /**
   * Get the option description to show in the list of options.
   *
   * @param {Option} option
   * @return {string}
   */
  optionDescription(option) {
    const extraInfo = [];
    if (option.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (option.defaultValue !== void 0) {
      const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
      if (showDefault) {
        extraInfo.push(
          `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
        );
      }
    }
    if (option.presetArg !== void 0 && option.optional) {
      extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
    }
    if (option.envVar !== void 0) {
      extraInfo.push(`env: ${option.envVar}`);
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (option.description) {
        return `${option.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return option.description;
  }
  /**
   * Get the argument description to show in the list of arguments.
   *
   * @param {Argument} argument
   * @return {string}
   */
  argumentDescription(argument) {
    const extraInfo = [];
    if (argument.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (argument.defaultValue !== void 0) {
      extraInfo.push(
        `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
      );
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (argument.description) {
        return `${argument.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return argument.description;
  }
  /**
   * Format a list of items, given a heading and an array of formatted items.
   *
   * @param {string} heading
   * @param {string[]} items
   * @param {Help} helper
   * @returns string[]
   */
  formatItemList(heading, items, helper) {
    if (items.length === 0) return [];
    return [helper.styleTitle(heading), ...items, ""];
  }
  /**
   * Group items by their help group heading.
   *
   * @param {Command[] | Option[]} unsortedItems
   * @param {Command[] | Option[]} visibleItems
   * @param {Function} getGroup
   * @returns {Map<string, Command[] | Option[]>}
   */
  groupItems(unsortedItems, visibleItems, getGroup) {
    const result = /* @__PURE__ */ new Map();
    unsortedItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) result.set(group, []);
    });
    visibleItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) {
        result.set(group, []);
      }
      result.get(group).push(item);
    });
    return result;
  }
  /**
   * Generate the built-in help text.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {string}
   */
  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;
    function callFormatItem(term, description) {
      return helper.formatItem(term, termWidth, description, helper);
    }
    let output = [
      `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      ""
    ];
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(
          helper.styleCommandDescription(commandDescription),
          helpWidth
        ),
        ""
      ]);
    }
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return callFormatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        helper.styleArgumentDescription(helper.argumentDescription(argument))
      );
    });
    output = output.concat(
      this.formatItemList("Arguments:", argumentList, helper)
    );
    const optionGroups = this.groupItems(
      cmd.options,
      helper.visibleOptions(cmd),
      (option) => option.helpGroupHeading ?? "Options:"
    );
    optionGroups.forEach((options, group) => {
      const optionList = options.map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(this.formatItemList(group, optionList, helper));
    });
    if (helper.showGlobalOptions) {
      const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(
        this.formatItemList("Global Options:", globalOptionList, helper)
      );
    }
    const commandGroups = this.groupItems(
      cmd.commands,
      helper.visibleCommands(cmd),
      (sub) => sub.helpGroup() || "Commands:"
    );
    commandGroups.forEach((commands, group) => {
      const commandList = commands.map((sub) => {
        return callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub))
        );
      });
      output = output.concat(this.formatItemList(group, commandList, helper));
    });
    return output.join("\n");
  }
  /**
   * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
   *
   * @param {string} str
   * @returns {number}
   */
  displayWidth(str) {
    return stripVTControlCharacters(str).length;
  }
  /**
   * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
   *
   * @param {string} str
   * @returns {string}
   */
  styleTitle(str) {
    return str;
  }
  styleUsage(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word === "[command]") return this.styleSubcommandText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleCommandText(word);
    }).join(" ");
  }
  styleCommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleOptionDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleSubcommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleArgumentDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleDescriptionText(str) {
    return str;
  }
  styleOptionTerm(str) {
    return this.styleOptionText(str);
  }
  styleSubcommandTerm(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleSubcommandText(word);
    }).join(" ");
  }
  styleArgumentTerm(str) {
    return this.styleArgumentText(str);
  }
  styleOptionText(str) {
    return str;
  }
  styleArgumentText(str) {
    return str;
  }
  styleSubcommandText(str) {
    return str;
  }
  styleCommandText(str) {
    return str;
  }
  /**
   * Calculate the pad width from the maximum term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  padWidth(cmd, helper) {
    return Math.max(
      helper.longestOptionTermLength(cmd, helper),
      helper.longestGlobalOptionTermLength(cmd, helper),
      helper.longestSubcommandTermLength(cmd, helper),
      helper.longestArgumentTermLength(cmd, helper)
    );
  }
  /**
   * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
   *
   * @param {string} str
   * @returns {boolean}
   */
  preformatted(str) {
    return /\n[^\S\r\n]/.test(str);
  }
  /**
   * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
   *
   * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
   *   TTT  DDD DDDD
   *        DD DDD
   *
   * @param {string} term
   * @param {number} termWidth
   * @param {string} description
   * @param {Help} helper
   * @returns {string}
   */
  formatItem(term, termWidth, description, helper) {
    const itemIndent = 2;
    const itemIndentStr = " ".repeat(itemIndent);
    if (!description) return itemIndentStr + term;
    const paddedTerm = term.padEnd(
      termWidth + term.length - helper.displayWidth(term)
    );
    const spacerWidth = 2;
    const helpWidth = this.helpWidth ?? 80;
    const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
    let formattedDescription;
    if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
      formattedDescription = description;
    } else {
      const wrappedDescription = helper.boxWrap(description, remainingWidth);
      formattedDescription = wrappedDescription.replace(
        /\n/g,
        "\n" + " ".repeat(termWidth + spacerWidth)
      );
    }
    return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
  }
  /**
   * Wrap a string at whitespace, preserving existing line breaks.
   * Wrapping is skipped if the width is less than `minWidthToWrap`.
   *
   * @param {string} str
   * @param {number} width
   * @returns {string}
   */
  boxWrap(str, width) {
    if (width < this.minWidthToWrap) return str;
    const rawLines = str.split(/\r\n|\n/);
    const chunkPattern = /[\s]*[^\s]+/g;
    const wrappedLines = [];
    rawLines.forEach((line) => {
      const chunks = line.match(chunkPattern);
      if (chunks === null) {
        wrappedLines.push("");
        return;
      }
      let sumChunks = [chunks.shift()];
      let sumWidth = this.displayWidth(sumChunks[0]);
      chunks.forEach((chunk) => {
        const visibleWidth = this.displayWidth(chunk);
        if (sumWidth + visibleWidth <= width) {
          sumChunks.push(chunk);
          sumWidth += visibleWidth;
          return;
        }
        wrappedLines.push(sumChunks.join(""));
        const nextChunk = chunk.trimStart();
        sumChunks = [nextChunk];
        sumWidth = this.displayWidth(nextChunk);
      });
      wrappedLines.push(sumChunks.join(""));
    });
    return wrappedLines.join("\n");
  }
};

// node_modules/commander/lib/option.js
var Option = class {
  /**
   * Initialize a new `Option` with the given `flags` and `description`.
   *
   * @param {string} flags
   * @param {string} [description]
   */
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || "";
    this.required = flags.includes("<");
    this.optional = flags.includes("[");
    this.variadic = /\w\.\.\.[>\]]$/.test(flags);
    this.mandatory = false;
    const optionFlags = splitOptionFlags(flags);
    this.short = optionFlags.shortFlag;
    this.long = optionFlags.longFlag;
    this.negate = false;
    if (this.long) {
      this.negate = this.long.startsWith("--no-");
    }
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.presetArg = void 0;
    this.envVar = void 0;
    this.parseArg = void 0;
    this.hidden = false;
    this.argChoices = void 0;
    this.conflictsWith = [];
    this.implied = void 0;
    this.helpGroupHeading = void 0;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Option}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Preset to use when option used without option-argument, especially optional but also boolean and negated.
   * The custom processing (parseArg) is called.
   *
   * @example
   * new Option('--color').default('GREYSCALE').preset('RGB');
   * new Option('--donate [amount]').preset('20').argParser(parseFloat);
   *
   * @param {*} arg
   * @return {Option}
   */
  preset(arg) {
    this.presetArg = arg;
    return this;
  }
  /**
   * Add option name(s) that conflict with this option.
   * An error will be displayed if conflicting options are found during parsing.
   *
   * @example
   * new Option('--rgb').conflicts('cmyk');
   * new Option('--js').conflicts(['ts', 'jsx']);
   *
   * @param {(string | string[])} names
   * @return {Option}
   */
  conflicts(names) {
    this.conflictsWith = this.conflictsWith.concat(names);
    return this;
  }
  /**
   * Specify implied option values for when this option is set and the implied options are not.
   *
   * The custom processing (parseArg) is not called on the implied values.
   *
   * @example
   * program
   *   .addOption(new Option('--log', 'write logging information to file'))
   *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
   *
   * @param {object} impliedOptionValues
   * @return {Option}
   */
  implies(impliedOptionValues) {
    let newImplied = impliedOptionValues;
    if (typeof impliedOptionValues === "string") {
      newImplied = { [impliedOptionValues]: true };
    }
    this.implied = Object.assign(this.implied || {}, newImplied);
    return this;
  }
  /**
   * Set environment variable to check for option value.
   *
   * An environment variable is only used if when processed the current option value is
   * undefined, or the source of the current value is 'default' or 'config' or 'env'.
   *
   * @param {string} name
   * @return {Option}
   */
  env(name) {
    this.envVar = name;
    return this;
  }
  /**
   * Set the custom handler for processing CLI option arguments into option values.
   *
   * @param {Function} [fn]
   * @return {Option}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Whether the option is mandatory and must have a value after parsing.
   *
   * @param {boolean} [mandatory=true]
   * @return {Option}
   */
  makeOptionMandatory(mandatory = true) {
    this.mandatory = !!mandatory;
    return this;
  }
  /**
   * Hide option in help.
   *
   * @param {boolean} [hide=true]
   * @return {Option}
   */
  hideHelp(hide = true) {
    this.hidden = !!hide;
    return this;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Only allow option value to be one of choices.
   *
   * @param {string[]} values
   * @return {Option}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Return option name.
   *
   * @return {string}
   */
  name() {
    if (this.long) {
      return this.long.replace(/^--/, "");
    }
    return this.short.replace(/^-/, "");
  }
  /**
   * Return option name, in a camelcase format that can be used
   * as an object attribute key.
   *
   * @return {string}
   */
  attributeName() {
    if (this.negate) {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    return camelcase(this.name());
  }
  /**
   * Set the help group heading.
   *
   * @param {string} heading
   * @return {Option}
   */
  helpGroup(heading) {
    this.helpGroupHeading = heading;
    return this;
  }
  /**
   * Check if `arg` matches the short or long flag.
   *
   * @param {string} arg
   * @return {boolean}
   * @package
   */
  is(arg) {
    return this.short === arg || this.long === arg;
  }
  /**
   * Return whether a boolean option.
   *
   * Options are one of boolean, negated, required argument, or optional argument.
   *
   * @return {boolean}
   * @package
   */
  isBoolean() {
    return !this.required && !this.optional && !this.negate;
  }
};
var DualOptions = class {
  /**
   * @param {Option[]} options
   */
  constructor(options) {
    this.positiveOptions = /* @__PURE__ */ new Map();
    this.negativeOptions = /* @__PURE__ */ new Map();
    this.dualOptions = /* @__PURE__ */ new Set();
    options.forEach((option) => {
      if (option.negate) {
        this.negativeOptions.set(option.attributeName(), option);
      } else {
        this.positiveOptions.set(option.attributeName(), option);
      }
    });
    this.negativeOptions.forEach((value, key) => {
      if (this.positiveOptions.has(key)) {
        this.dualOptions.add(key);
      }
    });
  }
  /**
   * Did the value come from the option, and not from possible matching dual option?
   *
   * @param {*} value
   * @param {Option} option
   * @returns {boolean}
   */
  valueFromOption(value, option) {
    const optionKey = option.attributeName();
    if (!this.dualOptions.has(optionKey)) return true;
    const preset = this.negativeOptions.get(optionKey).presetArg;
    const negativeValue = preset !== void 0 ? preset : false;
    return option.negate === (negativeValue === value);
  }
};
function camelcase(str) {
  return str.split("-").reduce((str2, word) => {
    return str2 + word[0].toUpperCase() + word.slice(1);
  });
}
function splitOptionFlags(flags) {
  let shortFlag;
  let longFlag;
  const shortFlagExp = /^-[^-]$/;
  const longFlagExp = /^--[^-]/;
  const flagParts = flags.split(/[ |,]+/).concat("guard");
  if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
  if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
  if (!shortFlag && shortFlagExp.test(flagParts[0]))
    shortFlag = flagParts.shift();
  if (!shortFlag && longFlagExp.test(flagParts[0])) {
    shortFlag = longFlag;
    longFlag = flagParts.shift();
  }
  if (flagParts[0].startsWith("-")) {
    const unsupportedFlag = flagParts[0];
    const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
    if (/^-[^-][^-]/.test(unsupportedFlag))
      throw new Error(
        `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
      );
    if (shortFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many short flags`);
    if (longFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many long flags`);
    throw new Error(`${baseError}
- unrecognised flag format`);
  }
  if (shortFlag === void 0 && longFlag === void 0)
    throw new Error(
      `option creation failed due to no flags found in '${flags}'.`
    );
  return { shortFlag, longFlag };
}

// node_modules/commander/lib/suggestSimilar.js
var maxDistance = 3;
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > maxDistance)
    return Math.max(a.length, b.length);
  const d = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      let cost;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
      } else {
        cost = 1;
      }
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        // deletion
        d[i][j - 1] + 1,
        // insertion
        d[i - 1][j - 1] + cost
        // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
function suggestSimilar(word, candidates) {
  if (!candidates || candidates.length === 0) return "";
  candidates = Array.from(new Set(candidates));
  const searchingOptions = word.startsWith("--");
  if (searchingOptions) {
    word = word.slice(2);
    candidates = candidates.map((candidate) => candidate.slice(2));
  }
  let similar = [];
  let bestDistance = maxDistance;
  const minSimilarity = 0.4;
  candidates.forEach((candidate) => {
    if (candidate.length <= 1) return;
    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    const similarity = (length - distance) / length;
    if (similarity > minSimilarity) {
      if (distance < bestDistance) {
        bestDistance = distance;
        similar = [candidate];
      } else if (distance === bestDistance) {
        similar.push(candidate);
      }
    }
  });
  similar.sort((a, b) => a.localeCompare(b));
  if (searchingOptions) {
    similar = similar.map((candidate) => `--${candidate}`);
  }
  if (similar.length > 1) {
    return `
(Did you mean one of ${similar.join(", ")}?)`;
  }
  if (similar.length === 1) {
    return `
(Did you mean ${similar[0]}?)`;
  }
  return "";
}

// node_modules/commander/lib/command.js
var Command = class _Command extends EventEmitter {
  /**
   * Initialize a new `Command`.
   *
   * @param {string} [name]
   */
  constructor(name) {
    super();
    this.commands = [];
    this.options = [];
    this.parent = null;
    this._allowUnknownOption = false;
    this._allowExcessArguments = false;
    this.registeredArguments = [];
    this._args = this.registeredArguments;
    this.args = [];
    this.rawArgs = [];
    this.processedArgs = [];
    this._scriptPath = null;
    this._name = name || "";
    this._optionValues = {};
    this._optionValueSources = {};
    this._storeOptionsAsProperties = false;
    this._actionHandler = null;
    this._executableHandler = false;
    this._executableFile = null;
    this._executableDir = null;
    this._defaultCommandName = null;
    this._exitCallback = null;
    this._aliases = [];
    this._combineFlagAndOptionalValue = true;
    this._description = "";
    this._summary = "";
    this._argsDescription = void 0;
    this._enablePositionalOptions = false;
    this._passThroughOptions = false;
    this._lifeCycleHooks = {};
    this._showHelpAfterError = false;
    this._showSuggestionAfterError = true;
    this._savedState = null;
    this._outputConfiguration = {
      writeOut: (str) => process2.stdout.write(str),
      writeErr: (str) => process2.stderr.write(str),
      outputError: (str, write) => write(str),
      getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
      getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
      getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
      getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
      stripColor: (str) => stripVTControlCharacters2(str)
    };
    this._hidden = false;
    this._helpOption = void 0;
    this._addImplicitHelpCommand = void 0;
    this._helpCommand = void 0;
    this._helpConfiguration = {};
    this._helpGroupHeading = void 0;
    this._defaultCommandGroup = void 0;
    this._defaultOptionGroup = void 0;
  }
  /**
   * Copy settings that are useful to have in common across root command and subcommands.
   *
   * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
   *
   * @param {Command} sourceCommand
   * @return {Command} `this` command for chaining
   */
  copyInheritedSettings(sourceCommand) {
    this._outputConfiguration = sourceCommand._outputConfiguration;
    this._helpOption = sourceCommand._helpOption;
    this._helpCommand = sourceCommand._helpCommand;
    this._helpConfiguration = sourceCommand._helpConfiguration;
    this._exitCallback = sourceCommand._exitCallback;
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
    this._allowExcessArguments = sourceCommand._allowExcessArguments;
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
    this._showHelpAfterError = sourceCommand._showHelpAfterError;
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
    return this;
  }
  /**
   * @returns {Command[]}
   * @private
   */
  _getCommandAndAncestors() {
    const result = [];
    for (let command = this; command; command = command.parent) {
      result.push(command);
    }
    return result;
  }
  /**
   * Define a command.
   *
   * There are two styles of command: pay attention to where to put the description.
   *
   * @example
   * // Command implemented using action handler (description is supplied separately to `.command`)
   * program
   *   .command('clone <source> [destination]')
   *   .description('clone a repository into a newly created directory')
   *   .action((source, destination) => {
   *     console.log('clone command called');
   *   });
   *
   * // Command implemented using separate executable file (description is second parameter to `.command`)
   * program
   *   .command('start <service>', 'start named service')
   *   .command('stop [service]', 'stop named service, or all if no name supplied');
   *
   * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
   * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
   * @param {object} [execOpts] - configuration options (for executable)
   * @return {Command} returns new command for action handler, or `this` for executable command
   */
  command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
    let desc = actionOptsOrExecDesc;
    let opts = execOpts;
    if (typeof desc === "object" && desc !== null) {
      opts = desc;
      desc = null;
    }
    opts = opts || {};
    const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const cmd = this.createCommand(name);
    if (desc) {
      cmd.description(desc);
      cmd._executableHandler = true;
    }
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    cmd._hidden = !!(opts.noHelp || opts.hidden);
    cmd._executableFile = opts.executableFile || null;
    if (args) cmd.arguments(args);
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd.copyInheritedSettings(this);
    if (desc) return this;
    return cmd;
  }
  /**
   * Factory routine to create a new unattached command.
   *
   * See .command() for creating an attached subcommand, which uses this routine to
   * create the command. You can override createCommand to customise subcommands.
   *
   * @param {string} [name]
   * @return {Command} new command
   */
  createCommand(name) {
    return new _Command(name);
  }
  /**
   * You can customise the help with a subclass of Help by overriding createHelp,
   * or by overriding Help properties using configureHelp().
   *
   * @return {Help}
   */
  createHelp() {
    return Object.assign(new Help(), this.configureHelp());
  }
  /**
   * You can customise the help by overriding Help properties using configureHelp(),
   * or with a subclass of Help by overriding createHelp().
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureHelp(configuration) {
    if (configuration === void 0) return this._helpConfiguration;
    this._helpConfiguration = configuration;
    return this;
  }
  /**
   * The default output goes to stdout and stderr. You can customise this for special
   * applications. You can also customise the display of errors by overriding outputError.
   *
   * The configuration properties are all functions:
   *
   *     // change how output being written, defaults to stdout and stderr
   *     writeOut(str)
   *     writeErr(str)
   *     // change how output being written for errors, defaults to writeErr
   *     outputError(str, write) // used for displaying errors and not used for displaying help
   *     // specify width for wrapping help
   *     getOutHelpWidth()
   *     getErrHelpWidth()
   *     // color support, currently only used with Help
   *     getOutHasColors()
   *     getErrHasColors()
   *     stripColor() // used to remove ANSI escape codes if output does not have colors
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureOutput(configuration) {
    if (configuration === void 0) return this._outputConfiguration;
    this._outputConfiguration = {
      ...this._outputConfiguration,
      ...configuration
    };
    return this;
  }
  /**
   * Display the help or a custom message after an error occurs.
   *
   * @param {(boolean|string)} [displayHelp]
   * @return {Command} `this` command for chaining
   */
  showHelpAfterError(displayHelp = true) {
    if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
    this._showHelpAfterError = displayHelp;
    return this;
  }
  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   *
   * @param {boolean} [displaySuggestion]
   * @return {Command} `this` command for chaining
   */
  showSuggestionAfterError(displaySuggestion = true) {
    this._showSuggestionAfterError = !!displaySuggestion;
    return this;
  }
  /**
   * Add a prepared subcommand.
   *
   * See .command() for creating an attached subcommand which inherits settings from its parent.
   *
   * @param {Command} cmd - new subcommand
   * @param {object} [opts] - configuration options
   * @return {Command} `this` command for chaining
   */
  addCommand(cmd, opts) {
    if (!cmd._name) {
      throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
    }
    opts = opts || {};
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    if (opts.noHelp || opts.hidden) cmd._hidden = true;
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd._checkForBrokenPassThrough();
    return this;
  }
  /**
   * Factory routine to create a new unattached argument.
   *
   * See .argument() for creating an attached argument, which uses this routine to
   * create the argument. You can override createArgument to return a custom argument.
   *
   * @param {string} name
   * @param {string} [description]
   * @return {Argument} new argument
   */
  createArgument(name, description) {
    return new Argument(name, description);
  }
  /**
   * Define argument syntax for command.
   *
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @example
   * program.argument('<input-file>');
   * program.argument('[output-file]');
   *
   * @param {string} name
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom argument processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  argument(name, description, parseArg, defaultValue) {
    const argument = this.createArgument(name, description);
    if (typeof parseArg === "function") {
      argument.default(defaultValue).argParser(parseArg);
    } else {
      argument.default(parseArg);
    }
    this.addArgument(argument);
    return this;
  }
  /**
   * Define argument syntax for command, adding multiple at once (without descriptions).
   *
   * See also .argument().
   *
   * @example
   * program.arguments('<cmd> [env]');
   *
   * @param {string} names
   * @return {Command} `this` command for chaining
   */
  arguments(names) {
    names.trim().split(/ +/).forEach((detail) => {
      this.argument(detail);
    });
    return this;
  }
  /**
   * Define argument syntax for command, adding a prepared argument.
   *
   * @param {Argument} argument
   * @return {Command} `this` command for chaining
   */
  addArgument(argument) {
    const previousArgument = this.registeredArguments.slice(-1)[0];
    if (previousArgument?.variadic) {
      throw new Error(
        `only the last argument can be variadic '${previousArgument.name()}'`
      );
    }
    if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
      throw new Error(
        `a default value for a required argument is never used: '${argument.name()}'`
      );
    }
    this.registeredArguments.push(argument);
    return this;
  }
  /**
   * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
   *
   * @example
   *    program.helpCommand('help [cmd]');
   *    program.helpCommand('help [cmd]', 'show help');
   *    program.helpCommand(false); // suppress default help command
   *    program.helpCommand(true); // add help command even if no subcommands
   *
   * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
   * @param {string} [description] - custom description
   * @return {Command} `this` command for chaining
   */
  helpCommand(enableOrNameAndArgs, description) {
    if (typeof enableOrNameAndArgs === "boolean") {
      this._addImplicitHelpCommand = enableOrNameAndArgs;
      if (enableOrNameAndArgs && this._defaultCommandGroup) {
        this._initCommandGroup(this._getHelpCommand());
      }
      return this;
    }
    const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
    const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const helpDescription = description ?? "display help for command";
    const helpCommand = this.createCommand(helpName);
    helpCommand.helpOption(false);
    if (helpArgs) helpCommand.arguments(helpArgs);
    if (helpDescription) helpCommand.description(helpDescription);
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Add prepared custom help command.
   *
   * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
   * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
   * @return {Command} `this` command for chaining
   */
  addHelpCommand(helpCommand, deprecatedDescription) {
    if (typeof helpCommand !== "object") {
      this.helpCommand(helpCommand, deprecatedDescription);
      return this;
    }
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Lazy create help command.
   *
   * @return {(Command|null)}
   * @package
   */
  _getHelpCommand() {
    const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
    if (hasImplicitHelpCommand) {
      if (this._helpCommand === void 0) {
        this.helpCommand(void 0, void 0);
      }
      return this._helpCommand;
    }
    return null;
  }
  /**
   * Add hook for life cycle event.
   *
   * @param {string} event
   * @param {Function} listener
   * @return {Command} `this` command for chaining
   */
  hook(event, listener) {
    const allowedValues = ["preSubcommand", "preAction", "postAction"];
    if (!allowedValues.includes(event)) {
      throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    if (this._lifeCycleHooks[event]) {
      this._lifeCycleHooks[event].push(listener);
    } else {
      this._lifeCycleHooks[event] = [listener];
    }
    return this;
  }
  /**
   * Register callback to use as replacement for calling process.exit.
   *
   * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
   * @return {Command} `this` command for chaining
   */
  exitOverride(fn) {
    if (fn) {
      this._exitCallback = fn;
    } else {
      this._exitCallback = (err) => {
        if (err.code !== "commander.executeSubCommandAsync") {
          throw err;
        } else {
        }
      };
    }
    return this;
  }
  /**
   * Call process.exit, and _exitCallback if defined.
   *
   * @param {number} exitCode exit code for using with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @return never
   * @private
   */
  _exit(exitCode, code, message) {
    if (this._exitCallback) {
      this._exitCallback(new CommanderError(exitCode, code, message));
    }
    process2.exit(exitCode);
  }
  /**
   * Register callback `fn` for the command.
   *
   * @example
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *      // do work here
   *   });
   *
   * @param {Function} fn
   * @return {Command} `this` command for chaining
   */
  action(fn) {
    const listener = (args) => {
      const expectedArgsCount = this.registeredArguments.length;
      const actionArgs = args.slice(0, expectedArgsCount);
      if (this._storeOptionsAsProperties) {
        actionArgs[expectedArgsCount] = this;
      } else {
        actionArgs[expectedArgsCount] = this.opts();
      }
      actionArgs.push(this);
      return fn.apply(this, actionArgs);
    };
    this._actionHandler = listener;
    return this;
  }
  /**
   * Factory routine to create a new unattached option.
   *
   * See .option() for creating an attached option, which uses this routine to
   * create the option. You can override createOption to return a custom option.
   *
   * @param {string} flags
   * @param {string} [description]
   * @return {Option} new option
   */
  createOption(flags, description) {
    return new Option(flags, description);
  }
  /**
   * Wrap parseArgs to catch 'commander.invalidArgument'.
   *
   * @param {(Option | Argument)} target
   * @param {string} value
   * @param {*} previous
   * @param {string} invalidArgumentMessage
   * @private
   */
  _callParseArg(target, value, previous, invalidArgumentMessage) {
    try {
      return target.parseArg(value, previous);
    } catch (err) {
      if (err.code === "commander.invalidArgument") {
        const message = `${invalidArgumentMessage} ${err.message}`;
        this.error(message, { exitCode: err.exitCode, code: err.code });
      }
      throw err;
    }
  }
  /**
   * Check for option flag conflicts.
   * Register option if no conflicts found, or throw on conflict.
   *
   * @param {Option} option
   * @private
   */
  _registerOption(option) {
    const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
    if (matchingOption) {
      const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
      throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
    }
    this._initOptionGroup(option);
    this.options.push(option);
  }
  /**
   * Check for command name and alias conflicts with existing commands.
   * Register command if no conflicts found, or throw on conflict.
   *
   * @param {Command} command
   * @private
   */
  _registerCommand(command) {
    const knownBy = (cmd) => {
      return [cmd.name()].concat(cmd.aliases());
    };
    const alreadyUsed = knownBy(command).find(
      (name) => this._findCommand(name)
    );
    if (alreadyUsed) {
      const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
      const newCmd = knownBy(command).join("|");
      throw new Error(
        `cannot add command '${newCmd}' as already have command '${existingCmd}'`
      );
    }
    this._initCommandGroup(command);
    this.commands.push(command);
  }
  /**
   * Add an option.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addOption(option) {
    this._registerOption(option);
    const oname = option.name();
    const name = option.attributeName();
    if (option.defaultValue !== void 0) {
      this.setOptionValueWithSource(name, option.defaultValue, "default");
    }
    const handleOptionValue = (val, invalidValueMessage, valueSource) => {
      if (val == null && option.presetArg !== void 0) {
        val = option.presetArg;
      }
      const oldValue = this.getOptionValue(name);
      if (val !== null && option.parseArg) {
        val = this._callParseArg(option, val, oldValue, invalidValueMessage);
      } else if (val !== null && option.variadic) {
        val = option._collectValue(val, oldValue);
      }
      if (val == null) {
        if (option.negate) {
          val = false;
        } else if (option.isBoolean() || option.optional) {
          val = true;
        } else {
          val = "";
        }
      }
      this.setOptionValueWithSource(name, val, valueSource);
    };
    this.on("option:" + oname, (val) => {
      const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
      handleOptionValue(val, invalidValueMessage, "cli");
    });
    if (option.envVar) {
      this.on("optionEnv:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "env");
      });
    }
    return this;
  }
  /**
   * Internal implementation shared by .option() and .requiredOption()
   *
   * @return {Command} `this` command for chaining
   * @private
   */
  _optionEx(config, flags, description, fn, defaultValue) {
    if (typeof flags === "object" && flags instanceof Option) {
      throw new Error(
        "To add an Option object use addOption() instead of option() or requiredOption()"
      );
    }
    const option = this.createOption(flags, description);
    option.makeOptionMandatory(!!config.mandatory);
    if (typeof fn === "function") {
      option.default(defaultValue).argParser(fn);
    } else if (fn instanceof RegExp) {
      const regex = fn;
      fn = (val, def) => {
        const m = regex.exec(val);
        return m ? m[0] : def;
      };
      option.default(defaultValue).argParser(fn);
    } else {
      option.default(fn);
    }
    return this.addOption(option);
  }
  /**
   * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
   * option-argument is indicated by `<>` and an optional option-argument by `[]`.
   *
   * See the README for more details, and see also addOption() and requiredOption().
   *
   * @example
   * program
   *     .option('-p, --pepper', 'add pepper')
   *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
   *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
   *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  option(flags, description, parseArg, defaultValue) {
    return this._optionEx({}, flags, description, parseArg, defaultValue);
  }
  /**
   * Add a required option which must have a value after parsing. This usually means
   * the option must be specified on the command line. (Otherwise the same as .option().)
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  requiredOption(flags, description, parseArg, defaultValue) {
    return this._optionEx(
      { mandatory: true },
      flags,
      description,
      parseArg,
      defaultValue
    );
  }
  /**
   * Alter parsing of short flags with optional values.
   *
   * @example
   * // for `.option('-f,--flag [value]'):
   * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
   * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
   *
   * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
   * @return {Command} `this` command for chaining
   */
  combineFlagAndOptionalValue(combine = true) {
    this._combineFlagAndOptionalValue = !!combine;
    return this;
  }
  /**
   * Allow unknown options on the command line.
   *
   * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
   * @return {Command} `this` command for chaining
   */
  allowUnknownOption(allowUnknown = true) {
    this._allowUnknownOption = !!allowUnknown;
    return this;
  }
  /**
   * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
   *
   * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
   * @return {Command} `this` command for chaining
   */
  allowExcessArguments(allowExcess = true) {
    this._allowExcessArguments = !!allowExcess;
    return this;
  }
  /**
   * Enable positional options. Positional means global options are specified before subcommands which lets
   * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
   * The default behaviour is non-positional and global options may appear anywhere on the command line.
   *
   * @param {boolean} [positional]
   * @return {Command} `this` command for chaining
   */
  enablePositionalOptions(positional = true) {
    this._enablePositionalOptions = !!positional;
    return this;
  }
  /**
   * Pass through options that come after command-arguments rather than treat them as command-options,
   * so actual command-options come before command-arguments. Turning this on for a subcommand requires
   * positional options to have been enabled on the program (parent commands).
   * The default behaviour is non-positional and options may appear before or after command-arguments.
   *
   * @param {boolean} [passThrough] for unknown options.
   * @return {Command} `this` command for chaining
   */
  passThroughOptions(passThrough = true) {
    this._passThroughOptions = !!passThrough;
    this._checkForBrokenPassThrough();
    return this;
  }
  /**
   * @private
   */
  _checkForBrokenPassThrough() {
    if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
      throw new Error(
        `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
      );
    }
  }
  /**
   * Whether to store option values as properties on command object,
   * or store separately (specify false). In both cases the option values can be accessed using .opts().
   *
   * @param {boolean} [storeAsProperties=true]
   * @return {Command} `this` command for chaining
   */
  storeOptionsAsProperties(storeAsProperties = true) {
    if (this.options.length) {
      throw new Error("call .storeOptionsAsProperties() before adding options");
    }
    if (Object.keys(this._optionValues).length) {
      throw new Error(
        "call .storeOptionsAsProperties() before setting option values"
      );
    }
    this._storeOptionsAsProperties = !!storeAsProperties;
    return this;
  }
  /**
   * Retrieve option value.
   *
   * @param {string} key
   * @return {object} value
   */
  getOptionValue(key) {
    if (this._storeOptionsAsProperties) {
      return this[key];
    }
    return this._optionValues[key];
  }
  /**
   * Store option value.
   *
   * @param {string} key
   * @param {object} value
   * @return {Command} `this` command for chaining
   */
  setOptionValue(key, value) {
    return this.setOptionValueWithSource(key, value, void 0);
  }
  /**
   * Store option value and where the value came from.
   *
   * @param {string} key
   * @param {object} value
   * @param {string} source - expected values are default/config/env/cli/implied
   * @return {Command} `this` command for chaining
   */
  setOptionValueWithSource(key, value, source) {
    if (this._storeOptionsAsProperties) {
      this[key] = value;
    } else {
      this._optionValues[key] = value;
    }
    this._optionValueSources[key] = source;
    return this;
  }
  /**
   * Get source of option value.
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSource(key) {
    return this._optionValueSources[key];
  }
  /**
   * Get source of option value. See also .optsWithGlobals().
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSourceWithGlobals(key) {
    let source;
    this._getCommandAndAncestors().forEach((cmd) => {
      if (cmd.getOptionValueSource(key) !== void 0) {
        source = cmd.getOptionValueSource(key);
      }
    });
    return source;
  }
  /**
   * Get user arguments from implied or explicit arguments.
   * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
   *
   * @private
   */
  _prepareUserArgs(argv, parseOptions) {
    if (argv !== void 0 && !Array.isArray(argv)) {
      throw new Error("first parameter to parse must be array or undefined");
    }
    parseOptions = parseOptions || {};
    if (argv === void 0 && parseOptions.from === void 0) {
      if (process2.versions?.electron) {
        parseOptions.from = "electron";
      }
      const execArgv = process2.execArgv ?? [];
      if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
        parseOptions.from = "eval";
      }
    }
    if (argv === void 0) {
      argv = process2.argv;
    }
    this.rawArgs = argv.slice();
    let userArgs;
    switch (parseOptions.from) {
      case void 0:
      case "node":
        this._scriptPath = argv[1];
        userArgs = argv.slice(2);
        break;
      case "electron":
        if (process2.defaultApp) {
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
        } else {
          userArgs = argv.slice(1);
        }
        break;
      case "user":
        userArgs = argv.slice(0);
        break;
      case "eval":
        userArgs = argv.slice(1);
        break;
      default:
        throw new Error(
          `unexpected parse option { from: '${parseOptions.from}' }`
        );
    }
    if (!this._name && this._scriptPath)
      this.nameFromFilename(this._scriptPath);
    this._name = this._name || "program";
    return userArgs;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Use parseAsync instead of parse if any of your action handlers are async.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * program.parse(); // parse process.argv and auto-detect electron and special node flags
   * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
   * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv] - optional, defaults to process.argv
   * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
   * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
   * @return {Command} `this` command for chaining
   */
  parse(argv, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    this._parseCommand([], userArgs);
    return this;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
   * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
   * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv]
   * @param {object} [parseOptions]
   * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
   * @return {Promise}
   */
  async parseAsync(argv, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    await this._parseCommand([], userArgs);
    return this;
  }
  _prepareForParse() {
    if (this._savedState === null) {
      this.options.filter(
        (option) => option.negate && option.defaultValue === void 0 && this.getOptionValue(option.attributeName()) === void 0
      ).forEach((option) => {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(
            option.attributeName(),
            true,
            "default"
          );
        }
      });
      this.saveStateBeforeParse();
    } else {
      this.restoreStateBeforeParse();
    }
  }
  /**
   * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state saved.
   */
  saveStateBeforeParse() {
    this._savedState = {
      // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
      _name: this._name,
      // option values before parse have default values (including false for negated options)
      // shallow clones
      _optionValues: { ...this._optionValues },
      _optionValueSources: { ...this._optionValueSources }
    };
  }
  /**
   * Restore state before parse for calls after the first.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state restored.
   */
  restoreStateBeforeParse() {
    if (this._storeOptionsAsProperties)
      throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
    this._name = this._savedState._name;
    this._scriptPath = null;
    this.rawArgs = [];
    this._optionValues = { ...this._savedState._optionValues };
    this._optionValueSources = { ...this._savedState._optionValueSources };
    this.args = [];
    this.processedArgs = [];
  }
  /**
   * Throw if expected executable is missing. Add lots of help for author.
   *
   * @param {string} executableFile
   * @param {string} executableDir
   * @param {string} subcommandName
   */
  _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
    if (fs.existsSync(executableFile)) return;
    const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
    const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
    throw new Error(executableMissing);
  }
  /**
   * Execute a sub-command executable.
   *
   * @private
   */
  _executeSubCommand(subcommand, args) {
    args = args.slice();
    const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
    function findFile(baseDir, baseName) {
      const localBin = path.resolve(baseDir, baseName);
      if (fs.existsSync(localBin)) return localBin;
      if (sourceExt.includes(path.extname(baseName))) return void 0;
      const foundExt = sourceExt.find(
        (ext) => fs.existsSync(`${localBin}${ext}`)
      );
      if (foundExt) return `${localBin}${foundExt}`;
      return void 0;
    }
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
    let executableDir = this._executableDir || "";
    if (this._scriptPath) {
      let resolvedScriptPath;
      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath);
      } catch {
        resolvedScriptPath = this._scriptPath;
      }
      executableDir = path.resolve(
        path.dirname(resolvedScriptPath),
        executableDir
      );
    }
    if (executableDir) {
      let localFile = findFile(executableDir, executableFile);
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(
          this._scriptPath,
          path.extname(this._scriptPath)
        );
        if (legacyName !== this._name) {
          localFile = findFile(
            executableDir,
            `${legacyName}-${subcommand._name}`
          );
        }
      }
      executableFile = localFile || executableFile;
    }
    const launchWithNode = sourceExt.includes(path.extname(executableFile));
    let proc;
    if (process2.platform !== "win32") {
      if (launchWithNode) {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
      }
    } else {
      this._checkForMissingExecutable(
        executableFile,
        executableDir,
        subcommand._name
      );
      args.unshift(executableFile);
      args = incrementNodeInspectorPort(process2.execArgv).concat(args);
      proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
    }
    if (!proc.killed) {
      const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
      signals.forEach((signal) => {
        process2.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) {
            proc.kill(signal);
          }
        });
      });
    }
    const exitCallback = this._exitCallback;
    proc.on("close", (code) => {
      code = code ?? 1;
      if (!exitCallback) {
        process2.exit(code);
      } else {
        exitCallback(
          new CommanderError(
            code,
            "commander.executeSubCommandAsync",
            "(close)"
          )
        );
      }
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        this._checkForMissingExecutable(
          executableFile,
          executableDir,
          subcommand._name
        );
      } else if (err.code === "EACCES") {
        throw new Error(`'${executableFile}' not executable`);
      }
      if (!exitCallback) {
        process2.exit(1);
      } else {
        const wrappedError = new CommanderError(
          1,
          "commander.executeSubCommandAsync",
          "(error)"
        );
        wrappedError.nestedError = err;
        exitCallback(wrappedError);
      }
    });
    this.runningCommand = proc;
  }
  /**
   * @private
   */
  _dispatchSubcommand(commandName, operands, unknown) {
    const subCommand = this._findCommand(commandName);
    if (!subCommand) this.help({ error: true });
    subCommand._prepareForParse();
    let promiseChain;
    promiseChain = this._chainOrCallSubCommandHook(
      promiseChain,
      subCommand,
      "preSubcommand"
    );
    promiseChain = this._chainOrCall(promiseChain, () => {
      if (subCommand._executableHandler) {
        this._executeSubCommand(subCommand, operands.concat(unknown));
      } else {
        return subCommand._parseCommand(operands, unknown);
      }
    });
    return promiseChain;
  }
  /**
   * Invoke help directly if possible, or dispatch if necessary.
   * e.g. help foo
   *
   * @private
   */
  _dispatchHelpCommand(subcommandName) {
    if (!subcommandName) {
      this.help();
    }
    const subCommand = this._findCommand(subcommandName);
    if (subCommand && !subCommand._executableHandler) {
      subCommand.help();
    }
    return this._dispatchSubcommand(
      subcommandName,
      [],
      [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
    );
  }
  /**
   * Check this.args against expected this.registeredArguments.
   *
   * @private
   */
  _checkNumberOfArguments() {
    this.registeredArguments.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) {
        this.missingArgument(arg.name());
      }
    });
    if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
      return;
    }
    if (this.args.length > this.registeredArguments.length) {
      this._excessArguments(this.args);
    }
  }
  /**
   * Process this.args using this.registeredArguments and save as this.processedArgs!
   *
   * @private
   */
  _processArguments() {
    const myParseArg = (argument, value, previous) => {
      let parsedValue = value;
      if (value !== null && argument.parseArg) {
        const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
        parsedValue = this._callParseArg(
          argument,
          value,
          previous,
          invalidValueMessage
        );
      }
      return parsedValue;
    };
    this._checkNumberOfArguments();
    const processedArgs = [];
    this.registeredArguments.forEach((declaredArg, index) => {
      let value = declaredArg.defaultValue;
      if (declaredArg.variadic) {
        if (index < this.args.length) {
          value = this.args.slice(index);
          if (declaredArg.parseArg) {
            value = value.reduce((processed, v) => {
              return myParseArg(declaredArg, v, processed);
            }, declaredArg.defaultValue);
          }
        } else if (value === void 0) {
          value = [];
        }
      } else if (index < this.args.length) {
        value = this.args[index];
        if (declaredArg.parseArg) {
          value = myParseArg(declaredArg, value, declaredArg.defaultValue);
        }
      }
      processedArgs[index] = value;
    });
    this.processedArgs = processedArgs;
  }
  /**
   * Once we have a promise we chain, but call synchronously until then.
   *
   * @param {(Promise|undefined)} promise
   * @param {Function} fn
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCall(promise, fn) {
    if (promise?.then && typeof promise.then === "function") {
      return promise.then(() => fn());
    }
    return fn();
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallHooks(promise, event) {
    let result = promise;
    const hooks = [];
    this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
      hookedCommand._lifeCycleHooks[event].forEach((callback) => {
        hooks.push({ hookedCommand, callback });
      });
    });
    if (event === "postAction") {
      hooks.reverse();
    }
    hooks.forEach((hookDetail) => {
      result = this._chainOrCall(result, () => {
        return hookDetail.callback(hookDetail.hookedCommand, this);
      });
    });
    return result;
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {Command} subCommand
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallSubCommandHook(promise, subCommand, event) {
    let result = promise;
    if (this._lifeCycleHooks[event] !== void 0) {
      this._lifeCycleHooks[event].forEach((hook) => {
        result = this._chainOrCall(result, () => {
          return hook(this, subCommand);
        });
      });
    }
    return result;
  }
  /**
   * Process arguments in context of this command.
   * Returns action result, in case it is a promise.
   *
   * @private
   */
  _parseCommand(operands, unknown) {
    const parsed = this.parseOptions(unknown);
    this._parseOptionsEnv();
    this._parseOptionsImplied();
    operands = operands.concat(parsed.operands);
    unknown = parsed.unknown;
    this.args = operands.concat(unknown);
    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
    }
    if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
      return this._dispatchHelpCommand(operands[1]);
    }
    if (this._defaultCommandName) {
      this._outputHelpIfRequested(unknown);
      return this._dispatchSubcommand(
        this._defaultCommandName,
        operands,
        unknown
      );
    }
    if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
      this.help({ error: true });
    }
    this._outputHelpIfRequested(parsed.unknown);
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    const checkForUnknownOptions = () => {
      if (parsed.unknown.length > 0) {
        this.unknownOption(parsed.unknown[0]);
      }
    };
    const commandEvent = `command:${this.name()}`;
    if (this._actionHandler) {
      checkForUnknownOptions();
      this._processArguments();
      let promiseChain;
      promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
      promiseChain = this._chainOrCall(
        promiseChain,
        () => this._actionHandler(this.processedArgs)
      );
      if (this.parent) {
        promiseChain = this._chainOrCall(promiseChain, () => {
          this.parent.emit(commandEvent, operands, unknown);
        });
      }
      promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
      return promiseChain;
    }
    if (this.parent?.listenerCount(commandEvent)) {
      checkForUnknownOptions();
      this._processArguments();
      this.parent.emit(commandEvent, operands, unknown);
    } else if (operands.length) {
      if (this._findCommand("*")) {
        return this._dispatchSubcommand("*", operands, unknown);
      }
      if (this.listenerCount("command:*")) {
        this.emit("command:*", operands, unknown);
      } else if (this.commands.length) {
        this.unknownCommand();
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    } else if (this.commands.length) {
      checkForUnknownOptions();
      this.help({ error: true });
    } else {
      checkForUnknownOptions();
      this._processArguments();
    }
  }
  /**
   * Find matching command.
   *
   * @private
   * @return {Command | undefined}
   */
  _findCommand(name) {
    if (!name) return void 0;
    return this.commands.find(
      (cmd) => cmd._name === name || cmd._aliases.includes(name)
    );
  }
  /**
   * Return an option matching `arg` if any.
   *
   * @param {string} arg
   * @return {Option}
   * @package
   */
  _findOption(arg) {
    return this.options.find((option) => option.is(arg));
  }
  /**
   * Display an error message if a mandatory option does not have a value.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForMissingMandatoryOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd.options.forEach((anOption) => {
        if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
          cmd.missingMandatoryOptionValue(anOption);
        }
      });
    });
  }
  /**
   * Display an error message if conflicting options are used together in this.
   *
   * @private
   */
  _checkForConflictingLocalOptions() {
    const definedNonDefaultOptions = this.options.filter((option) => {
      const optionKey = option.attributeName();
      if (this.getOptionValue(optionKey) === void 0) {
        return false;
      }
      return this.getOptionValueSource(optionKey) !== "default";
    });
    const optionsWithConflicting = definedNonDefaultOptions.filter(
      (option) => option.conflictsWith.length > 0
    );
    optionsWithConflicting.forEach((option) => {
      const conflictingAndDefined = definedNonDefaultOptions.find(
        (defined) => option.conflictsWith.includes(defined.attributeName())
      );
      if (conflictingAndDefined) {
        this._conflictingOption(option, conflictingAndDefined);
      }
    });
  }
  /**
   * Display an error message if conflicting options are used together.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForConflictingOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd._checkForConflictingLocalOptions();
    });
  }
  /**
   * Parse options from `argv` removing known options,
   * and return argv split into operands and unknown arguments.
   *
   * Side effects: modifies command by storing options. Does not reset state if called again.
   *
   * Examples:
   *
   *     argv => operands, unknown
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   *
   * @param {string[]} args
   * @return {{operands: string[], unknown: string[]}}
   */
  parseOptions(args) {
    const operands = [];
    const unknown = [];
    let dest = operands;
    function maybeOption(arg) {
      return arg.length > 1 && arg[0] === "-";
    }
    const negativeNumberArg = (arg) => {
      if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
      return !this._getCommandAndAncestors().some(
        (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
      );
    };
    let activeVariadicOption = null;
    let activeGroup = null;
    let i = 0;
    while (i < args.length || activeGroup) {
      const arg = activeGroup ?? args[i++];
      activeGroup = null;
      if (arg === "--") {
        if (dest === unknown) dest.push(arg);
        dest.push(...args.slice(i));
        break;
      }
      if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
        this.emit(`option:${activeVariadicOption.name()}`, arg);
        continue;
      }
      activeVariadicOption = null;
      if (maybeOption(arg)) {
        const option = this._findOption(arg);
        if (option) {
          if (option.required) {
            const value = args[i++];
            if (value === void 0) this.optionMissingArgument(option);
            this.emit(`option:${option.name()}`, value);
          } else if (option.optional) {
            let value = null;
            if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
              value = args[i++];
            }
            this.emit(`option:${option.name()}`, value);
          } else {
            this.emit(`option:${option.name()}`);
          }
          activeVariadicOption = option.variadic ? option : null;
          continue;
        }
      }
      if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
        const option = this._findOption(`-${arg[1]}`);
        if (option) {
          if (option.required || option.optional && this._combineFlagAndOptionalValue) {
            this.emit(`option:${option.name()}`, arg.slice(2));
          } else {
            this.emit(`option:${option.name()}`);
            activeGroup = `-${arg.slice(2)}`;
          }
          continue;
        }
      }
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf("=");
        const option = this._findOption(arg.slice(0, index));
        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1));
          continue;
        }
      }
      if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
        dest = unknown;
      }
      if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
        if (this._findCommand(arg)) {
          operands.push(arg);
          unknown.push(...args.slice(i));
          break;
        } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
          operands.push(arg, ...args.slice(i));
          break;
        } else if (this._defaultCommandName) {
          unknown.push(arg, ...args.slice(i));
          break;
        }
      }
      if (this._passThroughOptions) {
        dest.push(arg, ...args.slice(i));
        break;
      }
      dest.push(arg);
    }
    return { operands, unknown };
  }
  /**
   * Return an object containing local option values as key-value pairs.
   *
   * @return {object}
   */
  opts() {
    if (this._storeOptionsAsProperties) {
      const result = {};
      const len = this.options.length;
      for (let i = 0; i < len; i++) {
        const key = this.options[i].attributeName();
        result[key] = key === this._versionOptionName ? this._version : this[key];
      }
      return result;
    }
    return this._optionValues;
  }
  /**
   * Return an object containing merged local and global option values as key-value pairs.
   *
   * @return {object}
   */
  optsWithGlobals() {
    return this._getCommandAndAncestors().reduce(
      (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
      {}
    );
  }
  /**
   * Display error message and exit (or call exitOverride).
   *
   * @param {string} message
   * @param {object} [errorOptions]
   * @param {string} [errorOptions.code] - an id string representing the error
   * @param {number} [errorOptions.exitCode] - used with process.exit
   */
  error(message, errorOptions) {
    this._outputConfiguration.outputError(
      `${message}
`,
      this._outputConfiguration.writeErr
    );
    if (typeof this._showHelpAfterError === "string") {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr("\n");
      this.outputHelp({ error: true });
    }
    const config = errorOptions || {};
    const exitCode = config.exitCode || 1;
    const code = config.code || "commander.error";
    this._exit(exitCode, code, message);
  }
  /**
   * Apply any option related environment variables, if option does
   * not have a value from cli or client code.
   *
   * @private
   */
  _parseOptionsEnv() {
    this.options.forEach((option) => {
      if (option.envVar && option.envVar in process2.env) {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
          this.getOptionValueSource(optionKey)
        )) {
          if (option.required || option.optional) {
            this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
          } else {
            this.emit(`optionEnv:${option.name()}`);
          }
        }
      }
    });
  }
  /**
   * Apply any implied option values, if option is undefined or default value.
   *
   * @private
   */
  _parseOptionsImplied() {
    const dualHelper = new DualOptions(this.options);
    const hasCustomOptionValue = (optionKey) => {
      return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
    };
    this.options.filter(
      (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
        this.getOptionValue(option.attributeName()),
        option
      )
    ).forEach((option) => {
      Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
        this.setOptionValueWithSource(
          impliedKey,
          option.implied[impliedKey],
          "implied"
        );
      });
    });
  }
  /**
   * Argument `name` is missing.
   *
   * @param {string} name
   * @private
   */
  missingArgument(name) {
    const message = `error: missing required argument '${name}'`;
    this.error(message, { code: "commander.missingArgument" });
  }
  /**
   * `Option` is missing an argument.
   *
   * @param {Option} option
   * @private
   */
  optionMissingArgument(option) {
    const message = `error: option '${option.flags}' argument missing`;
    this.error(message, { code: "commander.optionMissingArgument" });
  }
  /**
   * `Option` does not have a value, and is a mandatory option.
   *
   * @param {Option} option
   * @private
   */
  missingMandatoryOptionValue(option) {
    const message = `error: required option '${option.flags}' not specified`;
    this.error(message, { code: "commander.missingMandatoryOptionValue" });
  }
  /**
   * `Option` conflicts with another option.
   *
   * @param {Option} option
   * @param {Option} conflictingOption
   * @private
   */
  _conflictingOption(option, conflictingOption) {
    const findBestOptionFromValue = (option2) => {
      const optionKey = option2.attributeName();
      const optionValue = this.getOptionValue(optionKey);
      const negativeOption = this.options.find(
        (target) => target.negate && optionKey === target.attributeName()
      );
      const positiveOption = this.options.find(
        (target) => !target.negate && optionKey === target.attributeName()
      );
      if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
        return negativeOption;
      }
      return positiveOption || option2;
    };
    const getErrorMessage = (option2) => {
      const bestOption = findBestOptionFromValue(option2);
      const optionKey = bestOption.attributeName();
      const source = this.getOptionValueSource(optionKey);
      if (source === "env") {
        return `environment variable '${bestOption.envVar}'`;
      }
      return `option '${bestOption.flags}'`;
    };
    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
    this.error(message, { code: "commander.conflictingOption" });
  }
  /**
   * Unknown option `flag`.
   *
   * @param {string} flag
   * @private
   */
  unknownOption(flag) {
    if (this._allowUnknownOption) return;
    let suggestion = "";
    if (flag.startsWith("--") && this._showSuggestionAfterError) {
      let candidateFlags = [];
      let command = this;
      do {
        const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
        candidateFlags = candidateFlags.concat(moreFlags);
        command = command.parent;
      } while (command && !command._enablePositionalOptions);
      suggestion = suggestSimilar(flag, candidateFlags);
    }
    const message = `error: unknown option '${flag}'${suggestion}`;
    this.error(message, { code: "commander.unknownOption" });
  }
  /**
   * Excess arguments, more than expected.
   *
   * @param {string[]} receivedArgs
   * @private
   */
  _excessArguments(receivedArgs) {
    if (this._allowExcessArguments) return;
    const expected = this.registeredArguments.length;
    const s = expected === 1 ? "" : "s";
    const received = receivedArgs.length;
    const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
    const details = receivedArgs.join(", ");
    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${received}: ${details}.`;
    this.error(message, { code: "commander.excessArguments" });
  }
  /**
   * Unknown command.
   *
   * @private
   */
  unknownCommand() {
    const unknownName = this.args[0];
    let suggestion = "";
    if (this._showSuggestionAfterError) {
      const candidateNames = [];
      this.createHelp().visibleCommands(this).forEach((command) => {
        candidateNames.push(command.name());
        if (command.alias()) candidateNames.push(command.alias());
      });
      suggestion = suggestSimilar(unknownName, candidateNames);
    }
    const message = `error: unknown command '${unknownName}'${suggestion}`;
    this.error(message, { code: "commander.unknownCommand" });
  }
  /**
   * Get or set the program version.
   *
   * This method auto-registers the "-V, --version" option which will print the version number.
   *
   * You can optionally supply the flags and description to override the defaults.
   *
   * @param {string} [str]
   * @param {string} [flags]
   * @param {string} [description]
   * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
   */
  version(str, flags, description) {
    if (str === void 0) return this._version;
    this._version = str;
    flags = flags || "-V, --version";
    description = description || "output the version number";
    const versionOption = this.createOption(flags, description);
    this._versionOptionName = versionOption.attributeName();
    this._registerOption(versionOption);
    this.on("option:" + versionOption.name(), () => {
      this._outputConfiguration.writeOut(`${str}
`);
      this._exit(0, "commander.version", str);
    });
    return this;
  }
  /**
   * Set the description.
   *
   * @param {string} [str]
   * @param {object} [argsDescription]
   * @return {(string|Command)}
   */
  description(str, argsDescription) {
    if (str === void 0 && argsDescription === void 0)
      return this._description;
    this._description = str;
    if (argsDescription) {
      this._argsDescription = argsDescription;
    }
    return this;
  }
  /**
   * Set the summary. Used when listed as subcommand of parent.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  summary(str) {
    if (str === void 0) return this._summary;
    this._summary = str;
    return this;
  }
  /**
   * Set an alias for the command.
   *
   * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
   *
   * @param {string} [alias]
   * @return {(string|Command)}
   */
  alias(alias) {
    if (alias === void 0) return this._aliases[0];
    let command = this;
    if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
      command = this.commands[this.commands.length - 1];
    }
    if (alias === command._name)
      throw new Error("Command alias can't be the same as its name");
    const matchingCommand = this.parent?._findCommand(alias);
    if (matchingCommand) {
      const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
      throw new Error(
        `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
      );
    }
    command._aliases.push(alias);
    return this;
  }
  /**
   * Set aliases for the command.
   *
   * Only the first alias is shown in the auto-generated help.
   *
   * @param {string[]} [aliases]
   * @return {(string[]|Command)}
   */
  aliases(aliases) {
    if (aliases === void 0) return this._aliases;
    aliases.forEach((alias) => this.alias(alias));
    return this;
  }
  /**
   * Set / get the command usage `str`.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  usage(str) {
    if (str === void 0) {
      if (this._usage) return this._usage;
      const args = this.registeredArguments.map((arg) => {
        return humanReadableArgName(arg);
      });
      return [].concat(
        this.options.length || this._helpOption !== null ? "[options]" : [],
        this.commands.length ? "[command]" : [],
        this.registeredArguments.length ? args : []
      ).join(" ");
    }
    this._usage = str;
    return this;
  }
  /**
   * Get or set the name of the command.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  name(str) {
    if (str === void 0) return this._name;
    this._name = str;
    return this;
  }
  /**
   * Set/get the help group heading for this subcommand in parent command's help.
   *
   * @param {string} [heading]
   * @return {Command | string}
   */
  helpGroup(heading) {
    if (heading === void 0) return this._helpGroupHeading ?? "";
    this._helpGroupHeading = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for subcommands added to this command.
   * (This does not override a group set directly on the subcommand using .helpGroup().)
   *
   * @example
   * program.commandsGroup('Development Commands:);
   * program.command('watch')...
   * program.command('lint')...
   * ...
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  commandsGroup(heading) {
    if (heading === void 0) return this._defaultCommandGroup ?? "";
    this._defaultCommandGroup = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for options added to this command.
   * (This does not override a group set directly on the option using .helpGroup().)
   *
   * @example
   * program
   *   .optionsGroup('Development Options:')
   *   .option('-d, --debug', 'output extra debugging')
   *   .option('-p, --profile', 'output profiling information')
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  optionsGroup(heading) {
    if (heading === void 0) return this._defaultOptionGroup ?? "";
    this._defaultOptionGroup = heading;
    return this;
  }
  /**
   * @param {Option} option
   * @private
   */
  _initOptionGroup(option) {
    if (this._defaultOptionGroup && !option.helpGroupHeading)
      option.helpGroup(this._defaultOptionGroup);
  }
  /**
   * @param {Command} cmd
   * @private
   */
  _initCommandGroup(cmd) {
    if (this._defaultCommandGroup && !cmd.helpGroup())
      cmd.helpGroup(this._defaultCommandGroup);
  }
  /**
   * Set the name of the command from script filename, such as process.argv[1],
   * or import.meta.filename.
   *
   * (Used internally and public although not documented in README.)
   *
   * @example
   * program.nameFromFilename(import.meta.filename);
   *
   * @param {string} filename
   * @return {Command}
   */
  nameFromFilename(filename) {
    this._name = path.basename(filename, path.extname(filename));
    return this;
  }
  /**
   * Get or set the directory for searching for executable subcommands of this command.
   *
   * @example
   * program.executableDir(import.meta.dirname);
   * // or
   * program.executableDir('subcommands');
   *
   * @param {string} [path]
   * @return {(string|null|Command)}
   */
  executableDir(path2) {
    if (path2 === void 0) return this._executableDir;
    this._executableDir = path2;
    return this;
  }
  /**
   * Return program help documentation.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
   * @return {string}
   */
  helpInformation(contextOptions) {
    const helper = this.createHelp();
    const context = this._getOutputContext(contextOptions);
    helper.prepareContext({
      error: context.error,
      helpWidth: context.helpWidth,
      outputHasColors: context.hasColors
    });
    const text = helper.formatHelp(this, helper);
    if (context.hasColors) return text;
    return this._outputConfiguration.stripColor(text);
  }
  /**
   * @typedef HelpContext
   * @type {object}
   * @property {boolean} error
   * @property {number} helpWidth
   * @property {boolean} hasColors
   * @property {function} write - includes stripColor if needed
   *
   * @returns {HelpContext}
   * @private
   */
  _getOutputContext(contextOptions) {
    contextOptions = contextOptions || {};
    const error = !!contextOptions.error;
    let baseWrite;
    let hasColors;
    let helpWidth;
    if (error) {
      baseWrite = (str) => this._outputConfiguration.writeErr(str);
      hasColors = this._outputConfiguration.getErrHasColors();
      helpWidth = this._outputConfiguration.getErrHelpWidth();
    } else {
      baseWrite = (str) => this._outputConfiguration.writeOut(str);
      hasColors = this._outputConfiguration.getOutHasColors();
      helpWidth = this._outputConfiguration.getOutHelpWidth();
    }
    const write = (str) => {
      if (!hasColors) str = this._outputConfiguration.stripColor(str);
      return baseWrite(str);
    };
    return { error, write, hasColors, helpWidth };
  }
  /**
   * Output help information for this command.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  outputHelp(contextOptions) {
    let deprecatedCallback;
    if (typeof contextOptions === "function") {
      deprecatedCallback = contextOptions;
      contextOptions = void 0;
    }
    const outputContext = this._getOutputContext(contextOptions);
    const eventContext = {
      error: outputContext.error,
      write: outputContext.write,
      command: this
    };
    this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
    this.emit("beforeHelp", eventContext);
    let helpInformation = this.helpInformation({ error: outputContext.error });
    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation);
      if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
        throw new Error("outputHelp callback must return a string or a Buffer");
      }
    }
    outputContext.write(helpInformation);
    if (this._getHelpOption()?.long) {
      this.emit(this._getHelpOption().long);
    }
    this.emit("afterHelp", eventContext);
    this._getCommandAndAncestors().forEach(
      (command) => command.emit("afterAllHelp", eventContext)
    );
  }
  /**
   * You can pass in flags and a description to customise the built-in help option.
   * Pass in false to disable the built-in help option.
   *
   * @example
   * program.helpOption('-?, --help' 'show help'); // customise
   * program.helpOption(false); // disable
   *
   * @param {(string | boolean)} flags
   * @param {string} [description]
   * @return {Command} `this` command for chaining
   */
  helpOption(flags, description) {
    if (typeof flags === "boolean") {
      if (flags) {
        if (this._helpOption === null) this._helpOption = void 0;
        if (this._defaultOptionGroup) {
          this._initOptionGroup(this._getHelpOption());
        }
      } else {
        this._helpOption = null;
      }
      return this;
    }
    this._helpOption = this.createOption(
      flags ?? "-h, --help",
      description ?? "display help for command"
    );
    if (flags || description) this._initOptionGroup(this._helpOption);
    return this;
  }
  /**
   * Lazy create help option.
   * Returns null if has been disabled with .helpOption(false).
   *
   * @returns {(Option | null)} the help option
   * @package
   */
  _getHelpOption() {
    if (this._helpOption === void 0) {
      this.helpOption(void 0, void 0);
    }
    return this._helpOption;
  }
  /**
   * Supply your own option to use for the built-in help option.
   * This is an alternative to using helpOption() to customise the flags and description etc.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addHelpOption(option) {
    this._helpOption = option;
    this._initOptionGroup(option);
    return this;
  }
  /**
   * Output help information and exit.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  help(contextOptions) {
    this.outputHelp(contextOptions);
    let exitCode = Number(process2.exitCode ?? 0);
    if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
      exitCode = 1;
    }
    this._exit(exitCode, "commander.help", "(outputHelp)");
  }
  /**
   * // Do a little typing to coordinate emit and listener for the help text events.
   * @typedef HelpTextEventContext
   * @type {object}
   * @property {boolean} error
   * @property {Command} command
   * @property {function} write
   */
  /**
   * Add additional text to be displayed with the built-in help.
   *
   * Position is 'before' or 'after' to affect just this command,
   * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
   *
   * @param {string} position - before or after built-in help
   * @param {(string | Function)} text - string to add, or a function returning a string
   * @return {Command} `this` command for chaining
   */
  addHelpText(position, text) {
    const allowedValues = ["beforeAll", "before", "after", "afterAll"];
    if (!allowedValues.includes(position)) {
      throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    const helpEvent = `${position}Help`;
    this.on(helpEvent, (context) => {
      let helpStr;
      if (typeof text === "function") {
        helpStr = text({ error: context.error, command: context.command });
      } else {
        helpStr = text;
      }
      if (helpStr) {
        context.write(`${helpStr}
`);
      }
    });
    return this;
  }
  /**
   * Output help information if help flags specified
   *
   * @param {Array} args - array of options to search for help flags
   * @private
   */
  _outputHelpIfRequested(args) {
    const helpOption = this._getHelpOption();
    const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
    if (helpRequested) {
      this.outputHelp();
      this._exit(0, "commander.helpDisplayed", "(outputHelp)");
    }
  }
};
function incrementNodeInspectorPort(args) {
  return args.map((arg) => {
    if (!arg.startsWith("--inspect")) {
      return arg;
    }
    let debugOption;
    let debugHost = "127.0.0.1";
    let debugPort = "9229";
    let match;
    if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
      debugOption = match[1];
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
      debugOption = match[1];
      if (/^\d+$/.test(match[3])) {
        debugPort = match[3];
      } else {
        debugHost = match[3];
      }
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
      debugOption = match[1];
      debugHost = match[3];
      debugPort = match[4];
    }
    if (debugOption && debugPort !== "0") {
      return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
    }
    return arg;
  });
}
function useColor() {
  if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
    return false;
  if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
    return true;
  return void 0;
}

// node_modules/commander/index.js
var program = new Command();

// src/core/compile.ts
import { existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";

// src/core/init.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// src/core/templates.generated.ts
var TEMPLATES = {
  "AGENTS.md": "<!-- Generated by `baton compile` from .context/rules.md. Edit that file, not this one. -->\n# Agent guide\n\n{rules from .context/rules.md}\n\n## Continuity\n\n- A brief of current state, ready tasks and relevant spec sections is injected at session start.\n- More context on demand: `.context/spec.md` (intent), `.context/decisions/` (why), `.context/knowledge/` (how-to and gotchas).\n- `baton mission --task <id>` prints the brief for one task.\n",
  "CLAUDE.md": "@AGENTS.md\n",
  "context/STATE.md": "---\nid: state\nkind: state\nverified_at: null\nsource_paths: []\ngenerated_by: baton init\n---\n# State\n\nGenerated by `baton handoff` at PreCompact and SessionEnd. Do not edit by hand.\n\n**Phase:** not started\n",
  "context/config.yaml": `# baton configuration. Every key is optional; defaults live in src/core/config.ts.
version: 1

packet:
  maxChars: 9000   # Claude Code caps SessionStart context at 10,000 chars (ADR 0004)
  maxTasks: 3

freshness:
  staleAfter:      # commits touching source_paths before a section is stale; null = never by commits
    rule: 5
    state: 3
    knowledge: 10
    intent: 20
    decision: null

tasks:
  backend: native  # native | beads | claude-tasks | none  (ADR 0009)
  # prefix: myapp   # task id prefix; default: project folder name

verify:
  requireDiff: true
  onStop: false    # Stop hook runs the active task's check and blocks on failure (ADR 0019)

guards:
  protectState: true
  preflightPaths:
    - package.json
    - package-lock.json
    - pnpm-lock.yaml
    - yarn.lock
    - requirements.txt
    - pyproject.toml
    - Cargo.toml
    - go.mod
    - "**/migrations/**"
`,
  "context/decisions/0000-template.md": '---\nid: adr-NNNN\nkind: decision\nstatus: proposed\ndate: YYYY-MM-DD\ndecision-makers: []\nverified_at: null\nsource_paths: []\nsupersedes: null\nspec_sections: []\n---\n# {short title, representative of solved problem and found solution}\n\n## Context and Problem Statement\n\n{Two or three sentences: the problem, and why a decision is needed now.}\n\n## Decision Drivers\n\n* {driver}\n\n## Considered Options\n\n* {option 1}\n* {option 2}\n\n## Decision Outcome\n\nChosen option: "{option}", because {justification}.\n\n### Consequences\n\n* Good, because {\u2026}\n* Bad, because {\u2026}\n\n### Confirmation\n\n{How compliance is checked: a test, a lint rule, `baton decide --preflight`.}\n',
  "context/knowledge/README.md": "# Knowledge\n\nOne file per topic (`<topic>.md`), each with frontmatter:\n\n```yaml\n---\nid: knowledge-<topic>\nkind: knowledge\nverified_at: null\nsource_paths: []\n---\n```\n\nOne fact per bullet. Append during work (the `checkpoint` skill does this); `baton drift` flags oversized or orphaned topics for compaction. Topics load on demand, never by default.\n",
  "context/rules.md": '# Rules (source of AGENTS.md)\n\n`baton compile` regenerates AGENTS.md from this file. Keep it short: every line here is loaded in every session.\n\n## Project rules\n<!-- baton: {id: rules-project, kind: rule, verified_at: null, source_paths: []} -->\n\n- How to build, test and lint, in one line each.\n- The two or three conventions an agent gets wrong most often.\n\n## Continuity rules\n<!-- baton: {id: rules-continuity, kind: rule, verified_at: null, source_paths: [".context/**"]} -->\n\n- Do not edit `.context/STATE.md` directly; `baton handoff` regenerates it. Decision records come from `baton decide`: edit only a proposed record\'s body; every other record, and every frontmatter, changes only through `baton decide`.\n- Load-bearing choices get a decision record before code (`baton decide --preflight` first).\n- No markdown TODO lists; work items live in the task store (`baton task ready`, `baton task create`). Never edit `.context/tasks.jsonl` by hand.\n- A task is done when `baton verify <id>` runs its check and closes it.\n',
  "context/spec.md": "# Spec\n\nIntent and boundaries. Run the `init-spec` skill to fill this in; each section needs a marker with an id, a kind and the source paths that could make it wrong.\n\n## Purpose\n<!-- baton: {id: purpose, kind: intent, verified_at: null, source_paths: []} -->\n\nWhat this project is for and who it serves, in three sentences.\n\n## Scope and non-goals\n<!-- baton: {id: scope, kind: intent, verified_at: null, source_paths: []} -->\n\nWhat is in, and what is deliberately out.\n"
};

// src/core/init.ts
var RULES_PLACEHOLDER = "{rules from .context/rules.md}";
var GITATTRIBUTES_LINES = [
  ".context/tasks.jsonl merge=union",
  ".context/memories.jsonl merge=union"
];
var GITIGNORE_LINES = [".context/.cache/"];
var ALL_HARNESSES = ["claude", "codex", "gemini"];
var toLf = (text) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
function renderAgentsMd(template2, rulesMd) {
  const sections = parseSections(toLf(rulesMd), ".context/rules.md");
  const rendered = sections.length > 0 ? sections.map((s) => `## ${s.title}

${s.body}`).join("\n\n") : "_No rules yet: edit .context/rules.md._";
  return template2.split("\n").map((line) => line.trim() === RULES_PLACEHOLDER ? rendered : line).join("\n");
}
function ensureLines(existing, lines) {
  if (existing === null) return { text: `${lines.join("\n")}
`, added: [...lines] };
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const added = lines.filter((l) => !have.has(l));
  if (added.length === 0) return { text: existing, added };
  const gap = existing && !existing.endsWith("\n") ? eol : "";
  return { text: existing + gap + added.join(eol) + eol, added };
}
function parseHarnesses(value) {
  const out3 = [];
  for (const raw of value.split(",")) {
    const name = raw.trim().toLowerCase();
    const picked = name === "all" ? ALL_HARNESSES : ALL_HARNESSES.filter((h) => h === name);
    if (picked.length === 0) {
      throw new BatonError(`unknown harness "${name}" (claude, codex, gemini or all)`);
    }
    for (const h of picked) if (!out3.includes(h)) out3.push(h);
  }
  return out3;
}
var TEMPLATE_FILES = [
  [".context/config.yaml", "context/config.yaml"],
  [".context/rules.md", "context/rules.md"],
  [".context/spec.md", "context/spec.md"],
  [".context/STATE.md", "context/STATE.md"],
  [".context/decisions/0000-template.md", "context/decisions/0000-template.md"],
  [".context/knowledge/README.md", "context/knowledge/README.md"],
  ["AGENTS.md", "AGENTS.md"],
  ["CLAUDE.md", "CLAUDE.md"]
];
function template(key) {
  const text = TEMPLATES[key];
  if (text === void 0) throw new BatonError(`missing embedded template "${key}"`);
  return text;
}
function writeTemplate(root, path2, content, force) {
  const abs = join(root, path2);
  if (!existsSync(abs)) {
    writeFileAtomic(abs, content);
    return { path: path2, action: "create" };
  }
  if (force) {
    writeFileAtomic(abs, content);
    return { path: path2, action: "overwrite" };
  }
  if (path2 === "CLAUDE.md" && !/^@AGENTS\.md[ \t]*$/m.test(toLf(readFileSync(abs, "utf8")))) {
    return {
      path: path2,
      action: "skip",
      note: "exists without @AGENTS.md; add that line so Claude Code loads AGENTS.md (ADR 0006)"
    };
  }
  return { path: path2, action: "skip", note: "exists; --force overwrites" };
}
function addLines(root, path2, lines) {
  const abs = join(root, path2);
  const existing = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  const { text, added } = ensureLines(existing, lines);
  if (added.length === 0) return { path: path2, action: "skip", note: "already present" };
  writeFileAtomic(abs, text);
  return {
    path: path2,
    action: existing === null ? "create" : "append",
    note: `${added.length} line(s)`
  };
}
var RULES_FILE = ".context/rules.md";
function plannedAgentsMd(root, force) {
  if (!force && existsSync(join(root, "AGENTS.md"))) return null;
  const rulesPath = join(root, RULES_FILE);
  const rules = !force && existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : template("context/rules.md");
  try {
    return renderAgentsMd(template("AGENTS.md"), rules);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BatonError(message.startsWith(RULES_FILE) ? message : `${RULES_FILE}: ${message}`);
  }
}
async function scaffold(root, opts) {
  const agentsMd = plannedAgentsMd(root, opts.force);
  const actions = [];
  for (const [path2, key] of TEMPLATE_FILES) {
    const content = path2 === "AGENTS.md" && agentsMd !== null ? agentsMd : template(key);
    actions.push(writeTemplate(root, path2, content, opts.force));
  }
  actions.push(addLines(root, ".gitattributes", GITATTRIBUTES_LINES));
  actions.push(addLines(root, ".gitignore", GITIGNORE_LINES));
  return actions;
}

// src/core/compile.ts
var AGENTS_FILE = "AGENTS.md";
var CLAUDE_FILE = "CLAUDE.md";
var CLAUDE_IMPORT = "@AGENTS.md";
var AGENTS_MAX_LINES = 60;
var GENERATED_HEADER = "<!-- Generated by `baton compile`";
var HAND_WRITTEN_MESSAGE = "AGENTS.md is hand-written; move its rules into .context/rules.md sections, then run baton compile --force";
function normalizeText(t) {
  return t.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
function compileAgentsMd(rulesMd) {
  let text;
  try {
    text = renderAgentsMd(TEMPLATES["AGENTS.md"], normalizeText(rulesMd));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const first = message.split("\n")[0] ?? message;
    throw new BatonError(
      first.startsWith(".context/rules.md") ? first : `.context/rules.md: ${first}`
    );
  }
  const lines = text.replace(/\n$/, "").split("\n").length;
  if (lines > AGENTS_MAX_LINES) {
    throw new BatonError(
      `AGENTS.md would be ${lines} lines (max ${AGENTS_MAX_LINES}, ADR 0006); shorten .context/rules.md`,
      ExitCode.Blocked
    );
  }
  return text;
}
function unmarkedHeadings(rulesMd) {
  const lines = normalizeText(rulesMd).split("\n");
  const out3 = [];
  lines.forEach((text, i) => {
    if (!text.startsWith("## ")) return;
    if (/^<!--\s*baton:/.test(lines[i + 1] ?? "")) return;
    out3.push({ line: i + 1, title: text.slice(3).trim() });
  });
  return out3;
}
function firstDifference(a, b) {
  const x = normalizeText(a).split("\n");
  const y = normalizeText(b).split("\n");
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return i + 1;
  return x.length === y.length ? null : n + 1;
}
function isGeneratedAgentsMd(text) {
  return normalizeText(text).startsWith(GENERATED_HEADER);
}
function readIfExists(path2) {
  return existsSync2(path2) ? readTextOrEmpty(path2) : null;
}
async function planCompile(root) {
  const rulesFile = contextPath(root, "rules.md");
  if (!existsSync2(rulesFile)) throw new BatonError("no .context/rules.md");
  const rules = readTextOrEmpty(rulesFile);
  const nextAgents = compileAgentsMd(rules);
  const agentsCurrent = readIfExists(join2(root, AGENTS_FILE));
  let agents;
  if (agentsCurrent === null) {
    agents = {
      path: AGENTS_FILE,
      current: null,
      next: nextAgents,
      action: "create",
      firstDiff: null
    };
  } else if (normalizeText(agentsCurrent) === nextAgents) {
    agents = {
      path: AGENTS_FILE,
      current: agentsCurrent,
      next: nextAgents,
      action: "unchanged",
      firstDiff: null
    };
  } else {
    agents = {
      path: AGENTS_FILE,
      current: agentsCurrent,
      next: nextAgents,
      action: "update",
      firstDiff: firstDifference(agentsCurrent, nextAgents)
    };
    if (!isGeneratedAgentsMd(agentsCurrent)) agents.handWritten = true;
  }
  const claudeCurrent = readIfExists(join2(root, CLAUDE_FILE));
  let claude;
  if (claudeCurrent === null) {
    claude = {
      path: CLAUDE_FILE,
      current: null,
      next: `${CLAUDE_IMPORT}
`,
      action: "create",
      firstDiff: null
    };
  } else {
    const ensured = ensureLines(claudeCurrent, [CLAUDE_IMPORT]);
    claude = {
      path: CLAUDE_FILE,
      current: claudeCurrent,
      next: ensured.text,
      action: ensured.added.length > 0 ? "append" : "unchanged",
      firstDiff: null
    };
  }
  const warnings = unmarkedHeadings(rules).map(
    (h) => `.context/rules.md:${h.line}: heading "${h.title}" has no baton marker; it is not compiled into AGENTS.md`
  );
  return { files: [agents, claude], warnings };
}
function applyCompile(root, files, opts = {}) {
  if (!opts.force && files.some((f) => f.handWritten)) {
    throw new BatonError(HAND_WRITTEN_MESSAGE, ExitCode.Blocked);
  }
  for (const f of files) {
    if (f.action !== "unchanged") writeFileAtomic(join2(root, f.path), f.next);
  }
}

// src/commands/_shared.ts
import { existsSync as existsSync3 } from "fs";
import { homedir } from "os";
function homeDir() {
  return process.env.BATON_HOME ?? homedir();
}
function projectRoot() {
  return resolveProjectRoot(process.cwd(), homeDir());
}
function requireContext(root) {
  if (!existsSync3(contextPath(root))) {
    throw new BatonError(`no .context/ in ${root}; run \`baton init\` first`);
  }
}
function action(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof BatonError) {
        process.stderr.write(`baton: ${err.message}
`);
        process.exitCode = err.exitCode;
        return;
      }
      process.stderr.write(`baton: unexpected error
${err?.stack ?? String(err)}
`);
      process.exitCode = ExitCode.Error;
    }
  };
}
var HARNESSES = ["claude", "codex", "gemini"];

// src/commands/compile.ts
function registerCompile(program2) {
  program2.command("compile").description(
    "regenerate AGENTS.md from .context/rules.md and make CLAUDE.md import it (@AGENTS.md)"
  ).option("--check", "exit 2 if AGENTS.md or CLAUDE.md is out of date; write nothing").option("--force", "replace a hand-written AGENTS.md").action(
    action(async (opts) => {
      const root = await projectRoot();
      requireContext(root);
      const { files, warnings } = await planCompile(root);
      for (const w of warnings) process.stderr.write(`note: ${w}
`);
      if (opts.check) {
        const stale = files.filter((f) => f.action !== "unchanged");
        for (const f of stale) process.stderr.write(`${driftMessage(f)}
`);
        if (stale.length > 0) {
          throw new BatonError(
            `compile --check: ${stale.length} file(s) out of date; run baton compile`,
            ExitCode.Blocked
          );
        }
        process.stdout.write("AGENTS.md and CLAUDE.md are up to date\n");
        return;
      }
      applyCompile(root, files, { force: opts.force === true });
      for (const f of files) process.stdout.write(`${doneMessage(f)}
`);
    })
  );
}
function driftMessage(f) {
  if (f.path === "AGENTS.md") {
    if (f.handWritten) return HAND_WRITTEN_MESSAGE;
    return f.action === "create" ? "AGENTS.md is missing" : `AGENTS.md is out of date with .context/rules.md (first difference at line ${f.firstDiff})`;
  }
  return "CLAUDE.md does not import AGENTS.md (@AGENTS.md)";
}
function doneMessage(f) {
  if (f.path === "AGENTS.md") {
    return f.action === "unchanged" ? "AGENTS.md unchanged" : "wrote AGENTS.md";
  }
  if (f.action === "create") return "created CLAUDE.md";
  return f.action === "unchanged" ? "CLAUDE.md unchanged" : "added @AGENTS.md to CLAUDE.md";
}

// src/core/decide.ts
import { mkdirSync, readFileSync as readFileSync2, unlinkSync, writeFileSync } from "fs";
import { readdir } from "fs/promises";
import { isAbsolute, join as join3 } from "path";
function repoQueryPaths(root, paths) {
  const out3 = [];
  for (const raw of paths) {
    const p = raw.trim();
    if (p === "") continue;
    if (!isAbsolute(p)) {
      out3.push(normalizeQueryPath(p));
      continue;
    }
    const rel = toRepoPath(root, p);
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) continue;
    out3.push(rel);
  }
  return out3;
}
var BOM = String.fromCharCode(65279);
var DECISIONS = "decisions";
function rewriteRecord(absPath, fn) {
  const raw = readFileSync2(absPath, "utf8");
  const bom = raw.startsWith(BOM) ? BOM : "";
  const rest = raw.slice(bom.length);
  const crlf = rest.includes("\r\n");
  const out3 = fn(rest.replace(/\r\n/g, "\n"));
  writeFileAtomic(absPath, bom + (crlf ? out3.replace(/\n/g, "\r\n") : out3));
}
function readLf(absPath) {
  return readFileSync2(absPath, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
async function decisionEntries(root) {
  try {
    return await readdir(contextPath(root, DECISIONS));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}
async function findAdrFile(root, n) {
  const names = (await decisionEntries(root)).filter((e) => {
    const m = /^(\d{4})-.+\.md$/.exec(e);
    return m?.[1] !== void 0 && Number(m[1]) === n;
  });
  if (names.length === 0) return null;
  if (names.length > 1) {
    throw new BatonError(`ADR ${pad4(n)} has several files: ${names.join(", ")}`);
  }
  return `.context/${DECISIONS}/${names[0]}`;
}
function absOf(root, repoPath) {
  return join3(root, ...repoPath.split("/"));
}
async function assertSupersedable(root, m) {
  const file = await findAdrFile(root, m);
  if (file === null) throw new BatonError(`no ADR ${pad4(m)}`);
  const status = statusOf(readLf(absOf(root, file))) ?? "";
  const kind = statusKind(status);
  if (kind === "superseded" || kind === "rejected") {
    throw new BatonError(`ADR ${pad4(m)} is ${status}; it cannot be superseded`, ExitCode.Blocked);
  }
}
async function markSuperseded(root, m, n) {
  const file = await findAdrFile(root, m);
  if (file === null) throw new BatonError(`no ADR ${pad4(m)}`);
  rewriteRecord(
    absOf(root, file),
    (lf) => setFrontmatterField(lf, "status", JSON.stringify(supersededStatus(n)))
  );
  return file;
}
async function createDecision(root, input) {
  const { status, supersedes } = input;
  const title = input.title.trim();
  if (title === "" || /[\r\n]/.test(title)) {
    throw new BatonError("a decision needs a one-line title");
  }
  if (status === "accepted" && (input.context === void 0 || input.outcome === void 0)) {
    throw new BatonError(
      "an accepted record needs --context and --outcome; create it as proposed and fill it in instead"
    );
  }
  const index = await loadSectionIndex(root, { lenient: true });
  const query = { title, paths: input.paths, specIds: input.specIds };
  if (supersedes !== void 0) query.supersedes = supersedes;
  const report = preflight(index, query);
  if (report.unknownSpecIds.length > 0) {
    throw new BatonError(`unknown spec section(s): ${report.unknownSpecIds.join(", ")}`);
  }
  if (supersedes !== void 0) await assertSupersedable(root, supersedes);
  const dir = contextPath(root, DECISIONS);
  const n = await nextAdrNumber(dir);
  const name = adrFileName(n, title);
  if (!/[\p{Letter}\p{Number}]/u.test(title))
    throw new BatonError("title has no letters or digits");
  const verifiedAt = status === "accepted" ? (await headSha(root))?.slice(0, 12) ?? null : null;
  const date = localDate(input.now ?? /* @__PURE__ */ new Date());
  const text = renderAdr({
    number: n,
    title,
    status,
    date,
    deciders: input.deciders,
    verifiedAt,
    sourcePaths: input.paths,
    specSections: input.specIds,
    ...supersedes === void 0 ? {} : { supersedes },
    ...input.context === void 0 ? {} : { context: input.context },
    considered: input.considered,
    ...input.outcome === void 0 ? {} : { outcome: input.outcome },
    consequences: input.consequences,
    moreInformation: preflightMoreInformation(report)
  });
  mkdirSync(dir, { recursive: true });
  const abs = join3(dir, name);
  const file = `.context/${DECISIONS}/${name}`;
  try {
    writeFileSync(abs, text, { flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new BatonError(`${file} already exists`);
    }
    throw err;
  }
  if (numberTaken(await readdir(dir), n, name)) {
    unlinkSync(abs);
    throw new BatonError(`ADR number ${pad4(n)} was taken concurrently; run decide again`);
  }
  const result = {
    number: n,
    file,
    status,
    report,
    notes: [],
    placeholders: placeholdersIn(text).length > 0
  };
  if (status === "accepted" && supersedes !== void 0) {
    result.superseded = { number: supersedes, file: await markSuperseded(root, supersedes, n) };
  }
  for (const id of input.specIds) {
    const section = index.byId.get(id);
    if (section && isLoadBearing(section)) {
      result.notes.push(
        `spec section ${id} is load-bearing; make its text agree with this decision, then baton verify-doc ${id}`
      );
    }
  }
  return result;
}
async function acceptDecision(root, n) {
  const file = await findAdrFile(root, n);
  if (file === null) throw new BatonError(`no ADR ${pad4(n)}`);
  const abs = absOf(root, file);
  const lf = readLf(abs);
  const status = statusOf(lf) ?? "";
  if (statusKind(status) !== "proposed") {
    throw new BatonError(
      `ADR ${pad4(n)} is ${status || "missing a status"}; only a proposed record can be accepted`,
      ExitCode.Blocked
    );
  }
  const left = placeholdersIn(lf);
  if (left.length > 0) {
    throw new BatonError(
      `ADR ${pad4(n)} still has template placeholders (${left.join(", ")}); fill them in first`,
      ExitCode.Blocked
    );
  }
  const m = adrNumberFrom(String(parseFrontmatter(lf).data.supersedes ?? ""));
  if (m !== null) await assertSupersedable(root, m);
  const head = await headSha(root);
  rewriteRecord(abs, (text) => {
    const accepted = setFrontmatterField(text, "status", "accepted");
    return head === null ? accepted : setFrontmatterField(accepted, "verified_at", JSON.stringify(head.slice(0, 12)));
  });
  const result = { number: n, file };
  if (m !== null) result.superseded = { number: m, file: await markSuperseded(root, m, n) };
  return result;
}
async function listDecisions(root) {
  const index = await loadSectionIndex(root, { lenient: true });
  return index.sections.filter((s) => s.doc === "decision" && s.adr !== void 0).sort((a, b) => (a.adr?.number ?? 0) - (b.adr?.number ?? 0)).map((s) => {
    const adr = s.adr;
    const by = s.meta.supersededBy;
    const listed = {
      number: adr?.number ?? 0,
      status: by !== void 0 && statusKind(adr?.status ?? "") !== "superseded" ? `${adr?.status ?? ""}, superseded by ${by}` : adr?.status ?? "",
      title: s.title,
      file: s.file
    };
    const sup = adr?.supersedes === void 0 ? null : adrNumberFrom(adr.supersedes);
    if (sup !== null) listed.supersedes = sup;
    return listed;
  });
}
async function runPreflight(root, q) {
  return preflight(await loadSectionIndex(root, { lenient: true }), q);
}

// src/commands/decide.ts
var collect = (v, prev) => [...prev, v];
var csv = (v) => v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
function supersededLine(n, s) {
  return s ? [`marked ADR ${pad4(s.number)} superseded by ADR ${pad4(n)}`] : [];
}
function out(lines) {
  process.stdout.write(`${lines.join("\n")}
`);
}
function registerDecide(program2) {
  program2.command("decide").description("create, accept, supersede, list or preflight-check decision records").argument("[title]", "decision title").option("--preflight", "check for conflicts only; write nothing (exit 2 when constrained)").option("--supersedes <adr>", "ADR number this decision replaces").option("--status <status>", "proposed (default) or accepted").option("--accept <adr>", "mark an existing proposed ADR as accepted").option("--spec <ids>", "comma-separated spec section ids this decision constrains").option("--paths <globs>", "comma-separated source paths or globs this decision covers").option("--context <text>", "context and problem statement (one line)").option("--considered <text>", "a considered option (repeatable)", collect, []).option("--outcome <text>", "the chosen option and why (one line)").option("--consequence <text>", "a consequence (repeatable)", collect, []).option("--deciders <names>", "comma-separated decision-makers (default: you)").action(
    action(async (title, o) => {
      const root = await projectRoot();
      requireContext(root);
      if (o.status !== void 0 && o.status !== "proposed" && o.status !== "accepted") {
        throw new BatonError(`--status must be proposed or accepted, got "${o.status}"`);
      }
      const status = o.status === "accepted" ? "accepted" : "proposed";
      const supersedes = o.supersedes === void 0 ? void 0 : parseAdrRef(o.supersedes);
      const specIds = csv(o.spec);
      const paths = repoQueryPaths(root, csv(o.paths));
      if (o.accept !== void 0) {
        if (title !== void 0 || o.preflight || o.supersedes !== void 0) {
          throw new BatonError("--accept takes no title and no other mode");
        }
        const n = parseAdrRef(o.accept);
        const r = await acceptDecision(root, n);
        out([
          `accepted ADR ${pad4(r.number)}: ${r.file}`,
          ...supersededLine(r.number, r.superseded)
        ]);
        return;
      }
      if (o.preflight) {
        if (title === void 0 && paths.length === 0 && specIds.length === 0) {
          throw new BatonError("preflight needs a title, --paths or --spec");
        }
        const q = { paths, specIds };
        if (title !== void 0) q.title = title;
        if (supersedes !== void 0) q.supersedes = supersedes;
        const report = await runPreflight(root, q);
        out([renderPreflight(report)]);
        const c = report.counts.constrains;
        if (c > 0) {
          throw new BatonError(
            `${c} accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding (supersede with --supersedes when it replaces one)`,
            ExitCode.Blocked
          );
        }
        return;
      }
      if (title !== void 0) {
        const input = {
          title,
          status,
          specIds,
          paths,
          considered: o.considered,
          consequences: o.consequence,
          deciders: csv(o.deciders).length > 0 ? csv(o.deciders) : [resolveActor(root)]
        };
        if (supersedes !== void 0) input.supersedes = supersedes;
        if (o.context !== void 0) input.context = o.context;
        if (o.outcome !== void 0) input.outcome = o.outcome;
        const r = await createDecision(root, input);
        out([
          `created ADR ${pad4(r.number)} (${r.status}): ${r.file}`,
          renderPreflight(r.report),
          ...r.notes.map((note) => `note: ${note}`),
          ...supersededLine(r.number, r.superseded),
          ...r.placeholders ? [
            `next: replace the {\u2026} placeholders in the body, then run baton decide --accept ${pad4(r.number)}`
          ] : []
        ]);
        return;
      }
      const given = o.supersedes !== void 0 || o.status !== void 0 || o.spec !== void 0 || o.paths !== void 0 || o.context !== void 0 || o.outcome !== void 0 || o.deciders !== void 0 || o.considered.length > 0 || o.consequence.length > 0;
      if (given) throw new BatonError("a decision needs a title");
      const rows = await listDecisions(root);
      if (rows.length === 0) {
        out(["no decisions yet"]);
        return;
      }
      out(
        rows.map(
          (r) => `${pad4(r.number)}  ${r.status}  ${r.title}${r.supersedes === void 0 ? "" : `  (supersedes ${pad4(r.supersedes)})`}`
        )
      );
    })
  );
}

// src/core/verify-doc.ts
import { readFileSync as readFileSync3 } from "fs";
import { join as join4 } from "path";
var STAMP_LENGTH = 12;
var BOM2 = "\uFEFF";
var MARKER_LINE_RE = /^(\s*<!--\s*baton:\s*)(\{[\s\S]*\})(\s*-->\s*)$/;
var VERIFIED_VALUE_RE = /(\bverified_at\s*:\s*)("[^"]*"|'[^']*'|[^,}]*?)(\s*[,}])/;
function stampMarkerLine(line, sha) {
  const m = MARKER_LINE_RE.exec(line);
  if (!m) throw new Error(`not a baton marker line: ${line}`);
  const [, open = "", mapping = "", close = ""] = m;
  const stamped = /\bverified_at\s*:/.test(mapping) ? mapping.replace(
    VERIFIED_VALUE_RE,
    (_all, key, _old, end) => `${key}"${sha}"${end}`
  ) : `${mapping.slice(0, -1)}, verified_at: "${sha}"}`;
  return `${open}${stamped}${close}`;
}
function stampFrontmatter(text, sha) {
  const m = /^---\n(?:([\s\S]*?)\n)?---(?=\n|$)/.exec(text);
  if (!m) throw new Error("no frontmatter to stamp");
  const block = m[1] ?? "";
  const stamp = `verified_at: "${sha}"`;
  let next;
  if (/^verified_at:.*$/m.test(block)) {
    next = block.replace(/^verified_at:.*$/m, stamp);
  } else {
    const fm = block === "" ? [] : block.split("\n");
    const kindAt = fm.findIndex((l) => /^kind:/.test(l));
    fm.splice(kindAt === -1 ? fm.length : kindAt + 1, 0, stamp);
    next = fm.join("\n");
  }
  return `---
${next}
---${text.slice(m[0].length)}`;
}
async function stampSections(root, ids, sha) {
  const unique = [...new Set(ids)];
  const index = await loadSectionIndex(root);
  const unknown = unique.filter((id) => !index.byId.has(id));
  if (unknown.length > 0) throw new BatonError(`no section(s): ${unknown.join(", ")}`);
  const byFile = /* @__PURE__ */ new Map();
  const stamps = [];
  for (const id of unique) {
    const section = index.byId.get(id);
    byFile.set(section.file, [...byFile.get(section.file) ?? [], section]);
    stamps.push({ id, file: section.file, previous: section.meta.verifiedAt });
  }
  for (const [file, sections] of byFile) {
    const abs = join4(root, ...file.split("/"));
    const raw = readFileSync3(abs, "utf8");
    const bom = raw.startsWith(BOM2) ? BOM2 : "";
    const rest = raw.slice(bom.length);
    const eol = rest.includes("\r\n") ? "\r\n" : "\n";
    let lines = rest.split(/\r?\n/);
    for (const section of sections) {
      if (section.doc === "rules" || section.doc === "spec") {
        lines[section.line] = stampMarkerLine(lines[section.line] ?? "", sha);
      } else {
        lines = stampFrontmatter(lines.join("\n"), sha).split("\n");
      }
    }
    writeFileAtomic(abs, bom + lines.join(eol));
  }
  const after = await loadSectionIndex(root);
  for (const { id } of stamps) {
    if (after.byId.get(id)?.meta.verifiedAt !== sha) {
      throw new Error(`verify-doc: stamp did not round-trip for ${id}`);
    }
  }
  return stamps;
}
function uncommittedSources(statusLines2, sourcePaths) {
  return statusLines2.map(porcelainPath).filter((p) => matchesAny(p, sourcePaths));
}

// src/commands/drift.ts
function registerDrift(program2) {
  program2.command("drift").description("report fresh / aging / stale / superseded sections").addOption(
    new Option("--format <fmt>", "output format").choices(["text", "json"]).default("text")
  ).addOption(
    new Option("--fail-on <level>", "exit 2 if any section is at this level or worse").choices([
      "aging",
      "stale"
    ])
  ).action(
    action(async (opts) => {
      const root = await projectRoot();
      requireContext(root);
      const config = await loadConfig(root);
      const index = await loadSectionIndex(root);
      const report = await evaluateFreshness(index, config);
      process.stdout.write(
        opts.format === "json" ? `${JSON.stringify(driftJson(report), null, 2)}
` : renderDriftText(report)
      );
      try {
        await appendDriftLog(root, flagEvents(report, (/* @__PURE__ */ new Date()).toISOString()));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`baton: could not write drift log: ${message}
`);
      }
      if (opts.failOn !== void 0) {
        const failing = failingSections(report, opts.failOn);
        if (failing.length > 0) {
          const ids = failing.map((s) => s.section.meta.id);
          throw new BatonError(
            `${failing.length} section(s) at or beyond ${opts.failOn}: ${ids.join(", ")}`,
            ExitCode.Blocked
          );
        }
      }
    })
  );
  program2.command("verify-doc").description("mark sections as re-verified at HEAD (bumps verified_at)").argument("<section-ids...>", "section ids to stamp").action(
    action(async (ids) => {
      const root = await projectRoot();
      requireContext(root);
      const head = await headSha(root);
      if (head === null) {
        throw new BatonError("no commits yet; make a first commit before verify-doc");
      }
      const sha = head.slice(0, STAMP_LENGTH);
      const before = await loadSectionIndex(root);
      const stamps = await stampSections(root, ids, sha);
      for (const s of stamps) process.stdout.write(`verified ${s.id} at ${sha} (${s.file})
`);
      const status = await statusLines(root);
      for (const { id } of stamps) {
        const paths = uncommittedSources(status, before.byId.get(id)?.meta.sourcePaths ?? []);
        if (paths.length > 0) {
          process.stderr.write(
            `note: ${id}: uncommitted changes in ${paths.join(", ")} keep it aging until committed and re-verified
`
          );
        }
      }
      const ts = (/* @__PURE__ */ new Date()).toISOString();
      try {
        await appendDriftLog(
          root,
          stamps.map(({ id }) => ({
            v: 1,
            ts,
            event: "verified",
            head: sha,
            id,
            bodyHash: bodyHash(before.byId.get(id)?.body ?? "")
          }))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`baton: could not write drift log: ${message}
`);
      }
    })
  );
}

// src/commands/explain.ts
import nodePath from "path";

// src/core/explain/facts.ts
import { extname } from "path";

// src/core/explain/targets.ts
import { readdir as readdir2, readFile } from "fs/promises";
import { join as join5 } from "path";

// src/core/explain/match.ts
function toKey(s) {
  return s.normalize("NFKD").replace(new RegExp("\\p{M}+", "gu"), "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
function editDistance2(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    prev = row;
  }
  return prev[b.length];
}
var MAX_SUGGESTIONS = 3;
var MIN_FUZZY_KEY = 3;
function distanceTo(q, target) {
  let best = Number.POSITIVE_INFINITY;
  for (const key of target.keys) {
    if (key.length < MIN_FUZZY_KEY) continue;
    best = Math.min(best, editDistance2(q, key));
  }
  return best;
}
function matchTargets(query, targets) {
  const q = toKey(query);
  const exact = targets.filter((t) => t.keys.includes(q));
  if (exact.length > 0) {
    const files = exact.filter((t) => t.kind === "file");
    const others = exact.filter((t) => t.kind !== "file");
    const byPath = files.filter((f) => toKey(f.name) === q);
    if (byPath.length === 1) return { status: "exact", matches: [...others, ...byPath] };
    if (others.length > 0) return { status: "exact", matches: others };
    if (files.length > 1 && new Set(files.map((f) => f.name)).size > 1) {
      return { status: "tie", candidates: files };
    }
    return { status: "exact", matches: exact };
  }
  const scored = targets.map((target) => ({ target, distance: distanceTo(q, target) }));
  const threshold = Math.min(3, Math.max(1, Math.floor(q.length / 3)));
  const minDistance = scored.reduce((m, s) => Math.min(m, s.distance), Number.POSITIVE_INFINITY);
  if (minDistance <= threshold) {
    const best = scored.filter((s) => s.distance === minDistance).map((s) => s.target);
    const groups = new Set(best.map((t) => toKey(t.name)));
    return groups.size === 1 ? { status: "closest", matches: best } : { status: "tie", candidates: best };
  }
  const farthest = Math.max(3, Math.floor(q.length / 2));
  const suggestions = [];
  const seen = /* @__PURE__ */ new Set();
  for (const { target, distance } of [...scored].sort((a, b) => a.distance - b.distance)) {
    if (distance > farthest) break;
    const name = toKey(target.name);
    if (seen.has(name)) continue;
    seen.add(name);
    suggestions.push(target);
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return { status: "none", suggestions };
}

// src/core/explain/targets.ts
var WALK_SKIP = /* @__PURE__ */ new Set([".git", "node_modules", "dist"]);
var CACHE_DIR = `${CONTEXT_DIR}/${ContextPaths.cache}`;
async function buildIndex(root, opts = {}) {
  const skipped = [];
  const files = await listFiles(root, skipped, opts.maxFiles ?? MAX_INDEXED_FILES);
  const index = await loadSectionIndex(root, { lenient: true });
  skipped.push(
    ...index.problems.map((p) => ({ file: p.file, error: p.message.split("\n")[0] ?? p.message }))
  );
  const contextSections = index.sections.filter(
    (s) => s.doc === "rules" || s.doc === "spec" || s.doc === "knowledge"
  );
  const decisions = index.sections.filter((s) => s.doc === "decision").map((s) => ({ section: s, specSections: s.adr?.specSections ?? [] }));
  const targets = [
    ...fileTargets(files),
    ...await dependencyTargets(root, skipped),
    ...[...contextSections, ...decisions.map((d) => d.section)].map(sectionTarget)
  ];
  for (const file of files) {
    const isDoc = file.startsWith("docs/") && file.endsWith(".md");
    const hasDiagrams = isDoc || file === "README.md" || isContextMarkdown(file);
    if (!hasDiagrams) continue;
    const lines = await readLines(root, file);
    if (!lines) continue;
    if (isDoc) targets.push(...headingTargets(file, lines));
    targets.push(...mermaidTargets(file, lines));
  }
  return { root, files, contextSections, decisions, targets, skipped };
}
function firstLine(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0]?.trim() || "unreadable";
}
function skip(skipped, file, err) {
  skipped.push({ file, error: firstLine(err) });
}
function keysOf(...names) {
  return [...new Set(names.map(toKey).filter((k) => k !== ""))];
}
function normalize(text) {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
async function readText(root, repoPath) {
  try {
    return normalize(await readFile(join5(root, repoPath), "utf8"));
  } catch {
    return null;
  }
}
async function readLines(root, repoPath) {
  const text = await readText(root, repoPath);
  return text === null ? null : text.split("\n");
}
function isContextMarkdown(file) {
  return file.startsWith(`${CONTEXT_DIR}/`) && !file.startsWith(`${CACHE_DIR}/`) && file.endsWith(".md");
}
var MAX_INDEXED_FILES = 5e4;
async function listFiles(root, skipped, maxFiles) {
  let files = null;
  if (await isGitRepo(root)) {
    try {
      const listed = await git(
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        root
      );
      const deleted = new Set((await git(["ls-files", "--deleted", "-z"], root)).split("\0"));
      files = [...new Set(listed.split("\0").filter((f) => f !== "" && !deleted.has(f)))];
      if (files.length === 0) files = null;
    } catch (err) {
      skip(skipped, "<root>", new Error(`git ls-files failed: ${firstLine(err)}`));
      return [];
    }
  }
  files ??= await walk(root, maxFiles + 1);
  files.sort();
  if (files.length > maxFiles) {
    files.length = maxFiles;
    skipped.push({ file: "<root>", error: `file list truncated at ${maxFiles} files` });
  }
  return files;
}
async function walk(root, limit) {
  const found = [];
  const pending = [root];
  while (pending.length > 0 && found.length < limit) {
    const dir = pending.pop();
    let entries;
    try {
      entries = await readdir2(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join5(dir, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP.has(entry.name) || toRepoPath(root, abs) === CACHE_DIR) continue;
        pending.push(abs);
      } else if (entry.isFile()) {
        found.push(toRepoPath(root, abs));
      }
    }
  }
  return found;
}
function fileTargets(files) {
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const entry = (path2, isDir) => ({
    kind: "file",
    name: path2,
    keys: keysOf(path2, path2.slice(path2.lastIndexOf("/") + 1)),
    source: path2,
    line: 1,
    isDir
  });
  return [...[...dirs].sort().map((d) => entry(d, true)), ...files.map((f) => entry(f, false))];
}
async function dependencyTargets(root, skipped) {
  const text = await readText(root, "package.json");
  if (text === null) return [];
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (err) {
    skip(skipped, "package.json", err);
    return [];
  }
  if (typeof pkg !== "object" || pkg === null) {
    skip(skipped, "package.json", new Error("package.json must be a JSON object"));
    return [];
  }
  const lines = text.split("\n");
  const out3 = [];
  for (const [field, dev] of [
    ["dependencies", false],
    ["devDependencies", true]
  ]) {
    const block = pkg[field];
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const blockStart = lines.findIndex((l) => l.trimStart().startsWith(`"${field}"`));
    for (const [name, version] of Object.entries(block)) {
      if (typeof version !== "string") continue;
      const at = lines.findIndex(
        (l, i) => i > blockStart && l.trimStart().startsWith(`${JSON.stringify(name)}:`)
      );
      out3.push({
        kind: "dependency",
        name,
        keys: keysOf(name),
        source: "package.json",
        line: blockStart < 0 || at < 0 ? 1 : at + 1,
        version,
        dev
      });
    }
  }
  return out3;
}
function sectionTarget(section) {
  return {
    kind: "section",
    name: section.title,
    keys: keysOf(section.meta.id, section.title),
    source: section.file,
    line: section.line,
    section
  };
}
var HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
function headingTargets(file, lines) {
  const fenced = fencedLines(lines);
  let first = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) first = end + 1;
  }
  const found = [];
  for (let i = first; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = HEADING_RE.exec(lines[i] ?? "");
    if (m) found.push({ index: i, level: (m[1] ?? "#").length, title: m[2] ?? "" });
  }
  return found.map((h, n) => {
    const next = found.slice(n + 1).find((o) => o.level <= h.level);
    const end = next ? next.index : lines.length;
    return {
      kind: "heading",
      name: h.title,
      keys: keysOf(h.title),
      source: file,
      line: h.index + 1,
      level: h.level,
      body: lines.slice(h.index + 1, end).join("\n").trim()
    };
  });
}
var ID = "[A-Za-z_][A-Za-z0-9_]*";
var quoted = (close) => `("[^"]*"|[^${close}]*)`;
var NODE_RE = new RegExp(
  `(${ID})(?:\\(\\(("[^"]*"|.*?)\\)\\)|\\[${quoted("\\]")}\\]|\\(${quoted("\\)")}\\)|\\{${quoted("\\}")}\\}|>${quoted("\\]")}\\])?`,
  "y"
);
var ARROW_RE = /(?:-\.+-+>?|-{2,}>|-{3,}|={2,}>|(?:--|==|-\.)\s+.+?\s+(?:-{2,}>|-{3,}|={2,}>|\.+-+>?))(?:\s*\|[^|]*\|)?/y;
var IGNORED_LINE_RE = /^(?:graph|flowchart|subgraph|end|classDef|class|style|linkStyle|click|direction)\b/;
function cleanLabel(raw) {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}
function mermaidTargets(file, lines) {
  const targets = [];
  for (const fence of findFences(lines)) {
    if (!/^mermaid\b/i.test(fence.info)) continue;
    const body = lines.slice(fence.open + 1, fence.close);
    const header = body.find((l) => l.trim() !== "" && !l.trim().startsWith("%%"));
    if (!header || !/^\s*(?:graph|flowchart)\b/.test(header)) continue;
    targets.push(...diagramTargets(file, body, fence.open + 2));
  }
  return targets;
}
function diagramTargets(file, body, firstLine2) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const touch = (id, label, line) => {
    const node = nodes.get(id);
    if (!node) nodes.set(id, { id, label, line });
    else if (label !== null && node.label === null) {
      node.label = label;
      node.line = line;
    }
  };
  body.forEach((raw, i) => {
    const line = firstLine2 + i;
    const code = raw.replace(/%%.*$/, "").trim();
    if (code === "" || IGNORED_LINE_RE.test(code)) return;
    for (const stmt of code.split(";")) parseStatement(stmt.trim(), line, touch, edges);
  });
  const labelOf = (id) => nodes.get(id)?.label ?? id;
  return [...nodes.values()].map((n) => {
    const label = labelOf(n.id);
    const neighbours = (pick) => [
      ...new Set(
        edges.map(pick).filter((x) => x !== null).map(labelOf)
      )
    ];
    return {
      kind: "mermaid",
      name: label,
      keys: keysOf(label, n.id),
      source: file,
      line: n.line,
      nodeId: n.id,
      edgesOut: neighbours(([from, to]) => from === n.id ? to : null),
      edgesIn: neighbours(([from, to]) => to === n.id ? from : null)
    };
  });
}
function parseStatement(stmt, line, touch, edges) {
  let pos = 0;
  const skipWs = () => {
    while (stmt[pos] === " " || stmt[pos] === "	") pos++;
  };
  const node = () => {
    NODE_RE.lastIndex = pos;
    const m = NODE_RE.exec(stmt);
    if (!m) return null;
    pos = NODE_RE.lastIndex;
    const raw = m.slice(2, 7).find((g) => g !== void 0);
    const id = m[1] ?? "";
    touch(id, raw === void 0 ? null : cleanLabel(raw), line);
    return id;
  };
  const group = () => {
    skipWs();
    const first = node();
    if (first === null) return null;
    const ids = [first];
    for (; ; ) {
      skipWs();
      if (stmt[pos] !== "&") return ids;
      pos++;
      skipWs();
      const next = node();
      if (next === null) return ids;
      ids.push(next);
    }
  };
  let left = group();
  while (left) {
    skipWs();
    ARROW_RE.lastIndex = pos;
    if (!ARROW_RE.exec(stmt)) return;
    pos = ARROW_RE.lastIndex;
    const right = group();
    if (!right) return;
    for (const from of left) for (const to of right) edges.push([from, to]);
    left = right;
  }
}

// src/core/explain/facts.ts
var FACT_TEXT_MAX = 1200;
var MAX_FACTS = 20;
var MAX_LISTED = 10;
var LABEL_ORDER = [
  "section",
  "decision",
  "doc",
  "package",
  "diagram",
  "layout",
  "source",
  "import"
];
var HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);
async function collectFacts(index, targets, config) {
  const ctx = new Collector(index, config);
  const all = [];
  for (const target of targets) all.push(...await ctx.factsFor(target));
  const seen = /* @__PURE__ */ new Set();
  const unique = all.filter((f) => {
    const key = `${f.label}\0${f.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const facts = unique.map((f) => ({ ...f, text: truncate(f.text) }));
  const noRecordedReason = !facts.some((f) => f.label === "section" || f.label === "decision");
  const ranked = LABEL_ORDER.flatMap((label) => facts.filter((f) => f.label === label));
  return { facts: ranked.slice(0, MAX_FACTS), noRecordedReason };
}
function truncate(text) {
  return text.length > FACT_TEXT_MAX ? `${text.slice(0, FACT_TEXT_MAX)}\u2026` : text;
}
var BOUNDARY = "`\"'()\\[\\],.:;";
function mentions(text, name, strictCase = false) {
  if (name === "") return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edge = `[^\\s${BOUNDARY}]`;
  const token = (flags) => new RegExp(`(?<!${edge})${escaped}(?!${edge})`, flags);
  if (!strictCase) return token("i").test(text);
  return token("").test(text) || new RegExp(`([\`"'])${escaped}\\1`, "i").test(text);
}
function basename(path2) {
  return path2.slice(path2.lastIndexOf("/") + 1);
}
var Collector = class {
  constructor(index, config) {
    this.index = index;
    this.config = config;
  }
  index;
  config;
  lineCache = /* @__PURE__ */ new Map();
  freshness;
  async factsFor(target) {
    switch (target.kind) {
      case "dependency":
        return [
          ...await this.packageFact(target),
          ...await this.importFacts(target.name),
          ...await this.mentionFacts(target.name, () => false, true)
        ];
      case "section":
        return [
          await this.sectionFact(target.section, this.isDecision(target.section)),
          ...await this.citingDecisions(target.section.meta.id),
          ...this.sourceFact(target.section)
        ];
      case "heading":
        return [
          ...docFact(target.source, target.line, target.body),
          ...await this.mentionFacts(target.name, () => false)
        ];
      case "file":
        return [
          ...await this.layoutFacts(basename(target.name)),
          ...await this.mentionFacts(target.name, (paths) => this.touches(target, paths))
        ];
      case "mermaid":
        return [
          diagramFact(target),
          ...await this.enclosingDoc(target),
          ...await this.mentionFacts(target.name, () => false)
        ];
    }
  }
  // ------------------------------------------------------------ provenance
  /**
   * Labels come from the same `evaluateFreshness` that `drift` and `mission` use
   * (ADR 0013), run once per collection, lazily, over the index's own sections.
   */
  async provenance(section) {
    const key = (s) => `${s.file}\0${s.meta.id}`;
    this.freshness ??= evaluateFreshness(
      {
        root: this.index.root,
        sections: [...this.index.contextSections, ...this.index.decisions.map((d) => d.section)]
      },
      this.config
    ).then((r) => new Map(r.sections.map((f) => [key(f.section), f.result.level]))).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      skip(
        this.index.skipped,
        "<root>",
        new Error(`freshness unavailable: ${message.split("\n")[0]?.trim() || "unknown error"}`)
      );
      return /* @__PURE__ */ new Map();
    });
    return (await this.freshness).get(key(section)) ?? classifyFreshness({ meta: section.meta, commitsSince: 0 }, this.config.freshness.staleAfter).level;
  }
  isDecision(section) {
    return this.index.decisions.some((d) => d.section === section);
  }
  async sectionFact(section, asDecision) {
    return {
      label: asDecision ? "decision" : "section",
      source: `${section.file}:${section.line}`,
      text: section.body || section.title,
      provenance: await this.provenance(section)
    };
  }
  // -------------------------------------------------------------- dependency
  async packageFact(target) {
    const line = (await this.lines(target.source))?.[target.line - 1];
    if (line === void 0) return [];
    return [
      {
        label: "package",
        source: `${target.source}:${target.line}`,
        text: line.trim(),
        provenance: "no provenance"
      }
    ];
  }
  async importFacts(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:\\bfrom\\s*|\\brequire\\(\\s*|\\bimport\\(\\s*)(["'])${escaped}(?:/[^"']*)?\\1`
    );
    const facts = [];
    for (const file of this.index.files) {
      if (facts.length >= MAX_LISTED) break;
      if (!SOURCE_EXTENSIONS.has(extname(file))) continue;
      const lines = await this.lines(file);
      const at = lines?.findIndex((l) => re.test(l)) ?? -1;
      if (lines && at >= 0) {
        facts.push({
          label: "import",
          source: `${file}:${at + 1}`,
          text: (lines[at] ?? "").trim(),
          provenance: "no provenance"
        });
      }
    }
    return facts;
  }
  // ------------------------------------------------------------------ section
  async citingDecisions(id) {
    const facts = [];
    for (const d of this.index.decisions) {
      if (d.specSections.includes(id)) facts.push(await this.sectionFact(d.section, true));
    }
    return facts;
  }
  sourceFact(section) {
    const matched = this.index.files.filter((f) => matchesAny(f, section.meta.sourcePaths));
    if (matched.length === 0) return [];
    const listed = matched.slice(0, MAX_LISTED).join(", ");
    const more = matched.length > MAX_LISTED ? ` (+${matched.length - MAX_LISTED} more)` : "";
    return [
      {
        label: "source",
        source: `${section.file}:${section.line}`,
        text: `${listed}${more}`,
        provenance: "no provenance"
      }
    ];
  }
  // --------------------------------------------------------------------- file
  /** Lines of non-mermaid fenced blocks in docs/**\/*.md that start with `base` or `base/`. */
  async layoutFacts(base) {
    const facts = [];
    for (const file of this.index.files) {
      if (!matchesAny(file, ["docs/**/*.md"])) continue;
      const lines = await this.lines(file);
      if (!lines) continue;
      for (const fence of findFences(lines)) {
        if (/^mermaid\b/i.test(fence.info)) continue;
        for (let i = fence.open + 1; i < fence.close; i++) {
          const line = lines[i] ?? "";
          const first = line.trim().split(/\s+/)[0];
          if (first === base || first === `${base}/`) {
            facts.push({
              label: "layout",
              source: `${file}:${i + 1}`,
              text: line.trim(),
              provenance: "no provenance"
            });
          }
        }
      }
    }
    return facts;
  }
  /** Whether a file (or any file under a directory) matches one of the source-path globs. */
  touches(target, globs) {
    if (globs.length === 0) return false;
    if (!target.isDir) return matchesAny(target.name, globs);
    const prefix = `${target.name}/`;
    return this.index.files.some((f) => f.startsWith(prefix) && matchesAny(f, globs));
  }
  // ------------------------------------------------------------------ mermaid
  /**
   * What encloses the diagram's fence. In `.context/` files that is the section
   * the fence sits in (with its freshness, never "no provenance"); elsewhere it
   * is the body of the nearest heading above, read with the index's own heading
   * parser so README and docs agree.
   */
  async enclosingDoc(target) {
    if (target.source.startsWith(`${CONTEXT_DIR}/`)) {
      const candidates = [
        ...this.index.contextSections,
        ...this.index.decisions.map((d) => d.section)
      ].filter((s) => s.file === target.source && s.line <= target.line).sort((a, b) => b.line - a.line);
      for (const s of candidates) {
        if (await this.spanReaches(s, target.line)) {
          return [await this.sectionFact(s, this.isDecision(s))];
        }
      }
      return [];
    }
    const lines = await this.lines(target.source);
    if (!lines) return [];
    let best = null;
    for (const t of headingTargets(target.source, lines)) {
      if (t.kind !== "heading" || t.line > target.line) continue;
      if (!best || t.line > best.line) best = t;
    }
    return best ? docFact(best.source, best.line, best.body) : [];
  }
  /**
   * Whether `section` still covers `line`. A marked section in a multi-section
   * file ends at the next heading of the same or higher level (marked or not),
   * so a diagram under a later unmarked heading is not part of it. Whole-file
   * sections (no heading at their line) cover the entire file.
   */
  async spanReaches(section, line) {
    const lines = await this.lines(section.file);
    if (!lines) return false;
    const own = HEADING_LINE.exec(lines[section.line - 1] ?? "");
    if (!own) return true;
    const level = (own[1] ?? "#").length;
    const fenced = fencedLines(lines);
    for (let i = section.line; i < line - 1; i++) {
      if (fenced[i]) continue;
      const h = HEADING_LINE.exec(lines[i] ?? "");
      if (h && (h[1] ?? "#").length <= level) return false;
    }
    return true;
  }
  // ------------------------------------------------------------------ shared
  /**
   * Decisions, then context sections, whose text mentions `name` (or, when
   * `byPath` says so, whose source paths cover the target).
   */
  async mentionFacts(name, byPath, strictCase = false) {
    const hit = (s) => mentions(`${s.title}
${s.body}`, name, strictCase) || byPath(s.meta.sourcePaths);
    const facts = [];
    for (const d of this.index.decisions) {
      if (hit(d.section)) facts.push(await this.sectionFact(d.section, true));
    }
    for (const s of this.index.contextSections) {
      if (hit(s)) facts.push(await this.sectionFact(s, false));
    }
    return facts;
  }
  async lines(repoPath) {
    if (!this.lineCache.has(repoPath)) {
      this.lineCache.set(repoPath, await readLines(this.index.root, repoPath));
    }
    return this.lineCache.get(repoPath) ?? null;
  }
};
function docFact(source, line, body) {
  if (body === "") return [];
  return [{ label: "doc", source: `${source}:${line}`, text: body, provenance: "no provenance" }];
}
function diagramFact(target) {
  const list2 = (names) => names.length > 0 ? names.join(", ") : "none";
  return {
    label: "diagram",
    source: `${target.source}:${target.line}`,
    text: `${target.name}: in \u2190 ${list2(target.edgesIn)}; out \u2192 ${list2(target.edgesOut)}`,
    provenance: "no provenance"
  };
}

// src/core/explain/templates.ts
var import_yaml = __toESM(require_dist(), 1);
import { mkdir, readdir as readdir3, readFile as readFile2, unlink, writeFile } from "fs/promises";
import { join as join6 } from "path";
var DEFAULT_TEMPLATE = "student";
var MAX_DESCRIPTION = 80;
var NO_REASON = "If the repo records no reason for something, say so plainly instead of guessing one.";
function builtin(name, description, prompt) {
  return { name, description, prompt, source: "builtin" };
}
var BUILTIN_TEMPLATES = [
  builtin(
    "caveman",
    "Tiny words, short sentences, no jargon.",
    `Explain like a caveman: tiny words, short sentences, no jargon. ${NO_REASON}`
  ),
  builtin(
    "baby",
    "Everyday analogies, as if to a small child.",
    `Explain as if to a small child, using analogies from everyday life. ${NO_REASON}`
  ),
  builtin(
    "student",
    "Plain language for a curious beginner; terms defined on first use.",
    `Explain to a curious beginner: plain language, and define every term the first time you use it. ${NO_REASON}`
  ),
  builtin(
    "engineer",
    "Technical and precise, naming the files and interfaces involved.",
    `Explain to an engineer: technical and precise, naming the files and interfaces involved. ${NO_REASON}`
  ),
  builtin(
    "pitch",
    "A 30-second spoken pitch: the problem, then why the solution impresses.",
    `Explain as a spoken pitch of about 30 seconds (about 75 words): state the problem first, then why the solution is impressive. ${NO_REASON}`
  )
];
function templateDirs(root, home) {
  return { project: join6(root, ".context", "explain"), personal: join6(home, ".baton", "explain") };
}
function describe(prompt) {
  const first = prompt.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return first.trim().slice(0, MAX_DESCRIPTION);
}
async function readDir(dir, source) {
  let files;
  try {
    files = await readdir3(dir);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const out3 = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".md")) continue;
    const name = toKey(file.slice(0, -".md".length));
    if (name === "") continue;
    const path2 = join6(dir, file);
    let parsed;
    try {
      parsed = parseFrontmatter(await readFile2(path2, "utf8"));
    } catch (e) {
      throw new BatonError(`${path2}: cannot read template: ${e.message}`);
    }
    const prompt = parsed.body.replace(/\r\n/g, "\n").trim();
    if (prompt === "") throw new BatonError(`${path2}: template has an empty prompt`);
    const description = typeof parsed.data.description === "string" && parsed.data.description.trim() !== "" ? parsed.data.description.trim() : describe(prompt);
    out3.push({ name, description, prompt, source });
  }
  return out3;
}
async function listTemplates(dirs) {
  const byName = /* @__PURE__ */ new Map();
  const layers = [
    BUILTIN_TEMPLATES,
    await readDir(dirs.personal, "personal"),
    await readDir(dirs.project, "project")
  ];
  for (const layer of layers) for (const t of layer) byName.set(t.name, t);
  return [...byName.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
async function resolveTemplate(dirs, name) {
  const key = toKey(name);
  const all = await listTemplates(dirs);
  const hit = all.find((t) => t.name === key);
  if (!hit) {
    throw new BatonError(
      `unknown template "${name}"; available: ${all.map((t) => t.name).join(", ")}`
    );
  }
  return hit;
}
function scopeDirs(dirs, scope) {
  if (scope === "project") return [dirs.project];
  if (scope === "personal") return [dirs.personal];
  return [dirs.project, dirs.personal];
}
async function exists(path2) {
  try {
    await readFile2(path2);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
async function createTemplate(dirs, name, prompt, opts) {
  const key = toKey(name);
  if (key === "") throw new BatonError(`template name "${name}" has no letters or numbers`);
  const body = prompt.replace(/\r\n/g, "\n").trim();
  if (body === "") throw new BatonError("template prompt is empty");
  const targets = scopeDirs(dirs, opts.scope).map((dir) => ({ dir, path: join6(dir, `${key}.md`) }));
  if (!opts.force) {
    for (const { path: path2 } of targets) {
      if (await exists(path2)) {
        throw new BatonError(`${path2} already exists; pass --force to overwrite`, ExitCode.Blocked);
      }
    }
  }
  const frontmatter = (0, import_yaml.stringify)({ name: key, description: describe(body) }).trimEnd();
  const text = `---
${frontmatter}
---
${body}
`;
  for (const { dir, path: path2 } of targets) {
    await mkdir(dir, { recursive: true });
    await writeFile(path2, text, "utf8");
  }
  return targets.map((t) => t.path);
}
async function deleteTemplate(dirs, name, scope) {
  const key = toKey(name);
  const removed = [];
  for (const dir of scopeDirs(dirs, scope)) {
    const path2 = join6(dir, `${key}.md`);
    try {
      await unlink(path2);
      removed.push(path2);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (removed.length > 0) return removed;
  if (BUILTIN_TEMPLATES.some((t) => t.name === key)) {
    throw new BatonError(`"${key}" is a built-in template and cannot be deleted`, ExitCode.Blocked);
  }
  throw new BatonError(`no custom template "${name}" to delete`);
}

// src/core/explain/index.ts
var DEFAULT_MAX_WORDS = 150;
function ref(t) {
  return { kind: t.kind, name: t.name, source: t.source, line: t.line };
}
function readableConfigError(err) {
  if (typeof err !== "object" || err === null) return err;
  const issue = err.issues?.[0];
  if (!issue) return err;
  const where = issue.path?.length ? `${issue.path.join(".")}: ` : "";
  return new Error(`${where}${issue.message ?? "invalid config"}`);
}
function byPriority(matches, index) {
  const decisions = new Set(index.decisions.map((d) => d.section));
  const rank = (t) => {
    switch (t.kind) {
      case "section":
        return decisions.has(t.section) ? 1 : 0;
      case "dependency":
        return 2;
      case "heading":
        return 3;
      case "mermaid":
        return 4;
      case "file":
        return 5;
    }
  };
  return matches.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map(({ t }) => t);
}
async function explain(root, query, opts) {
  const template2 = await resolveTemplate(opts.dirs, opts.template ?? DEFAULT_TEMPLATE);
  const index = await buildIndex(root);
  const skipped = index.skipped;
  if (toKey(query) === "") return { status: "none", query, suggestions: [], skipped };
  const match = matchTargets(query, index.targets);
  if (match.status === "tie") {
    return { status: "tie", query, candidates: match.candidates.map(ref), skipped };
  }
  if (match.status === "none") {
    return { status: "none", query, suggestions: match.suggestions.map((t) => t.name), skipped };
  }
  let config;
  try {
    config = await loadConfig(root);
  } catch (err) {
    config = defaultConfig();
    skip(skipped, `${CONTEXT_DIR}/${ContextPaths.config}`, readableConfigError(err));
  }
  const targets = byPriority(match.matches, index);
  const { facts, noRecordedReason } = await collectFacts(index, targets, config);
  return {
    status: "ok",
    skipped,
    result: {
      query,
      resolution: match.status,
      targets: targets.map(ref),
      template: template2,
      maxWords: DEFAULT_MAX_WORDS,
      facts,
      noRecordedReason
    }
  };
}
function skippedLines(skipped) {
  return skipped.map((s) => `WARNING skipped ${s.file}: ${s.error}`);
}
function indent(text) {
  return text.split(/\r?\n/).map((l) => `  ${l}`).join("\n");
}
function renderText(outcome) {
  if (outcome.status === "tie") {
    return [
      `Ambiguous: "${outcome.query}" could be:`,
      ...outcome.candidates.map((c) => `- ${c.kind} ${c.name} (${c.source})`),
      ...skippedLines(outcome.skipped)
    ].join("\n");
  }
  if (outcome.status === "none") {
    return [
      `Nothing named "${outcome.query}" found.`,
      ...outcome.suggestions.length > 0 ? [`Did you mean: ${outcome.suggestions.join(", ")}?`] : [],
      ...skippedLines(outcome.skipped)
    ].join("\n");
  }
  const { result } = outcome;
  const first = result.targets[0]?.name ?? result.query;
  const lines = [`# baton explain: ${first}`];
  if (result.resolution === "closest") {
    lines.push(`Closest match: no "${result.query}" found, explaining "${first}" instead.`);
  }
  lines.push(
    `Targets: ${result.targets.map((t) => `${t.kind} ${t.name} (${t.source})`).join(", ")}`,
    `Template: ${result.template.name} (${result.template.source})`,
    `Instructions: ${result.template.prompt.replace(/\r?\n/g, "\n  ")}`,
    `Length: under ${result.maxWords} words unless the user asks for more.`
  );
  if (result.noRecordedReason) {
    lines.push(
      "WARNING no recorded reason: no ADR or .context section links this target. Repeat a reason only if a fact below states it, with its source; never invent one."
    );
  }
  lines.push(...skippedLines(outcome.skipped), "", "## Facts");
  for (const f of result.facts) {
    lines.push(`- [${f.label}] ${f.source} (${f.provenance})`, indent(f.text));
  }
  return lines.join("\n");
}

// src/commands/explain.ts
var MODES = "use one of: explain <thing>, --create, --delete, --templates";
var SCOPES = ["both", "project", "personal"];
var slashes = (p) => p.replace(/\\/g, "/");
function inside(rel, pathMod) {
  return rel !== "" && rel.split(pathMod.sep)[0] !== ".." && !pathMod.isAbsolute(rel);
}
function displayPath(path2, where, pathMod = nodePath) {
  if (inside(pathMod.relative(where.personalDir, path2), pathMod)) {
    return `~/${slashes(pathMod.relative(where.home, path2))}`;
  }
  const inProject = pathMod.relative(where.root, path2);
  if (inside(inProject, pathMod)) return slashes(inProject);
  return slashes(path2);
}
function rejectInapplicable(opts, explaining) {
  const mode = opts.templates ? "--templates" : opts.create !== void 0 ? "--create" : opts.delete !== void 0 ? "--delete" : "explain";
  const reject = (option, allowed) => {
    throw new BatonError(`${option} does not apply to ${mode}; it only works with ${allowed}`);
  };
  if (opts.prompt !== void 0 && opts.create === void 0) reject("--prompt", "--create");
  if (opts.force !== void 0 && opts.create === void 0) reject("--force", "--create");
  if (opts.scope !== void 0 && opts.create === void 0 && opts.delete === void 0) {
    reject("--scope", "--create or --delete");
  }
  if (opts.as !== void 0 && !explaining) reject("--as", "explain <thing>");
  if (opts.format !== void 0 && !explaining) reject("--format", "explain <thing>");
}
function registerExplain(program2) {
  program2.command("explain").description("Explain a repo concept, file, or dependency in plain language").argument("[thing...]", "what to explain; several words are joined with a space").option("--as <template>", "template to write the explanation in").option("--format <format>", "text or json (default: text; explain only)").option("-c, --create <name>", "create a custom template").option("-p, --prompt <text>", "the template prompt (--create only)").option("-s, --scope <scope>", "both, project or personal (default: both; --create/--delete)").option("--force", "overwrite an existing template (--create only)").option("--delete <name>", "delete a custom template").option("--templates", "list available templates").action(
    action(async (words, opts) => {
      const query = words.join(" ").trim();
      const modes = [
        opts.templates === true,
        opts.create !== void 0,
        opts.delete !== void 0,
        query !== ""
      ].filter(Boolean).length;
      if (modes !== 1) throw new BatonError(MODES);
      const format = opts.format ?? "text";
      if (format !== "text" && format !== "json") {
        throw new BatonError(`--format must be text or json, got "${format}"`);
      }
      const scopeName = opts.scope ?? "both";
      if (!SCOPES.includes(scopeName)) {
        throw new BatonError(`--scope must be one of ${SCOPES.join(", ")}, got "${scopeName}"`);
      }
      const scope = scopeName;
      rejectInapplicable(opts, query !== "");
      const home = homeDir();
      const root = await projectRoot();
      const dirs = templateDirs(root, home);
      const where = { root, home, personalDir: dirs.personal };
      if (opts.templates) {
        for (const t of await listTemplates(dirs)) {
          process.stdout.write(`${t.name}  ${t.source}  ${t.description}
`);
        }
        return;
      }
      if (opts.create !== void 0) {
        if (opts.prompt === void 0) throw new BatonError("--create needs --prompt <text>");
        const paths = await createTemplate(dirs, opts.create, opts.prompt, {
          scope,
          force: opts.force === true
        });
        for (const p of paths) process.stdout.write(`created ${displayPath(p, where)}
`);
        return;
      }
      if (opts.delete !== void 0) {
        for (const p of await deleteTemplate(dirs, opts.delete, scope)) {
          process.stdout.write(`removed ${displayPath(p, where)}
`);
        }
        return;
      }
      const outcome = await explain(root, query, {
        dirs,
        ...opts.as !== void 0 ? { template: opts.as } : {}
      });
      const text = format === "json" ? JSON.stringify(outcome, null, 2) : renderText(outcome);
      process.stdout.write(`${text}
`);
      if (outcome.status === "tie") process.exitCode = ExitCode.Blocked;
      else if (outcome.status === "none") process.exitCode = ExitCode.Error;
    })
  );
}

// src/commands/handoff.ts
function registerHandoff(program2) {
  program2.command("handoff").description("regenerate STATE.md from the task store and git").option("--reason <reason>", "why the handoff ran (pre-compact, session-end, manual)", "manual").option("--transcript <path>", "session transcript to read recent tool calls from").option("--dry-run", "print instead of writing STATE.md").action(
    action(async (o) => {
      const root = await projectRoot();
      requireContext(root);
      const config = await loadConfig(root);
      const result = await runHandoff(root, config, {
        reason: o.reason,
        ...o.transcript === void 0 ? {} : { transcriptPath: o.transcript },
        ...o.dryRun ? { dryRun: true } : {}
      });
      if (o.dryRun) process.stdout.write(result.text);
      else if (result.changed) process.stdout.write(`wrote ${STATE_PATH} (${o.reason})
`);
      else process.stdout.write(`${STATE_PATH} unchanged
`);
    })
  );
}

// src/commands/hook.ts
function registerHook(program2) {
  program2.command("hook").description("run a harness hook (reads hook JSON on stdin)").addArgument(program2.createArgument("<event>", "hook event").choices(HOOK_EVENTS)).addOption(
    new Option("--harness <name>", "calling harness").choices(HARNESSES).default("claude")
  ).action(async (event, opts) => {
    const out3 = await runHook(event, opts.harness);
    if (out3.stdout) process.stdout.write(out3.stdout);
    if (out3.stderr) process.stderr.write(out3.stderr);
    process.exitCode = out3.exitCode;
  });
}

// src/commands/init.ts
function registerInit(program2) {
  program2.command("init").description("scaffold .context/, the AGENTS.md router and harness hooks").option("--harness <list>", "claude, codex, gemini or all (comma-separated)", "claude").option("--no-hooks", "do not print hook setup").option("--force", "overwrite existing files").action(
    action(async (o) => {
      const harnesses = parseHarnesses(o.harness);
      for (const name of ["codex", "gemini"]) {
        if (harnesses.includes(name)) notImplemented(`init --harness ${name}`, "Phase 3 (Reach)");
      }
      const cwd = process.cwd();
      const root = await projectRoot();
      if (!samePath(root, cwd)) process.stdout.write(`root: ${root}
`);
      const actions = await scaffold(root, { force: o.force === true });
      for (const a of actions) {
        process.stdout.write(`${a.action} ${a.path}${a.note ? ` (${a.note})` : ""}
`);
      }
      if (o.hooks && harnesses.includes("claude")) {
        process.stdout.write(
          "hooks: Claude Code hooks ship with the baton plugin (plugin/hooks/hooks.json); install it with /plugin marketplace add NIGHTFURY609/baton then /plugin install baton@baton\n"
        );
      }
    })
  );
}

// src/commands/mcp.ts
function registerMcp(program2) {
  program2.command("mcp").description("serve the optional four-tool MCP adapter over stdio").action(async () => {
    const { startMcpServer } = await import("./server-J2L55AKV.mjs");
    await startMcpServer();
  });
}

// src/commands/mission.ts
function registerMission(program2) {
  program2.command("mission").description("print the budgeted mission packet for the next session").option("--budget <chars>", "max characters (default from config, <= 10000)").option("--task <id>", "focus the packet on one task instead of the ready queue").addOption(
    new Option("--format <fmt>", "output format").choices(["text", "json"]).default("text")
  ).action(
    action(async (o) => {
      const root = await projectRoot();
      requireContext(root);
      const config = await loadConfig(root);
      const maxChars = parseBudget(o.budget, config.packet.maxChars);
      const result = await buildMission(root, config, {
        maxChars,
        ...o.task === void 0 ? {} : { taskId: o.task }
      });
      try {
        await writePacketCache(root, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`baton: could not write packet cache: ${message}
`);
      }
      process.stdout.write(
        o.format === "json" ? `${JSON.stringify(result, null, 2)}
` : `${result.text}
`
      );
    })
  );
}

// src/commands/stats.ts
function registerStats(program2) {
  program2.command("stats").description("report measured tokens, corrections and drift from session logs").option("--session <path>", "one transcript JSONL (default: all for this project)").option("--since <date>", "only sessions on or after this date (YYYY-MM-DD)").addOption(
    new Option("--format <fmt>", "output format").choices(["text", "json"]).default("text")
  ).action(
    action(async (opts) => {
      const root = await projectRoot();
      const options = {};
      if (opts.session !== void 0) options.sessionPath = opts.session;
      if (opts.since !== void 0) options.since = opts.since;
      const report = await collectStats(root, options);
      process.stdout.write(
        `${opts.format === "json" ? JSON.stringify(report, null, 2) : renderStats(report)}
`
      );
    })
  );
}

// src/commands/task.ts
function toBatonError(err) {
  const blocked = [
    "already_claimed",
    "not_claimable",
    "has_open_children",
    "has_open_blockers",
    "cycle",
    "conflict"
  ];
  return new BatonError(
    err.message,
    blocked.includes(err.code) ? ExitCode.Blocked : ExitCode.Error
  );
}
async function withTasks(globals, fn) {
  const root = await projectRoot();
  const config = await loadConfig(root);
  const { service, db } = openTaskService(
    root,
    config,
    globals.actor ? { actor: globals.actor } : {}
  );
  try {
    return await fn(service);
  } catch (err) {
    if (err instanceof TaskError) throw toBatonError(err);
    throw err;
  } finally {
    db.close();
  }
}
var list = (v) => v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
function parseType(v) {
  if (!isIssueType(v)) throw new BatonError(`type must be one of ${ISSUE_TYPES.join(", ")}`);
  return v;
}
function parseStatuses(v) {
  const items = list(v);
  for (const s of items) if (!isStatus(s)) throw new BatonError(`unknown status ${s}`);
  return items.length ? items : void 0;
}
function parseDeps(v) {
  return list(v).map((item) => {
    const [a, b] = item.includes(":") ? item.split(":", 2) : ["blocks", item];
    if (!isDepType(a) || !b)
      throw new BatonError(`bad dependency "${item}" (type:id, types: ${DEP_TYPES.join(", ")})`);
    return [a, b];
  });
}
function formatIssueLine(i) {
  const who = i.assignee ? `  @${i.assignee}` : "";
  const labels = i.labels.length ? `  [${i.labels.join(", ")}]` : "";
  return `${i.id.padEnd(12)} P${i.priority}  ${i.status.padEnd(11)} ${i.issueType.padEnd(8)} ${i.title}${who}${labels}`;
}
function formatIssue(i) {
  const lines = [
    `${i.id}: ${i.title}`,
    `  status ${i.status} \xB7 P${i.priority} \xB7 ${i.issueType}${i.assignee ? ` \xB7 @${i.assignee}` : ""}`,
    `  created ${i.createdAt}${i.createdBy ? ` by ${i.createdBy}` : ""} \xB7 updated ${i.updatedAt}`
  ];
  if (i.closedAt) lines.push(`  closed ${i.closedAt}: ${i.closeReason ?? ""}`);
  if (i.deferUntil) lines.push(`  deferred until ${i.deferUntil}`);
  if (i.labels.length) lines.push(`  labels: ${i.labels.join(", ")}`);
  for (const d of i.dependencies) lines.push(`  ${d.type} -> ${d.dependsOnId}`);
  for (const [name, text] of [
    ["description", i.description],
    ["design", i.design],
    ["acceptance", i.acceptanceCriteria],
    ["notes", i.notes]
  ]) {
    if (text) lines.push("", `${name}:`, ...text.split("\n").map((l) => `  ${l}`));
  }
  if (i.comments.length) {
    lines.push("", "comments:");
    for (const c of i.comments)
      lines.push(`  #${c.id} ${c.author ?? ""} ${c.createdAt}`, `    ${c.text}`);
  }
  return lines.join("\n");
}
function out2(json, data, text) {
  process.stdout.write(json ? `${JSON.stringify(data, null, 2)}
` : `${text()}
`);
}
function registerTask(program2) {
  const task = program2.command("task").description("structured task store (.context/tasks.jsonl): create, ready, claim, close \u2026").option("--actor <name>", "who is acting (default: BATON_ACTOR, git user.name, OS user)");
  const g = () => task.opts();
  task.command("create").description("create a task").argument("<title>", "task title").option("-d, --description <text>", "description").option("--acceptance <text>", "acceptance criteria").option("--design <text>", "design notes").option("--notes <text>", "notes").option("-p, --priority <0-4>", "priority, 0 = most urgent", "2").option("-t, --type <type>", `one of ${ISSUE_TYPES.join(", ")}`, "task").option(
    "-l, --labels <list>",
    "comma-separated labels (spec:<id>, check:<cmd> are understood by baton)"
  ).option(
    "--check <command>",
    "command `baton verify` runs to accept the task (stored as label check:<command>)"
  ).option("--spec <ids>", "spec section ids this task implements (stored as labels spec:<id>)").option("--parent <id>", "create as a child task (id becomes <parent>.N)").option("--deps <list>", "dependencies, e.g. blocks:bt-a3f,related:bt-b2c").option("--defer-until <iso>", "hide from ready until this time").option("--json", "print JSON").action(
    action(async (title, o) => {
      await withTasks(g(), (s) => {
        const input = {
          title,
          priority: parsePriority(String(o.priority)),
          issueType: parseType(String(o.type)),
          labels: [
            ...list(o.labels),
            ...list(o.spec).map((id) => `spec:${id}`),
            ...o.check ? [`check:${String(o.check)}`] : []
          ],
          deps: parseDeps(o.deps)
        };
        if (o.description) input.description = String(o.description);
        if (o.acceptance) input.acceptanceCriteria = String(o.acceptance);
        if (o.design) input.design = String(o.design);
        if (o.notes) input.notes = String(o.notes);
        if (o.parent) input.parent = String(o.parent);
        if (o.deferUntil) input.deferUntil = String(o.deferUntil);
        const issue = s.create(input);
        out2(Boolean(o.json), issue, () => `created ${issue.id}: ${issue.title}`);
      });
    })
  );
  task.command("list").description("list tasks (open and in progress by default)").option("-s, --status <list>", "comma-separated statuses").option("-a, --all", "include closed tasks").option("-l, --labels <list>", "require all of these labels").option("--parent <id>", "only descendants of this task").option("--assignee <name>", "only tasks assigned to this name").option("-t, --type <type>", "only this type").option("-n, --limit <n>", "max results").option("--json", "print JSON").action(
    action(async (o) => {
      await withTasks(g(), (s) => {
        const status = parseStatuses(o.status) ?? (o.all ? void 0 : ["open", "in_progress", "blocked", "deferred"]);
        const f = {
          labels: list(o.labels)
        };
        if (status) f.status = status;
        if (o.parent) f.parent = String(o.parent);
        if (o.assignee) f.assignee = String(o.assignee);
        if (o.type) f.issueType = parseType(String(o.type));
        if (o.limit) f.limit = Number(o.limit);
        const issues = s.list(f);
        out2(Boolean(o.json), issues, () => issues.map(formatIssueLine).join("\n") || "no tasks");
      });
    })
  );
  task.command("show").description("show one task in full").argument("<id>").option("--json", "print JSON").action(
    action(async (id, o) => {
      await withTasks(g(), (s) => {
        const issue = s.get(id);
        if (!issue) throw new BatonError(`no task ${id}`);
        out2(o.json, issue, () => formatIssue(issue));
      });
    })
  );
  task.command("ready").description("unblocked open work, in priority order").option("-n, --limit <n>", "max results", "10").option("--sort <policy>", "priority | oldest | hybrid", "priority").option("-l, --labels <list>", "require all of these labels").option("--parent <id>", "only descendants of this task").option("--unassigned", "only unassigned tasks").option("--include-deferred", "include deferred tasks").option("--claim", "claim the first ready task for the current actor").option("--json", "print JSON").action(
    action(async (o) => {
      await withTasks(g(), (s) => {
        const sort = String(o.sort);
        if (!["priority", "oldest", "hybrid"].includes(sort))
          throw new BatonError("sort must be priority, oldest or hybrid");
        const f = {
          limit: Number(o.limit),
          sort,
          labels: list(o.labels),
          unassigned: Boolean(o.unassigned),
          includeDeferred: Boolean(o.includeDeferred)
        };
        if (o.parent) f.parent = String(o.parent);
        if (o.claim) {
          const claimed = s.claimNext(f);
          if (!claimed) throw new BatonError("nothing ready to claim", ExitCode.Blocked);
          out2(Boolean(o.json), claimed, () => `claimed ${claimed.id}: ${claimed.title}`);
          return;
        }
        const issues = s.ready(f);
        out2(
          Boolean(o.json),
          issues,
          () => issues.map(formatIssueLine).join("\n") || "nothing ready"
        );
      });
    })
  );
  task.command("blocked").description("blocked tasks and what blocks them").option("--json", "print JSON").action(
    action(async (o) => {
      await withTasks(g(), (s) => {
        const rows = s.blocked();
        out2(
          o.json,
          rows,
          () => rows.map((r) => `${formatIssueLine(r.issue)}
    blocked by ${r.blockedBy.join(", ")}`).join("\n") || "nothing blocked"
        );
      });
    })
  );
  task.command("update").description("change fields of a task").argument("<id>").option("--title <text>").option("-d, --description <text>").option("--acceptance <text>").option("--design <text>").option("--notes <text>").option("-p, --priority <0-4>").option("-t, --type <type>").option("-s, --status <status>", "open | in_progress | blocked | deferred (use close to close)").option("--assignee <name>", "set assignee (empty string clears)").option("--defer-until <iso>", "set defer time (empty string clears)").option("--add-labels <list>").option("--remove-labels <list>").option("--claim", "claim for the current actor (atomic)").option("--json", "print JSON").action(
    action(async (id, o) => {
      await withTasks(g(), (s) => {
        let issue;
        if (o.claim) issue = s.claim(id);
        const u = {};
        if (o.title !== void 0) u.title = String(o.title);
        if (o.description !== void 0) u.description = String(o.description);
        if (o.acceptance !== void 0) u.acceptanceCriteria = String(o.acceptance);
        if (o.design !== void 0) u.design = String(o.design);
        if (o.notes !== void 0) u.notes = String(o.notes);
        if (o.priority !== void 0) u.priority = parsePriority(String(o.priority));
        if (o.type !== void 0) u.issueType = parseType(String(o.type));
        if (o.status !== void 0) {
          const st = String(o.status);
          if (!isStatus(st) || st === "closed")
            throw new BatonError("status must be open, in_progress, blocked or deferred");
          u.status = st;
        }
        if (o.assignee !== void 0) u.assignee = String(o.assignee) || null;
        if (o.deferUntil !== void 0) u.deferUntil = String(o.deferUntil) || null;
        if (o.addLabels) u.addLabels = list(String(o.addLabels));
        if (o.removeLabels) u.removeLabels = list(String(o.removeLabels));
        const changed = Object.keys(u).length > 0;
        if (changed || !issue) issue = s.update(id, u);
        const result = issue;
        const verb = o.claim && !changed ? `claimed ${result.id} for ${result.assignee}` : `updated ${result.id}`;
        out2(Boolean(o.json), result, () => verb);
      });
    })
  );
  task.command("close").description(
    "close tasks (refuses with open children, open blockers or a check: label unless --force)"
  ).argument("<ids...>").option("-r, --reason <text>", "close reason", "Closed").option(
    "-f, --force",
    "close even with open children, open blockers or a check: label (recorded as forced)"
  ).option("--json", "print JSON").action(
    action(async (ids, o) => {
      await withTasks(g(), (s) => {
        const checked = /* @__PURE__ */ new Set();
        for (const id of ids) {
          const issue = s.get(id);
          if (!issue) continue;
          const cmds = checkCommands(issue.labels);
          if (cmds.length === 0) continue;
          if (!o.force) {
            throw new BatonError(
              `${id} has a check (${cmds.join("; ")}); close it with baton verify ${id}, or with task close --force and a reason`,
              ExitCode.Blocked
            );
          }
          checked.add(id);
        }
        const closed = ids.map(
          (id) => s.close(
            id,
            checked.has(id) ? `forced (check not run): ${o.reason}` : o.reason,
            Boolean(o.force)
          )
        );
        out2(o.json, closed, () => closed.map((i) => `closed ${i.id}`).join("\n"));
      });
    })
  );
  task.command("reopen").description("reopen a closed task (clears its start, so verify counts from the next claim)").argument("<id>").action(
    action(async (id) => {
      await withTasks(g(), (s) => out2(false, null, () => `reopened ${s.reopen(id).id}`));
    })
  );
  task.command("delete").description("delete a task (prefer close; refuses if other tasks depend on it)").argument("<id>").option("-f, --force", "also remove links from dependent tasks").action(
    action(async (id, o) => {
      await withTasks(g(), (s) => {
        s.delete(id, Boolean(o.force));
        out2(false, null, () => `deleted ${id}`);
      });
    })
  );
  const dep = task.command("dep").description("manage dependencies between tasks");
  dep.command("add").description("<issue> depends on <depends-on>").argument("<issue>").argument("<depends-on>").option("-t, --type <type>", DEP_TYPES.join(" | "), "blocks").action(
    action(async (issue, dependsOn, o) => {
      if (!isDepType(o.type)) throw new BatonError(`type must be one of ${DEP_TYPES.join(", ")}`);
      const type = o.type;
      await withTasks(g(), (s) => {
        s.addDependency(issue, dependsOn, type);
        out2(false, null, () => `${issue} ${type} -> ${dependsOn}`);
      });
    })
  );
  dep.command("remove").description("remove the link from <issue> to <depends-on>").argument("<issue>").argument("<depends-on>").action(
    action(async (issue, dependsOn) => {
      await withTasks(g(), (s) => {
        s.removeDependency(issue, dependsOn);
        out2(false, null, () => `removed ${issue} -> ${dependsOn}`);
      });
    })
  );
  task.command("comment").description("add a comment to a task").argument("<id>").argument("<text...>").action(
    action(async (id, text) => {
      await withTasks(g(), (s) => {
        const issue = s.addComment(id, text.join(" "));
        out2(false, null, () => `commented on ${issue.id} (#${issue.comments.at(-1)?.id})`);
      });
    })
  );
  task.command("import").description("import a Beads JSONL export (bd export [--include-memories])").argument("<file>").option("--overwrite", "replace tasks whose ids already exist").option("--json", "print JSON").action(
    action(async (file, o) => {
      const { readFile: readFile3 } = await import("fs/promises");
      const text = await readFile3(file, "utf8");
      await withTasks(g(), (s) => {
        const r = s.importBeads(text, file, Boolean(o.overwrite));
        out2(
          o.json,
          r,
          () => [
            `imported: ${r.created} created, ${r.updated} replaced, ${r.skipped} skipped, ${r.memories} memories`,
            ...r.droppedDeps.map((d) => `  dropped dependency on a missing task: ${d}`)
          ].join("\n")
        );
      });
    })
  );
}
function registerMemory(program2) {
  program2.command("remember").description("store a short project fact (shown in the session brief)").argument("<text...>").option("-k, --key <key>", "key (default: derived from the text)").action(
    action(async (text, o) => {
      await withTasks({}, (s) => {
        const m = s.remember(text.join(" "), o.key);
        out2(false, null, () => `remembered ${m.key}`);
      });
    })
  );
  program2.command("recall").description("print one memory by key").argument("<key>").action(
    action(async (key) => {
      await withTasks({}, (s) => {
        const m = s.recall(key);
        if (!m) throw new BatonError(`no memory ${key}`);
        out2(false, null, () => m.value);
      });
    })
  );
  program2.command("forget").description("delete a memory by key").argument("<key>").action(
    action(async (key) => {
      await withTasks({}, (s) => {
        if (!s.forget(key)) throw new BatonError(`no memory ${key}`);
        out2(false, null, () => `forgot ${key}`);
      });
    })
  );
  program2.command("memories").description("list memories, optionally filtered by text").argument("[search]").option("--json", "print JSON").action(
    action(async (search, o) => {
      await withTasks({}, (s) => {
        const ms = s.memories(search);
        out2(o.json, ms, () => ms.map((m) => `${m.key}: ${m.value}`).join("\n") || "no memories");
      });
    })
  );
}

// src/commands/verify.ts
function registerVerify(program2) {
  program2.command("verify").description("run a task's check commands; close the task only if they pass").argument("<task-id>", "task id in the task store").option("--no-diff", "allow closing with an empty diff").action(
    action(async (id, o) => {
      const root = await projectRoot();
      requireContext(root);
      const config = await loadConfig(root);
      const outcome = await verifyTask(root, config, id, {
        requireDiff: config.verify.requireDiff && o.diff !== false,
        close: true,
        onCheckStart: (c) => process.stdout.write(`running check: ${c}
`),
        onOutput: (chunk, s) => (s === "stdout" ? process.stdout : process.stderr).write(chunk)
      }).catch((err) => {
        throw err instanceof TaskError ? toBatonError(err) : err;
      });
      switch (outcome.status) {
        case "already-closed":
          process.stdout.write(`${id} is already closed
`);
          return;
        case "no-diff":
          throw new BatonError(
            `no changes since ${id} was started (${outcome.since}); verify needs a non-empty diff outside the task store (use --no-diff for a task without file changes)`,
            ExitCode.Blocked
          );
        case "failed": {
          const run = outcome.run;
          throw new BatonError(
            `check failed (${run.timedOut ? "timed out" : `exit ${run.exitCode}`}): ${run.command}; ${id} stays open`,
            ExitCode.Blocked
          );
        }
        case "passed":
          process.stdout.write(
            `closed ${id} (checks passed: ${outcome.runs.map((r) => r.command).join("; ")})
`
          );
      }
    })
  );
}

// src/program.ts
function buildProgram() {
  const program2 = new Command().name("baton").description(
    "Continuity layer for coding agents: the smallest fresh brief at session start, nothing stale reaches the model."
  ).version(package_default.version).showHelpAfterError();
  registerInit(program2);
  registerMission(program2);
  registerHandoff(program2);
  registerDrift(program2);
  registerDecide(program2);
  registerVerify(program2);
  registerExplain(program2);
  registerCompile(program2);
  registerStats(program2);
  registerTask(program2);
  registerMemory(program2);
  registerHook(program2);
  registerMcp(program2);
  return program2;
}
export {
  buildProgram
};
//# sourceMappingURL=program-OYVNK3UP.mjs.map