// One undo step per drag. end() returns the state before the drag once, and only if the drag
// changed it; a new begin() or a lost pointer-up must end the previous drag first.
export function dragHistory<T>() {
  let session:{before:T;latest:T}|null=null;
  return {
    get active(){return !!session;},
    begin(before:T){session={before,latest:before};},
    update(next:T){if(session)session.latest=next;},
    end():T|null{const s=session;session=null;return s&&s.latest!==s.before?s.before:null;},
    cancel():T|null{const s=session;session=null;return s?s.before:null;},
  };
}

// Only the latest move in a frame is applied. Flush before ending a drag so its last move
// belongs to that drag's undo step; cancel before restoring a cancelled drag.
export function frameQueue(request:(run:()=>void)=>number,cancel:(id:number)=>void){
  let frame:number|null=null,pending:(()=>void)|null=null;
  const flush=()=>{if(frame!==null)cancel(frame);frame=null;const run=pending;pending=null;run?.();};
  return {push(run:()=>void){pending=run;if(frame===null)frame=request(flush);},flush,cancel(){if(frame!==null)cancel(frame);frame=null;pending=null;}};
}
