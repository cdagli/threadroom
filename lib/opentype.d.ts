declare module 'opentype.js' {
  import type {FontLike} from './text';
  export type Font = FontLike & {numGlyphs:number;names:{fontFamily?:Record<string,string>;fontSubfamily?:Record<string,string>};tables:{os2?:{sCapHeight?:number;usWeightClass?:number;fsSelection?:number}}};
  export function parse(buffer:ArrayBuffer):Font;
}
