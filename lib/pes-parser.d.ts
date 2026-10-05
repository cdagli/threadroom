import type {Command} from './project';
export function parse(data: ArrayBuffer | Uint8Array, filename?: string): {
  name: string; commands: Command[]; blocks: {color: string; name: string; stitches: number}[];
  bounds: {minX: number; minY: number; maxX: number; maxY: number};
  width: number; height: number; stitches: number; jumps: number; trims: number; colorChanges: number;
  warnings: string[];
};
