// Generated-username scheme (Section 1 deferred requirement lands here).
//
// Derive a base handle from a person's name as: firstInitial + lastName,
// lowercased, with all non-alphanumerics stripped.
//   "Mario Gomez"        -> "mgomez"
//   "José  De La Cruz"    -> "jcruz"   (first initial + final token)
//   "Cher"               -> "cher"    (single token: use it whole)
// Collisions are resolved by the caller appending the smallest numeric suffix
// (mgomez -> mgomez2 -> mgomez3 …).

const NON_ALNUM = /[^a-z0-9]/g;

function clean(token: string): string {
  return token.toLowerCase().replace(NON_ALNUM, '');
}

// Produces the collision-free *base* (no numeric suffix). Returns '' only when
// the name has no usable alphanumeric characters; callers fall back to 'user'.
export function baseUsername(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return '';
  }
  if (tokens.length === 1) {
    return clean(tokens[0]);
  }
  const firstInitial = clean(tokens[0]).charAt(0);
  const lastName = clean(tokens[tokens.length - 1]);
  return firstInitial + lastName;
}

// Given a base and the set of already-taken usernames, return the first free
// candidate: the base itself, else base+2, base+3, … (matches the seed admin
// scheme of a bare base with numeric suffixes only on collision).
export function firstFreeUsername(
  base: string,
  taken: ReadonlySet<string>,
): string {
  const root = base || 'user';
  if (!taken.has(root)) {
    return root;
  }
  let suffix = 2;
  while (taken.has(`${root}${suffix}`)) {
    suffix += 1;
  }
  return `${root}${suffix}`;
}
