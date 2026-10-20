import { isCancel, MultiSelectPrompt, SelectPrompt, TextPrompt } from "@clack/core";
import { S_BAR, S_BAR_END, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT } from "@clack/prompts";
import pc from "./colors";
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

export interface PromptIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** Offer `r` = retry (footer "· r retry"); the prompt then resolves RETRY. */
  retry?: boolean;
}

interface KeyFlags {
  quit: boolean;
  retry: boolean;
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

/** Header shared by both prompts; a blank gutter line separates the hint from the options. */
function header(state: string, message: string, hint?: string): string[] {
  const symbol =
    state === "submit" ? tone.done(S_STEP_SUBMIT) : state === "cancel" ? tone.bad(S_STEP_CANCEL) : tone.action(S_STEP_ACTIVE);
  const lines = [bar, `${symbol}  ${message}`];
  if (hint && state !== "submit" && state !== "cancel") lines.push(`${bar}  ${tone.muted(hint)}`, bar);
  return lines;
}

/**
 * Wire `q` (soft quit) and, when offered, `r` (retry) on any core prompt; the
 * flags tell render and caller apart from Esc/Ctrl+C.
 */
function withKeys(prompt: { on(event: "key", cb: (char: string | undefined) => void): void; state: string }, flag: KeyFlags, retry = false): void {
  prompt.on("key", (char) => {
    if (char === "q" || char === "Q") {
      flag.quit = true;
      prompt.state = "cancel";
    } else if (retry && (char === "r" || char === "R")) {
      flag.retry = true;
      prompt.state = "cancel";
    }
  });
}

/** Closed-prompt lines: a soft quit or retry reads calmly, Esc/Ctrl+C as cancelled. */
function closed(state: string, flag: KeyFlags, message: string, text: string): string {
  if (state === "cancel") {
    const calm = flag.quit ? "quit" : flag.retry ? "retry" : null;
    return (calm ? [...header("submit", message), `${bar}  ${tone.muted(calm)}`] : header(state, message)).join("\n");
  }
  return [...header(state, message), `${bar}  ${tone.muted(text)}`].join("\n");
}

const footer = (keys: string, retry?: boolean) => `${bar}  ${tone.muted(retry ? `${keys} · r retry` : keys)}`;

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
      lines.push(bar, footer(CHECKLIST_KEYS, opts.retry), pc.gray(S_BAR_END));
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
): Promise<T | Escape | typeof RETRY> {
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
      lines.push(bar, footer(CHOOSE_KEYS, opts.retry), pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withKeys(prompt, flag, opts.retry);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
  if (flag.retry) return RETRY;
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