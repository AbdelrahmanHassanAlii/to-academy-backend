import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
export const REGISTRATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'attended'] as const;
export const registrationTransitions: Record<
  (typeof REGISTRATION_STATUSES)[number],
  readonly string[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'attended'],
  cancelled: ['pending', 'confirmed'],
  attended: [],
};
export function normalizePhone(raw: string): string | undefined {
  const ascii = raw
    .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 0x6f0))
    .trim();
  const value = ascii.startsWith('00') ? '+' + ascii.slice(2) : ascii;
  if (!/^\+?[\d ()-]+$/.test(value)) return undefined;
  const phone = parsePhoneNumberFromString(value, { defaultCountry: 'EG', extract: false });
  return phone?.isValid() && !phone.ext ? phone.number : undefined;
}
export function csvCell(raw: string): string {
  const safe =
    /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(raw) || /^[\t\r\n]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function isDuplicateRegistration(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
