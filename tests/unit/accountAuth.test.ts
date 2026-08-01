import { describe, expect, it } from 'vitest';
import {
  accountIdToAuthEmail,
  isValidAccountId,
  normalizeAccountId,
} from '../../src/services/accountAuth';

describe('account authentication mapping', () => {
  it('normalizes account names without exposing a user email address', () => {
    expect(normalizeAccountId('  Student_01  ')).toBe('student_01');
    expect(accountIdToAuthEmail('student_01')).toBe(
      'u_73747564656e745f3031@accounts.my-emotion-map.app',
    );
  });

  it('accepts only bounded account identifiers', () => {
    expect(isValidAccountId('student-01')).toBe(true);
    expect(isValidAccountId('ab')).toBe(false);
    expect(isValidAccountId('student@example.com')).toBe(false);
    expect(isValidAccountId('student account')).toBe(false);
  });
});
