export const BACKUP: string;
export function restore(): boolean;
export function swap(): void;
export function findNpmAncestor(table: { pid: number; ppid: number; cmd: string }[], startPid: number): number | null;