import { describe, it, expect } from 'vitest';
import { isInside } from '../src/shared/path-utils';

describe('isInside', () => {
  it('allows a file inside the root', () => {
    expect(isInside('C:\\proj', 'C:\\proj\\src\\a.ts')).toBe(true);
  });
  it('rejects a file outside the root', () => {
    expect(isInside('C:\\proj', 'C:\\other\\a.ts')).toBe(false);
  });
  it('rejects parent-traversal paths', () => {
    expect(isInside('C:\\proj', 'C:\\proj\\..\\evil.ts')).toBe(false);
  });
  it('treats root itself as inside', () => {
    expect(isInside('C:\\proj', 'C:\\proj')).toBe(true);
  });
});
