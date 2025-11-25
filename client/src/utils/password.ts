export interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
  typeCount: number;
  allChecksPass: boolean;
  strength: number; // 0-5
}

export function getPasswordChecks(password: string): PasswordChecks {
  const length = !!password && password.length >= 8;
  const uppercase = /[A-Z]/.test(password || '');
  const lowercase = /[a-z]/.test(password || '');
  const number = /[0-9]/.test(password || '');
  const symbol = /[^A-Za-z0-9]/.test(password || '');
  const typeCount = [uppercase, lowercase, number, symbol].filter(Boolean).length;
  const allChecksPass = length && typeCount >= 2;
  const strength = length ? (1 + typeCount) : 0;
  return { length, uppercase, lowercase, number, symbol, typeCount, allChecksPass, strength };
}

export function isPasswordValid(password: string): boolean {
  return getPasswordChecks(password).allChecksPass;
}
