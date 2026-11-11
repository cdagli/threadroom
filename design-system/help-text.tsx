import type {ComponentPropsWithoutRef} from 'react';

export function HelpText({tone='muted',className='',...props}:ComponentPropsWithoutRef<'p'>&{tone?:'muted'|'soft'}){
  return <p {...props} className={`ds-help-text ds-help-text--${tone} ${className}`}/>;
}
