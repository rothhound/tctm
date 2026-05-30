import { customAlphabet } from 'nanoid';

/**
 * Primary-key generator for all DB rows: 8-char, lowercase-alphanumeric (base36).
 * Short and URL-friendly (e.g. "gsqd3utt") so task ids read well in deep links.
 * App-generated rather than DB-side so ids are portable and known before insert.
 */
export const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
