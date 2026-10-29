import { stripVTControlCharacters } from "node:util";
import { isCancel, MultiSelectPrompt, SelectPrompt, TextPrompt } from "@clack/core";
import { S_BAR, S_BAR_END, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT } from "@clack/prompts";
import pc from "./colors";
import { demoMode, demoPromptLines } from "./demo-notice";
import { fitLine, fitNames, fitRow, gutterLines, promptWidth } from "./rows";
import { tone } from "./theme";

/*
 * Prompts styled with the shared color system (see theme.ts), on @clack/core.
 * Every prompt accepts `q` to quit softly (QUIT) next to Esc/Ctrl+C (CANCELLED).
 */

/** The user pressed `q`: leave cleanly, exit code 0. */
export const QUIT: unique symbol = Symbol("quit");
/** Esc or Ctrl+C: exit code 130. */
export const CANCELLED: unique symbol = Symbol("cancelled");
export type Escape = typeof QUIT | typeof CANCELLED;
/** `r` on a prompt that offers Retry (the latest-version lookups failed). */
export const RETRY: unique symbol = Symbol("retry");
/** `r` on "What next?": rescan, the same as choosing Rescan. */
export const RESCAN: unique symbol = Symbol("rescan");

export interface PromptIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** Offer `r` = retry (footer "· r retry"); the prompt then resolves RETRY. */
  retry?: boolean;
  /** Offer `r` = rescan (footer "· r rescan · q quit"); the prompt then resolves RESCAN. */
  rescan?: boolean;
}

interface KeyFlags {
  quit: boolean;
  retry: boolean;
  rescan?: boolean;
}

export interface ChecklistOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** Dim heading shown above the first option of each group (not selectable). */
  group?: string;
}

const bar = pc.gray(S_BAR);
const CHECKLIST_KEYS = "↑/↓ move · space select · a all · enter confirm · q quit";
const CHOOSE_KEYS = "↑/↓ move · enter confirm · q quit";

/**
 * Header shared by both prompts; a blank gutter line separates the hint from the
 * options. In demo mode an open prompt starts (and ends, see footer) with the notice.
 */
function header(state: string, message: string, hint: string | undefined, width: number): string[] {
  const symbol =
    state === "submit" ? tone.done(S_STEP_SUBMIT) : state === "cancel" ? tone.bad(S_STEP_CANCEL) : tone.action(S_STEP_ACTIVE);
  // Long questions and hints wrap under the gutter instead of running off the window.
  const lines = [bar, ...gutterLines(`${symbol}  `, `${bar}  `, message, width)];
  const open = state !== "submit" && state !== "cancel";
  if (open && demoMode()) lines.push(...demoPromptLines().map((l) => `${bar}  ${l}`), bar);
  if (hint && open) lines.push(...gutterLines(`${bar}  `, `${bar}  `, hint, width, tone.muted), bar);
  return lines;
}

/**
 * Wire `q` (soft quit) and, when offered, `r` (retry) on any core prompt; the
 * flags tell render and caller apart from Esc/Ctrl+C.
 */
function withKeys(prompt: { on(event: "key", cb: (char: string | undefined) => void): void; state: string }, flag: KeyFlags, retry = false, rescan = false): void {
  prompt.on("key", (char) => {
    if (char === "q" || char === "Q") {
      flag.quit = true;
      prompt.state = "cancel";
    } else if (retry && (char === "r" || char === "R")) {
      flag.retry = true;
      prompt.state = "cancel";
    } else if (rescan && (char === "r" || char === "R")) {
      flag.rescan = true;
      prompt.state = "cancel";
    }
  });
}

/** Closed-prompt lines: a soft quit or retry reads calmly, Esc/Ctrl+C as cancelled. */
function closed(state: string, flag: KeyFlags, message: string, text: string, width: number): string {
  if (state === "cancel") {
    const calm = flag.quit ? "quit" : flag.retry ? "retry" : flag.rescan ? "rescan" : null;
    return (calm ? [...header("submit", message, undefined, width), `${bar}  ${tone.muted(calm)}`] : header(state, message, undefined, width)).join("\n");
  }
  return [...header(state, message, undefined, width), fitLine(`${bar}  `, text, width, tone.muted)].join("\n");
}

/** Key hints (and the demo notice above them in demo mode). */
function footer(keys: string, width: number, retry?: boolean, rescan?: boolean): string[] {
  const hints = rescan ? keys.replace(" · q quit", " · r rescan · q quit") : retry ? `${keys} · r retry` : keys;
  const demo = demoMode() ? [...demoPromptLines().map((l) => `${bar}  ${l}`), bar] : [];
  return [...demo, ...gutterLines(`${bar}  `, `${bar}  `, hints, width, tone.muted)];
}

/** Multi-select: selected = amber filled box, unselected = dim empty box, focused row = bold label. */
export async function checklist<T extends string>(
  opts: { message: string; hint?: string; options: ChecklistOption<T>[]; initialValues: T[] } & PromptIO,
): Promise<T[] | Escape | typeof RETRY> {
  const flag: KeyFlags = { quit: false, retry: false };
  const prompt = new MultiSelectPrompt<ChecklistOption<T>>({
    options: opts.options,
    initialValues: opts.initialValues,
    ...(opts.input && { input: opts.input as never }),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const value = (this.value ?? []) as T[];
      const width = promptWidth(opts.output);
      const lines = header(this.state, opts.message, opts.hint, width);
      if (this.state === "submit" || this.state === "cancel") {
        const picked = opts.options.filter((o) => value.includes(o.value)).map((o) => stripVTControlCharacters(o.label.split("  ")[0] ?? ""));
        return closed(this.state, flag, opts.message, picked.length > 0 ? fitNames(picked, width - 3) : "nothing selected", width);
      }
      opts.options.forEach((option, i) => {
        if (option.group && option.group !== opts.options[i - 1]?.group) lines.push(`${bar}  ${tone.muted(option.group)}`);
        const selected = value.includes(option.value);
        const box = selected ? tone.action(S_CHECKBOX_SELECTED) : tone.muted(S_CHECKBOX_INACTIVE);
        const style = i === this.cursor ? tone.focus : selected ? (l: string) => l : tone.muted;
        // One row each: name and versions stay, the hint gives way (see fitHint for the order).
        lines.push(fitRow(`${bar}  ${box} `, option.label, option.hint, width, style));
      });
      lines.push(bar, ...footer(CHECKLIST_KEYS, width, opts.retry), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withKeys(prompt, flag, opts.retry);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
  if (flag.retry) return RETRY;
  if (isCancel(result)) return CANCELLED;
  return (result ?? []) as T[];
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** Single choice (menus such as "Ready to update?" or "Rescan / Quit"). */
export async function choose<T extends string>(
  opts: { message: string; hint?: string; options: ChoiceOption<T>[]; initialValue?: T } & PromptIO,
): Promise<T | Escape | typeof RETRY | typeof RESCAN> {
  const flag: KeyFlags = { quit: false, retry: false };
  const prompt = new SelectPrompt<ChoiceOption<T>>({
    options: opts.options,
    ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
    ...(opts.input && { input: opts.input as never }),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const width = promptWidth(opts.output);
      const lines = header(this.state, opts.message, opts.hint, width);
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = opts.options[this.cursor]?.label ?? "";
        return closed(this.state, flag, opts.message, chosen, width);
      }
      opts.options.forEach((option, i) => {
        const focused = i === this.cursor;
        lines.push(fitLine(`${bar}  ${focused ? tone.action(S_RADIO_ACTIVE) : tone.muted(S_RADIO_INACTIVE)} `, option.label, width, focused ? tone.focus : tone.muted));
      });
      lines.push(bar, ...footer(CHOOSE_KEYS, width, opts.retry, opts.rescan), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withKeys(prompt, flag, opts.retry, opts.rescan);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
  if (flag.retry) return RETRY;
  if (flag.rescan) return RESCAN;
  if (isCancel(result)) return CANCELLED;
  return result as T;
}

const ASK_KEYS = "type to edit · enter confirm · esc back";

/** One line of text, prefilled and editable (e.g. a file path). Esc/Ctrl+C resolve CANCELLED. */
export async function ask(opts: { message: string; initialValue?: string; validate?: (value: string) => string | undefined } & PromptIO): Promise<string | typeof CANCELLED> {
  const prompt = new TextPrompt({
    ...(opts.initialValue !== undefined && { initialUserInput: opts.initialValue }),
    ...(opts.validate && { validate: (value: string | undefined) => opts.validate!(value ?? "") }),
    ...(opts.input && { input: opts.input as never }),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const width = promptWidth(opts.output);
      const lines = header(this.state === "error" ? "active" : this.state, opts.message, undefined, width);
      if (this.state === "submit" || this.state === "cancel") {
        if (this.state === "submit") lines.push(`${bar}  ${tone.muted(this.value ?? "")}`);
        return lines.join("\n");
      }
      lines.push(`${bar}  ${this.userInputWithCursor}`);
      if (this.state === "error") lines.push(`${bar}  ${tone.action(this.error)}`);
      lines.push(bar, ...gutterLines(`${bar}  `, `${bar}  `, ASK_KEYS, width, tone.muted), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  const result = await prompt.prompt();
  return isCancel(result) ? CANCELLED : String(result ?? "");
}