/* PES/PEC decoding informed by EmbroidePy/pyembroidery (MIT).
 * See THIRD-PARTY-NOTICES.md. Coordinates in these files are tenths of a mm.
 * This reader uses the embedded PEC stream, including in newer PES versions.
 */
(function (global) {
  'use strict';
  const palette = [
    ['Unknown','#777777'],['Prussian Blue','#0e1f7c'],['Blue','#0a55a3'],['Teal Green','#008777'],
    ['Cornflower Blue','#4b6baf'],['Red','#ed171f'],['Reddish Brown','#d15c00'],['Magenta','#913697'],
    ['Light Lilac','#e49acb'],['Lilac','#915fac'],['Mint Green','#9ed67d'],['Deep Gold','#e8a900'],
    ['Orange','#feba35'],['Yellow','#ffff00'],['Lime Green','#70bc1f'],['Brass','#ba9800'],
    ['Silver','#a8a8a8'],['Russet Brown','#7d6f00'],['Cream Brown','#ffffb3'],['Pewter','#4f5556'],
    ['Black','#000000'],['Ultramarine','#0b3d91'],['Royal Purple','#770176'],['Dark Gray','#293133'],
    ['Dark Brown','#2a1301'],['Deep Rose','#f64a8a'],['Light Brown','#b27624'],['Salmon Pink','#fcbbc5'],
    ['Vermilion','#fe370f'],['White','#f0f0f0'],['Violet','#6a1c8a'],['Seacrest','#a8ddc4'],
    ['Sky Blue','#2584bb'],['Pumpkin','#feb343'],['Cream Yellow','#fff36b'],['Khaki','#d0a660'],
    ['Clay Brown','#d15400'],['Leaf Green','#66ba49'],['Peacock Blue','#134a46'],['Gray','#878787'],
    ['Warm Gray','#d8ccc6'],['Dark Olive','#435607'],['Flesh Pink','#fdd9de'],['Pink','#f993bc'],
    ['Deep Green','#003822'],['Lavender','#b2afd4'],['Wisteria Violet','#686ab0'],['Beige','#efe3b9'],
    ['Carmine','#f73866'],['Amber Red','#b54b64'],['Olive Green','#132b1a'],['Dark Fuchsia','#c70156'],
    ['Tangerine','#fe9e32'],['Light Blue','#a8deeb'],['Emerald Green','#00673e'],['Purple','#4e2990'],
    ['Moss Green','#2f7e20'],['Flesh Pink','#ffcccc'],['Harvest Gold','#ffd911'],['Electric Blue','#095ba6'],
    ['Lemon Yellow','#f0f970'],['Fresh Green','#e3f35b'],['Orange','#ff9900'],['Cream Yellow','#fff08d'],
    ['Applique','#ffc8c8'],
  ];
  function parsePES(input, filename = 'Untitled.pes') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Please choose a file smaller than 20 MB.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = new TextDecoder();
    const need = (at, count) => {
      if (at < 0 || at + count > bytes.length) throw new Error('This embroidery file is incomplete or damaged.');
    };
    need(0, 12);
    const signature = text.decode(bytes.subarray(0,8));
    if (!/^#PES\d{4}$/.test(signature) && signature !== '#PEC0001') {
      throw new Error('This is not a PES or PEC embroidery file.');
    }
    const offset = signature === '#PEC0001' ? 8 : view.getUint32(8, true);
    if (offset < (signature === '#PEC0001' ? 8 : 12)) throw new Error('Invalid embroidery data offset.');
    need(offset, 528);
    if (text.decode(bytes.subarray(offset,offset+3)) !== 'LA:') throw new Error('The file has no readable PEC stitch data.');
    const label = text.decode(bytes.subarray(offset+3,offset+19)).trim();
    const warnings = [];
    let customThreads = [], metadata = {}, p = 16;
    const bounded = (count) => {
      if (p + count > offset) throw new Error('Invalid PES metadata.');
      need(p,count);
    };
    const str = () => { bounded(1); const n = bytes[p++]; bounded(n); const s = text.decode(bytes.subarray(p,p+n)); p += n; return s; };
    const skip = n => { bounded(n); p += n; };
    const u16 = () => { bounded(2); const n = view.getUint16(p,true); p += 2; return n; };
    const version = signature.slice(4);
    // Metadata is optional: a valid PEC stream can still be viewed if the richer
    // PES header has unsupported programmable fills or a malformed thread chart.
    try {
      if (['0040','0050','0055','0056','0060','0070','0080','0090','0100'].includes(version)) {
        for (const key of ['name','category','author','keywords','comments']) metadata[key] = str();
        if (version !== '0040') {
          if (['0090','0100'].includes(version)) { skip(14); metadata.hoop = str(); skip(version === '0090' ? 30 : 38); }
          else skip(['0050','0055','0056'].includes(version) ? 24 : version === '0080' ? 38 : 36);
          metadata.image = str();
          skip(['0090','0100'].includes(version) ? 34 : version === '0080' ? 26 : 24);
          const fills = u16();
          if (fills || u16() || u16()) throw new Error('Programmable pattern metadata');
          const count = u16();
          if (count > 256) throw new Error('Too many thread records');
          for (let i = 0; i < count; i++) {
            const catalog = str(); bounded(3);
            const color = '#' + [...bytes.subarray(p,p+3)].map(n=>n.toString(16).padStart(2,'0')).join(''); p += 3;
            skip(5);
            customThreads.push({catalog,color,name:str(),brand:str(),chart:str()});
          }
        }
      }
    } catch { customThreads = []; warnings.push('Using the standard Brother palette; the extended thread chart could not be read.'); }
    const changes = bytes[offset+48];
    const count = changes === 255 ? 0 : changes+1;
    if (!count) throw new Error('This file has no thread blocks.');
    need(offset+49,count);
    const indices = [...bytes.subarray(offset+49,offset+49+count)];
    let threads;
    if (customThreads.length >= count) threads = customThreads.slice(0,count);
    else if (customThreads.length) {
      const map = new Map(); let next = 0;
      threads = indices.map(i => {
        if (!map.has(i)) map.set(i,customThreads[next++] || {name:palette[i%65][0],color:palette[i%65][1],catalog:String(i),brand:'Brother'});
        return map.get(i);
      });
    } else threads = indices.map(i => ({name:palette[i%65][0],color:palette[i%65][1],catalog:String(i),brand:'Brother'}));
    if (!customThreads.length) warnings.push('Thread colors use the Brother PEC palette and may differ from your original artwork.');
    const size = bytes[offset+514] | (bytes[offset+515]<<8) | (bytes[offset+516]<<16);
    const end = offset+512+size;
    if (size < 18 || end > bytes.length) throw new Error('The stitch block is truncated or invalid.');
    const headerWidth = view.getUint16(offset+520,true)/10;
    const headerHeight = view.getUint16(offset+522,true)/10;
    const commands = [], blocks = threads.map((thread,i) => ({...thread,index:i,stitches:0,start:0,end:0}));
    p = offset+528;
    let x = 0, y = 0, block = 0, stitches = 0, jumps = 0, trims = 0, stops = 0, colorChanges = 0, ended = false;
    const bounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    const include = (a,b) => { bounds.minX=Math.min(bounds.minX,a); bounds.maxX=Math.max(bounds.maxX,a); bounds.minY=Math.min(bounds.minY,b); bounds.maxY=Math.max(bounds.maxY,b); };
    const byte = () => { if (p >= end) throw new Error('The stitch stream ends unexpectedly.'); return bytes[p++]; };
    const signed = (n,bits) => n & (1<<(bits-1)) ? n-(1<<bits) : n;
    while (p < end) {
      if (commands.length > 1_000_000) throw new Error('This file has too many stitches to preview.');
      const first = byte();
      // Ink/Stitch/pyembroidery writes a single FF at the end of the bounded
      // stitch block; other writers append 00. Neither consumes bitmap bytes.
      if (first === 255 && (p === end || bytes[p] === 0)) { ended = true; break; }
      const second = byte();
      if (first === 254 && second === 176) {
        byte(); blocks[block].end = commands.length;
        if (++block >= blocks.length) throw new Error('Thread changes exceed the file’s thread chart.');
        const isStop = blocks[block].color === blocks[block-1].color;
        if (isStop) stops++; else colorChanges++;
        commands.push({type:isStop?'stop':'color',x,y,block});
        blocks[block].start = commands.length;
        continue;
      }
      let flags = 0, xb, yfirst = second;
      if (first & 128) { flags |= first & 48; xb=signed(((first&15)<<8)|second,12); yfirst=byte(); }
      else xb = signed(first,7);
      let yb;
      if (yfirst & 128) { flags |= yfirst & 48; yb=signed(((yfirst&15)<<8)|byte(),12); }
      else yb=signed(yfirst,7);
      const fromX=x, fromY=y; x+=xb/10; y+=yb/10;
      const type = flags ? 'jump' : 'stitch';
      if (flags & 32) trims++;
      if (flags) jumps++;
      else { stitches++; blocks[block].stitches++; include(fromX,fromY); include(x,y); }
      commands.push({type,x,y,fromX,fromY,block,trim:!!(flags&32)});
    }
    if (!ended) throw new Error('The file is missing its end-of-design marker.');
    if (!stitches) throw new Error('This file contains no sewn stitches.');
    blocks[block].end = commands.length;
    if (block+1 !== count) warnings.push('Some thread records are unused by the stitch stream.');
    return {filename,signature,label,name:metadata.name||label||filename,metadata,commands,
      blocks:blocks.slice(0,block+1),bounds,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY,
      headerWidth,headerHeight,stitches,jumps,trims,stops,colorChanges,warnings,
      colorSource:customThreads.length?'PES thread chart':'Brother PEC palette'};
  }
  global.PES = {parse:parsePES,palette};
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PES;
})(globalThis);
