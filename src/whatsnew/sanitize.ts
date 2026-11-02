/*
 * Release notes come from third parties: before anything is drawn, every
 * character that could control the terminal is removed, so hostile notes
 * render as harmless plain text:
 * - escape sequences: CSI (ESC [ ...), OSC (ESC ] ... BEL/ST, e.g. title changes
 *   and OSC 8 hyperlinks), DCS/SOS/PM/APC strings, and two-character ESC codes;
 * - their 8-bit forms and every other C1 control (U+0080-U+009F);
 * - every C0 control except newline and tab (CR is folded into newlines);
 * - bidi embedding, override and isolate characters (U+202A-U+202E,
 *   U+2066-U+2069), which can make text read differently than it is.
 */

const ESC = "\u001b";
const STRING_SEQUENCE = new RegExp(`${ESC}[P\\]X^_][\\s\\S]*?(?:\u0007|${ESC}\\\\|$)`, "g"); // DCS, OSC, SOS, PM, APC
const C1_STRING = /[\u0090\u009d\u0098\u009e\u009f][\s\S]*?(?:\u0007|\u009c|$)/g;
const CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]?`, "g");
const C1_CSI = /\u009b[0-?]*[ -/]*[@-~]?/g;
const ESC_OTHER = new RegExp(`${ESC}[ -/]*[0-~]?`, "g");
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;

export function sanitize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(STRING_SEQUENCE, "")
    .replace(C1_STRING, "")
    .replace(CSI, "")
    .replace(C1_CSI, "")
    .replace(ESC_OTHER, "")
    .replace(CONTROLS, "")
    .replace(BIDI, "");
}