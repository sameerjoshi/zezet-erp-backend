import { baseUsername, firstFreeUsername } from './username.util';

describe('baseUsername', () => {
  it('derives firstInitial + lastName, lowercased', () => {
    expect(baseUsername('Mario Gomez')).toBe('mgomez');
  });

  it('uses the final token as the last name for multi-part names', () => {
    expect(baseUsername('José De La Cruz')).toBe('jcruz');
  });

  it('strips non-alphanumerics', () => {
    expect(baseUsername("O'Brien  Smith")).toBe('osmith');
    expect(baseUsername('Anne-Marie  Díaz')).toBe('adaz');
  });

  it('returns the whole token for a single name', () => {
    expect(baseUsername('Cher')).toBe('cher');
  });

  it('returns empty string when there is nothing usable', () => {
    expect(baseUsername('   ')).toBe('');
    expect(baseUsername('!!! @@@')).toBe('');
  });
});

describe('firstFreeUsername', () => {
  it('returns the base when free', () => {
    expect(firstFreeUsername('mgomez', new Set())).toBe('mgomez');
  });

  it('appends the smallest numeric suffix on collision', () => {
    expect(firstFreeUsername('mgomez', new Set(['mgomez']))).toBe('mgomez2');
    expect(
      firstFreeUsername('mgomez', new Set(['mgomez', 'mgomez2', 'mgomez3'])),
    ).toBe('mgomez4');
  });

  it('skips taken suffixes but reuses gaps', () => {
    expect(firstFreeUsername('mgomez', new Set(['mgomez', 'mgomez3']))).toBe(
      'mgomez2',
    );
  });

  it("falls back to 'user' for an empty base", () => {
    expect(firstFreeUsername('', new Set())).toBe('user');
    expect(firstFreeUsername('', new Set(['user']))).toBe('user2');
  });
});
