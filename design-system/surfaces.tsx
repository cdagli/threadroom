import type {ComponentPropsWithRef} from 'react';

export function Toolbar({className='',role='toolbar',...props}:ComponentPropsWithRef<'div'>){
  return <div {...props} role={role} className={`ds-toolbar ${className}`}/>;
}

export function ToolbarDivider(){
  return <span className="ds-toolbar-divider" aria-hidden="true"/>;
}

export function SegmentedControl({className='',role='group',...props}:ComponentPropsWithRef<'div'>){
  return <div {...props} role={role} className={`ds-segmented ${className}`}/>;
}

export function Popover({className='',popover='auto',...props}:ComponentPropsWithRef<'div'>){
  return <div {...props} popover={popover} className={`ds-popover ${className}`}/>;
}

// Native element and ref are preserved for showModal(), focus management and printing.
export function Dialog({className='',...props}:ComponentPropsWithRef<'dialog'>){
  return <dialog {...props} className={`ds-dialog ${className}`}/>;
}
