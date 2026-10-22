export interface SecretFinding { file: string; line: number; kind: string }
export function scanText(text: string, filename: string): SecretFinding[];
export function scanFiles(directory: string): SecretFinding[];
export function main(args?: string[]): number;
