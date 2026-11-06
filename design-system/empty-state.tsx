import type {ReactNode} from 'react';

export function EmptyState({icon,title,description,children,hint}:{icon:ReactNode;title:string;description:string;children:ReactNode;hint?:string}) {
  return <div className="ds-empty-state">
    <span className="ds-empty-state-icon" aria-hidden="true">{icon}</span>
    <h2>{title}</h2>
    <p>{description}</p>
    <div className="ds-empty-state-actions">{children}</div>
    {hint&&<small>{hint}</small>}
  </div>;
}
