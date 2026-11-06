// Four-connected grid cells, largest first. Input is never mutated.
export function maskComponents(mask:Uint8Array,width:number):number[][]{
  const seen=new Uint8Array(mask.length),parts:number[][]=[];
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||seen[start])continue;
    const cells=[start];seen[start]=1;
    for(let head=0;head<cells.length;head++){
      const k=cells[head],x=k%width;
      const visit=(n:number)=>{if(n>=0&&n<mask.length&&mask[n]&&!seen[n]){seen[n]=1;cells.push(n);}};
      if(x)visit(k-1);if(x<width-1)visit(k+1);visit(k-width);visit(k+width);
    }
    parts.push(cells);
  }
  return parts.sort((a,b)=>b.length-a.length);
}
