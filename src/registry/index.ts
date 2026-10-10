import type { ToolDescriptor } from "../types";
import { antigravity } from "./antigravity";
import { claude } from "./claude";
import { codex } from "./codex";
import { copilot } from "./copilot";
import { cursor } from "./cursor";
import { firebase } from "./firebase";
import { gcloud } from "./gcloud";
import { gemini } from "./gemini";
import { kimi } from "./kimi";
import { npm } from "./npm";
import { opencode } from "./opencode";
import { qwen } from "./qwen";

/** All supported tools, in display order. Add a CLI by adding a descriptor here. */
export const registry: readonly ToolDescriptor[] = [
  claude,
  codex,
  copilot,
  cursor,
  opencode,
  gemini,
  antigravity,
  qwen,
  kimi,
  firebase,
  gcloud,
  npm,
];