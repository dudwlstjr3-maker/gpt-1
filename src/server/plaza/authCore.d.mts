export function signToken(payload: Record<string, unknown>, secret: string): string;
export function verifyToken(token: unknown, secret: string | null, now?: number): Record<string, unknown> | null;
export function accountKey(provider: string, subject: string, secret: string): string;
export function randomState(): string;
export function safeNext(next: unknown): string;
