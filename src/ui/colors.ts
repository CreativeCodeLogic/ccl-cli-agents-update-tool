import picocolors from "picocolors";
import { colorsOffForOutput } from "../utils/unattended";

/** picocolors, with colors off whenever stdout is not a terminal (see colorsOffForOutput). */
const pc = colorsOffForOutput(process.env, Boolean(process.stdout.isTTY), process.argv) ? picocolors.createColors(false) : picocolors;

export default pc;
