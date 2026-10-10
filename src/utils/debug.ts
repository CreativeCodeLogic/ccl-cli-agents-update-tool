/** Diagnostics to stderr when CCL_CAUT_DEBUG is set; silent otherwise. */
export function debug(message: string): void {
  if (process.env.CCL_CAUT_DEBUG) process.stderr.write(`[ccl-caut] ${message}\n`);
}
