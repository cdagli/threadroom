import {Icon} from './icon';

export function LoadingState({label,title}:{label:string;title?:string}) {
  return <div className="ds-loading-state" role="status">
    <span className="ds-loading-mark" aria-hidden="true"><span className="ds-spinner"/><Icon name="needle" size={24}/></span>
    {title&&<strong>{title}</strong>}
    <span>{label}</span>
  </div>;
}
