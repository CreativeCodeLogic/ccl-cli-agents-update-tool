export function extractSnippet(markdown: string, name: string): string;
export function parseCron(snippet: string): { path: string; schedule: string; command: string };
export function parsePlist(snippet: string): { command: string; path: string };
export function localize(text: string, where: { prefix: string; home: string }): string;
export function checkLog(text: string, runs: number): string[];
