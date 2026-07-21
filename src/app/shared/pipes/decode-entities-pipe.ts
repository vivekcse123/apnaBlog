import { Pipe, PipeTransform } from '@angular/core';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

@Pipe({ name: 'decodeEntities', standalone: true, pure: true })
export class DecodeEntitiesPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return decodeHtmlEntities(value);
  }
}
