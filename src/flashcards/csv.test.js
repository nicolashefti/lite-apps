import { describe, it, expect } from 'vitest';
import { parseCSV } from './csv.js';

describe('parseCSV', () => {
  describe('delimiter detection', () => {
    it('parses comma-separated files', () => {
      expect(parseCSV('a,b\nfoo,bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('parses semicolon-separated files (Numbers/iOS export)', () => {
      expect(parseCSV('a;b\nfoo;bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('prefers semicolon when both appear but semicolons win in header', () => {
      // "front;back" has 1 semicolon, 0 commas → semicolon wins
      expect(parseCSV('front;back\nhello;world')).toEqual([{ front: 'hello', back: 'world' }]);
    });
  });

  describe('header row detection', () => {
    const HEADER_WORDS = ['front', 'back', 'question', 'answer', 'term', 'definition', 'a', 'b'];

    for (const word of HEADER_WORDS) {
      it(`skips header row starting with "${word}"`, () => {
        expect(parseCSV(`${word},col2\nfoo,bar`)).toEqual([{ front: 'foo', back: 'bar' }]);
      });
    }

    it('is case-insensitive for header detection', () => {
      expect(parseCSV('Front,Back\nfoo,bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('does not skip first row when it is not a recognised header', () => {
      expect(parseCSV('hello,world\nfoo,bar')).toEqual([
        { front: 'hello', back: 'world' },
        { front: 'foo', back: 'bar' },
      ]);
    });
  });

  describe('quoted fields', () => {
    it('handles quoted fields containing the delimiter', () => {
      expect(parseCSV('"hello, world",answer')).toEqual([{ front: 'hello, world', back: 'answer' }]);
    });

    it('handles quoted fields containing semicolons in a semicolon file', () => {
      expect(parseCSV('"hello; world";answer')).toEqual([{ front: 'hello; world', back: 'answer' }]);
    });

    it('unescapes doubled quotes inside quoted fields', () => {
      expect(parseCSV('"say ""hi""",answer')).toEqual([{ front: 'say "hi"', back: 'answer' }]);
    });

    it('handles quoted fields containing newlines', () => {
      expect(parseCSV('"line1\nline2",back')).toEqual([{ front: 'line1\nline2', back: 'back' }]);
    });
  });

  describe('line endings', () => {
    it('handles LF line endings', () => {
      expect(parseCSV('a,b\nfoo,bar\nbaz,qux')).toEqual([
        { front: 'foo', back: 'bar' },
        { front: 'baz', back: 'qux' },
      ]);
    });

    it('handles CRLF line endings', () => {
      expect(parseCSV('a,b\r\nfoo,bar\r\nbaz,qux')).toEqual([
        { front: 'foo', back: 'bar' },
        { front: 'baz', back: 'qux' },
      ]);
    });

    it('handles CR-only line endings', () => {
      expect(parseCSV('a,b\rfoo,bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('ignores trailing newline', () => {
      expect(parseCSV('a,b\nfoo,bar\n')).toEqual([{ front: 'foo', back: 'bar' }]);
    });
  });

  describe('filtering', () => {
    it('returns empty array for empty input', () => {
      expect(parseCSV('')).toEqual([]);
    });

    it('skips rows with fewer than two columns', () => {
      expect(parseCSV('a,b\nonly-one\nfoo,bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('skips rows where both columns are blank', () => {
      expect(parseCSV('a,b\n,\nfoo,bar')).toEqual([{ front: 'foo', back: 'bar' }]);
    });

    it('keeps rows where only one column is blank', () => {
      expect(parseCSV('front,blank\nfoo,')).toEqual([{ front: 'foo', back: '' }]);
    });

    it('ignores columns beyond the second', () => {
      expect(parseCSV('a,b\nfoo,bar,extra,ignored')).toEqual([{ front: 'foo', back: 'bar' }]);
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace from fields', () => {
      expect(parseCSV('  foo  ,  bar  ')).toEqual([{ front: 'foo', back: 'bar' }]);
    });
  });
});
