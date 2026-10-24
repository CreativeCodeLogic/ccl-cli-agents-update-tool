import { PassThrough } from "node:stream";
import { isCancel, MultiSelectPrompt, SelectPrompt, TextPrompt } from "@clack/core";
import { S_BAR, S_BAR_END, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT } from "@clack/prompts";
import pc from "./colors";
import { demoMode, demoPromptLines } from "./demo-notice";
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
/** `n` on "What next?": show what's new in the tools just updated. */
export const NOTES: unique symbol = Symbol("notes");

/** "n what's new" on a checklist row (see checklist). */
export interface NotesKey<T extends string> {
  /** Show the row's notes (the popup); the checklist waits, unchanged. */
  show: (value: T) => Promise<void>;
  /** Too small for the popup: `o` opens the row's official notes in the browser instead. */
  open: (value: T) => void;
  /** Whether the terminal is big enough for the popup right now. */
  fits: () => boolean;
  /** Show "n what's new" in the key hints (false: --hide-whats-new; n still works). */
  hint: boolean;
}

/** One line in the hint area when the popup doesn't fit. */
export const NOTES_TOO_SMALL = "Window too small for notes: o opens them in your browser";

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
  notes?: boolean;
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
const CHECKLIST_KEYS_NOTES = "↑/↓ move · space select · a all · n what's new · enter confirm · q quit";

/**
 * Keys for a prompt that can open a popup (n): stdin passes through a gate, so
 * while the popup is open the prompt sees nothing (arrows scroll the notes, not
 * the checklist). Raw mode is left as it was found.
 */
function keyGate(stdin: NodeJS.ReadStream = process.stdin) {
  const proxy = new PassThrough();
  let open = true;
  const forward = (data: Buffer | string) => {
    if (open) proxy.write(data);
  };
  const wasRaw = Boolean(stdin.isRaw);
  if (stdin.isTTY && !wasRaw) stdin.setRawMode(true);
  stdin.on("data", forward);
  stdin.resume();
  return {
    input: proxy,
    pause: () => {
      open = false;
    },
    resume: () => {
      open = true;
    },
    dispose: () => {
      stdin.off("data", forward);
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
      proxy.end();
    },
  };
}
const CHOOSE_KEYS = "↑/↓ move · enter confirm · q quit";
const CHOOSE_KEYS_NOTES = "↑/↓ move · enter confirm · n what's new · q quit";

/**
 * Header shared by both prompts; a blank gutter line separates the hint from the
 * options. In demo mode an open prompt starts (and ends, see footer) with the notice.
 */
function header(state: string, message: string, hint?: string): string[] {
  const symbol =
    state === "submit" ? tone.done(S_STEP_SUBMIT) : state === "cancel" ? tone.bad(S_STEP_CANCEL) : tone.action(S_STEP_ACTIVE);
  const lines = [bar, `${symbol}  ${message}`];
  const open = state !== "submit" && state !== "cancel";
  if (open && demoMode()) lines.push(...demoPromptLines().map((l) => `${bar}  ${l}`), bar);
  if (hint && open) lines.push(`${bar}  ${tone.muted(hint)}`, bar);
  return lines;
}

/**
 * Wire `q` (soft quit) and, when offered, `r` (retry) on any core prompt; the
 * flags tell render and caller apart from Esc/Ctrl+C.
 */
function withKeys(prompt: { on(event: "key", cb: (char: string | undefined) => void): void; state: string }, flag: KeyFlags, retry = false, rescan = false, notes = false): void {
  prompt.on("key", (char) => {
    if (notes && (char === "n" || char === "N")) {
      flag.notes = true;
      prompt.state = "cancel";
    } else if (char === "q" || char === "Q") {
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
function closed(state: string, flag: KeyFlags, message: string, text: string): string {
  if (state === "cancel") {
    const calm = flag.quit ? "quit" : flag.retry ? "retry" : flag.rescan ? "rescan" : flag.notes ? "what's new" : null;
    return (calm ? [...header("submit", message), `${bar}  ${tone.muted(calm)}`] : header(state, message)).join("\n");
  }
  return [...header(state, message), `${bar}  ${tone.muted(text)}`].join("\n");
}

/** Key hints (and the demo notice above them in demo mode). */
function footer(keys: string, retry?: boolean, rescan?: boolean, notice?: string | null): string[] {
  const hints = rescan ? keys.replace(" · q quit", " · r rescan · q quit") : retry ? `${keys} · r retry` : keys;
  const demo = demoMode() ? [...demoPromptLines().map((l) => `${bar}  ${l}`), bar] : [];
  return [...demo, `${bar}  ${notice ? tone.action(notice) : tone.muted(hints)}`];
}

/** Multi-select: selected = amber filled box, unselected = dim empty box, focused row = bold label. */
export async function checklist<T extends string>(
  opts: {
    message: string;
    hint?: string;
    options: ChecklistOption<T>[];
    initialValues: T[];
    /** n on a row: that tool's release notes (a popup); the checklist waits, unchanged. */
    notes?: NotesKey<T>;
  } & PromptIO,
): Promise<T[] | Escape | typeof RETRY> {
  const flag: KeyFlags = { quit: false, retry: false };
  const gate = opts.notes && !opts.input ? keyGate() : null;
  // "Window too small for notes": shown in the hint line until the next key; o then opens the browser.
  let notice: string | null = null;
  let openFocused: (() => void) | null = null;
  const prompt = new MultiSelectPrompt<ChecklistOption<T>>({
    options: opts.options,
    initialValues: opts.initialValues,
    ...(opts.input ? { input: opts.input as never } : gate ? { input: gate.input as never } : {}),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const value = (this.value ?? []) as T[];
      const lines = header(this.state, opts.message, opts.hint);
      if (this.state === "submit" || this.state === "cancel") {
        const picked = opts.options.filter((o) => value.includes(o.value)).map((o) => o.label.split("  ")[0]);
        return closed(this.state, flag, opts.message, picked.length > 0 ? picked.join(", ") : "nothing selected");
      }
      opts.options.forEach((option, i) => {
        if (option.group && option.group !== opts.options[i - 1]?.group) lines.push(`${bar}  ${tone.muted(option.group)}`);
        const selected = value.includes(option.value);
        const box = selected ? tone.action(S_CHECKBOX_SELECTED) : tone.muted(S_CHECKBOX_INACTIVE);
        const label = i === this.cursor ? tone.focus(option.label) : selected ? option.label : tone.muted(option.label);
        lines.push(`${bar}  ${box} ${label}${option.hint ? `  ${tone.muted(option.hint)}` : ""}`);
      });
      lines.push(bar, ...footer(opts.notes?.hint ? CHECKLIST_KEYS_NOTES : CHECKLIST_KEYS, opts.retry, false, notice), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withKeys(prompt, flag, opts.retry);
  if (opts.notes) {
    const notes = opts.notes;
    let busy = false;
    // Runs before the prompt redraws, so the notice shows (or clears) right away.
    prompt.on("key", (char) => {
      const wasOpen = openFocused;
      notice = null;
      openFocused = null;
      if ((char === "o" || char === "O") && wasOpen) {
        wasOpen();
        return;
      }
      if ((char !== "n" && char !== "N") || busy) return;
      const value = opts.options[prompt.cursor]?.value;
      if (value === undefined) return;
      if (!notes.fits()) {
        notice = NOTES_TOO_SMALL;
        openFocused = () => notes.open(value);
        return;
      }
      busy = true;
      gate?.pause();
      void notes.show(value).finally(() => {
        busy = false;
        gate?.resume();
      });
    });
  }
  const result = await prompt.prompt().finally(() => gate?.dispose());
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
  opts: {
    message: string;
    hint?: string;
    options: ChoiceOption<T>[];
    initialValue?: T;
    /** Offer `n` (resolves NOTES); `notesHint` false leaves it out of the key hints (--hide-whats-new). */
    notes?: boolean;
    notesHint?: boolean;
  } & PromptIO,
): Promise<T | Escape | typeof RETRY | typeof RESCAN | typeof NOTES> {
  const flag: KeyFlags = { quit: false, retry: false };
  const prompt = new SelectPrompt<ChoiceOption<T>>({
    options: opts.options,
    ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
    ...(opts.input && { input: opts.input as never }),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const lines = header(this.state, opts.message, opts.hint);
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = opts.options[this.cursor]?.label ?? "";
        return closed(this.state, flag, opts.message, chosen);
      }
      opts.options.forEach((option, i) => {
        const focused = i === this.cursor;
        lines.push(`${bar}  ${focused ? tone.action(S_RADIO_ACTIVE) : tone.muted(S_RADIO_INACTIVE)} ${focused ? tone.focus(option.label) : tone.muted(option.label)}`);
      });
      lines.push(bar, ...footer(opts.notes && opts.notesHint !== false ? CHOOSE_KEYS_NOTES : CHOOSE_KEYS, opts.retry, opts.rescan), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withKeys(prompt, flag, opts.retry, opts.rescan, opts.notes);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
  if (flag.retry) return RETRY;
  if (flag.rescan) return RESCAN;
  if (flag.notes) return NOTES;
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
      const lines = header(this.state === "error" ? "active" : this.state, opts.message);
      if (this.state === "submit" || this.state === "cancel") {
        if (this.state === "submit") lines.push(`${bar}  ${tone.muted(this.value ?? "")}`);
        return lines.join("\n");
      }
      lines.push(`${bar}  ${this.userInputWithCursor}`);
      if (this.state === "error") lines.push(`${bar}  ${tone.action(this.error)}`);
      lines.push(bar, `${bar}  ${tone.muted(ASK_KEYS)}`, pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  const result = await prompt.prompt();
  return isCancel(result) ? CANCELLED : String(result ?? "");
}