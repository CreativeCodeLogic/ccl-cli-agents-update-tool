/** Diagnostics to stderr when CCL_AUT_DEBUG is set; silent otherwise. */
export function debug(message: string): void {
  if (process.env.CCL_AUT_DEBUG) process.stderr.write(`[ccl-aut] ${message}\n`);
}
