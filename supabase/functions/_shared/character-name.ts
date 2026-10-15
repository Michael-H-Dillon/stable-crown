const CHARACTER_TITLE_PREFIXES = [
  'Lord Commander', 'Lady Commander', 'Grand Maester', 'High Septon',
  'Archmaester', 'Commander', 'Princess', 'Prince', 'Duchess', 'Empress',
  'Emperor', 'Captain', 'General', 'Admiral', 'Maester', 'Septon', 'Septa',
  'Queen', 'King', 'Duke', 'Lady', 'Lord', 'Ser', 'Sir',
] as const;

const escapedPrefixes = CHARACTER_TITLE_PREFIXES
  .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  .join('|');
const leadingTitlePattern = new RegExp(`^(${escapedPrefixes})[,.]?\\s+(.+)$`, 'i');

const cleanList = (values: unknown) => Array.isArray(values)
  ? values.map(value => String(value).trim()).filter(Boolean).slice(0, 20)
  : [];

export function splitCharacterName(value: unknown): { name: string; titles: string[] } {
  let name = String(value || '').trim().replace(/\s+/g, ' ');
  const titles: string[] = [];
  for (let index = 0; index < 3; index++) {
    const match = name.match(leadingTitlePattern);
    if (!match) break;
    titles.push(match[1].replace(/\s+/g, ' '));
    name = match[2].trim();
  }
  return { name, titles };
}

export function characterIdentityKey(value: unknown): string {
  return splitCharacterName(value).name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalizeCharacterIdentity(name: unknown, nicknames?: unknown, titles?: unknown) {
  const split = splitCharacterName(name);
  const seen = new Set<string>();
  const mergedTitles = [...split.titles, ...cleanList(titles)].filter(title => {
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { name: split.name, nicknames: cleanList(nicknames), titles: mergedTitles.slice(0, 20) };
}
