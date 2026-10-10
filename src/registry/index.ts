import type { ToolDescriptor } from "../types";
import { claude } from "./claude";
import { codex } from "./codex";
import { firebase } from "./firebase";
import { gcloud } from "./gcloud";
import { gemini } from "./gemini";
import { kimi } from "./kimi";
import { npm } from "./npm";

/** All supported tools, in display order. Add a CLI by adding a descriptor here. */
export const registry: readonly ToolDescriptor[] = [claude, codex, gemini, kimi, firebase, gcloud, npm];
