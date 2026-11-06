export type StatusTone='working'|'done'|'error';

// Text children are escaped by React; the live region stays mounted while its message changes.
export function StatusBar({text,label,tone='working'}:{text:string;label:string;tone?:StatusTone}){
  return <div className="ds-status-bar" data-tone={tone} role="status" aria-live="polite" aria-atomic="true">
    {text&&<><span className={tone==='working'?'ds-spinner':'ds-status-dot'} aria-hidden="true"/><span className="ds-status-label">{label}</span><span>{text}</span></>}
  </div>;
}
