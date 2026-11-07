import { describe, expect, it } from 'vitest';
import {
  createRegistrationSchema,
  updateRegistrationSchema,
} from '../../src/modules/registrations/validators/index.js';
import { normalizePhone, csvCell } from '../../src/modules/registrations/utils/index.js';

describe('registration input and CSV', () => {
  const base = {
    fullName: 'أحمد محمد',
    phone: '01000000000',
    targetType: 'lecture',
    targetId: '0123456789abcdef01234567',
    privacyConsent: true,
  };
  it.each(['01000000000', '+20 100 000 0000', '00201000000000', '٠١٠٠٠٠٠٠٠٠٠'])(
    'normalizes Egyptian phone %s',
    (phone) => {
      expect(normalizePhone(phone)).toBe('+201000000000');
      expect(createRegistrationSchema.parse({ ...base, phone }).phone).toBe('+201000000000');
    },
  );
  it.each([
    { phone: '123' },
    { phone: 'Call 01000000000' },
    { privacyConsent: false },
    { targetId: 'bad' },
    { targetType: 'article' },
    { lecture: '0123456789abcdef01234567' },
    { status: 'confirmed' },
    { email: 'bad' },
  ])('rejects invalid registration %#', (extra) => {
    expect(createRegistrationSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it('keeps email optional and rejects arbitrary administrative fields', () => {
    expect(createRegistrationSchema.parse(base).email).toBeUndefined();
    expect(updateRegistrationSchema.safeParse({ status: 'made-up' }).success).toBe(false);
    expect(updateRegistrationSchema.safeParse({ fullName: 'changed' }).success).toBe(false);
    expect(updateRegistrationSchema.safeParse({}).success).toBe(false);
  });
  it.each(['=SUM(1,2)', '+201000000000', '-1+1', '@SUM(A1)', ' \t=1+1', '\r=1', '\uFEFF=1'])(
    'neutralizes CSV formula %s',
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );
  it('quotes Arabic, newlines and embedded quotes', () => {
    expect(csvCell('أحمد,"محمد"\nعلي')).toBe('"أحمد,""محمد""\nعلي"');
  });
});
