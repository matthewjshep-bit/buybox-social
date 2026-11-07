// How an agent's phone for clients is kept and shown. Plain helpers with no
// client or server marker, so a form, a link and a dashboard page can all use them.

export const phoneDigits = (value: string) => value.replace(/\D/g, "");

// A real number with its area code: 10 to 15 digits.
export const isContactPhone = (digits: string) => digits.length >= 10 && digits.length <= 15;

// "(206) 555-0142" for a US number; anything else as its digits.
export function formatPhone(value: string) {
  const digits = phoneDigits(value);
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (us.length !== 10) return digits;
  return `${digits.length === 11 ? "+1 " : ""}(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}
