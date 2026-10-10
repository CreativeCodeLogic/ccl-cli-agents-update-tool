import { isCancel, MultiSelectPrompt, SelectPrompt } from "@clack/core";
import { S_BAR, S_BAR_END, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT } from "@clack/prompts";
import pc from "picocolors";
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

export interface PromptIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export interface ChecklistOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
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

/** Wire `q` to a soft quit on any core prompt; `flag.quit` tells render and caller apart from Esc/Ctrl+C. */
function withQuit(prompt: { on(event: "key", cb: (char: string | undefined) => void): void; state: string }, flag: { quit: boolean }): void {
  prompt.on("key", (char) => {
    if (char === "q" || char === "Q") {
      flag.quit = true;
      prompt.state = "cancel";
    }
  });
}

/** Closed-prompt lines: a soft quit reads as a calm "quit", Esc/Ctrl+C as cancelled. */
function closed(state: string, quit: boolean, message: string, text: string): string {
  if (state === "cancel") return (quit ? [...header("submit", message), `${bar}  ${tone.muted("quit")}`] : header(state, message)).join("\n");
  return [...header(state, message), `${bar}  ${tone.muted(text)}`].join("\n");
}

/** Multi-select: selected = amber filled box, unselected = dim empty box, focused row = bold label. */
export async function checklist<T extends string>(
  opts: { message: string; hint?: string; options: ChecklistOption<T>[]; initialValues: T[] } & PromptIO,
): Promise<T[] | Escape> {
  const flag = { quit: false };
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
        return closed(this.state, flag.quit, opts.message, picked.length > 0 ? picked.join(", ") : "nothing selected");
      }
      opts.options.forEach((option, i) => {
        const selected = value.includes(option.value);
        const box = selected ? tone.action(S_CHECKBOX_SELECTED) : tone.muted(S_CHECKBOX_INACTIVE);
        const label = i === this.cursor ? tone.focus(option.label) : selected ? option.label : tone.muted(option.label);
        lines.push(`${bar}  ${box} ${label}${option.hint ? `  ${tone.muted(option.hint)}` : ""}`);
      });
      lines.push(bar, `${bar}  ${tone.muted(CHECKLIST_KEYS)}`, pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withQuit(prompt, flag);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
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
): Promise<T | Escape> {
  const flag = { quit: false };
  const prompt = new SelectPrompt<ChoiceOption<T>>({
    options: opts.options,
    ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
    ...(opts.input && { input: opts.input as never }),
    ...(opts.output && { output: opts.output as never }),
    render() {
      const lines = header(this.state, opts.message, opts.hint);
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = opts.options[this.cursor]?.label ?? "";
        return closed(this.state, flag.quit, opts.message, chosen);
      }
      opts.options.forEach((option, i) => {
        const focused = i === this.cursor;
        lines.push(`${bar}  ${focused ? tone.action(S_RADIO_ACTIVE) : tone.muted(S_RADIO_INACTIVE)} ${focused ? tone.focus(option.label) : tone.muted(option.label)}`);
      });
      lines.push(bar, `${bar}  ${tone.muted(CHOOSE_KEYS)}`, pc.gray(S_BAR_END));
      return lines.join("\n");
    },
  });
  withQuit(prompt, flag);
  const result = await prompt.prompt();
  if (flag.quit) return QUIT;
  if (isCancel(result)) return CANCELLED;
  return result as T;
}