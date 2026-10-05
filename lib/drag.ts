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
