import type { ToolDescriptor } from "../types";
import { aider } from "./aider";
import { amp } from "./amp";
import { antigravity } from "./antigravity";
import { claude } from "./claude";
import { cline } from "./cline";
import { codex } from "./codex";
import { copilot } from "./copilot";
import { cursor } from "./cursor";
import { firebase } from "./firebase";
import { gcloud } from "./gcloud";
import { gemini } from "./gemini";
import { gh } from "./gh";
import { goose } from "./goose";
import { kimi } from "./kimi";
import { kiro } from "./kiro";
import { netlify } from "./netlify";
import { npm } from "./npm";
import { opencode } from "./opencode";
import { qwen } from "./qwen";
import { supabase } from "./supabase";
import { vercel } from "./vercel";
import { vibe } from "./vibe";
import { wrangler } from "./wrangler";

/** All supported tools, in display order (grouped as AI agents, then Dev CLIs). Add a CLI by adding a descriptor here. */
export const registry: readonly ToolDescriptor[] = [
  // AI agents
  claude,
  codex,
  copilot,
  cursor,
  opencode,
  gemini,
  antigravity,
  qwen,
  kimi,
  aider,
  vibe,
  cline,
  amp,
  kiro,
  goose,
  // Dev CLIs
  firebase,
  gcloud,
  npm,
  wrangler,
  vercel,
  netlify,
  supabase,
  gh,
];