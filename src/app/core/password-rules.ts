/**
 * The same password rules the server applies (PasswordPolicy), checked as you type so most problems show up before
 * saving. The server stays the final judge, e.g. for common words.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 64;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters with a letter and a number. Avoid common words, the company name and your own name or email.`;

/** Returns the first problem with the password, or null if it looks fine. */
export function passwordProblem(password: string, personal: (string | null | undefined)[] = []): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Use at most ${PASSWORD_MAX} characters.`;
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return 'Include at least one letter and one number.';
  }
  if (password !== password.trim()) {
    return "Don't start or end with a space.";
  }
  const lower = password.toLowerCase();
  if (new Set(lower).size < 5) {
    return 'It repeats the same few characters. Mix in more different ones.';
  }
  for (const part of personalParts(personal)) {
    if (lower.includes(part)) {
      return "Don't use your name or email in your password.";
    }
  }
  return null;
}

function personalParts(values: (string | null | undefined)[]): string[] {
  const parts: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const v = value.toLowerCase().split('@')[0];
    for (const piece of v.split(/[^\p{L}\p{N}]+/u)) {
      if (piece.length >= 3) {
        parts.push(piece);
      }
    }
  }
  return parts;
}
