const SPAM_PHRASES = ["viagra", "crypto giveaway", "seo services", "backlinks", "casino", "loan offer"];

/** Cheap heuristic score. A score of 5 or more is quarantined as spam. */
export function spamScore(input: { name: string; message: string }): number {
  const text = input.message.toLowerCase();
  let score = 0;
  const links = (text.match(/https?:\/\//g) ?? []).length;
  if (links >= 3) score += 3;
  else if (links >= 1) score += 1;
  if (/https?:\/\//i.test(input.name)) score += 3;
  const letters = input.message.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 30 && upper / letters.length > 0.7) score += 2;
  if (SPAM_PHRASES.some((phrase) => text.includes(phrase))) score += 3;
  if (/(.)\1{9,}/.test(input.message)) score += 2;
  return score;
}

export const SPAM_THRESHOLD = 5;
