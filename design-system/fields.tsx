import type {ComponentPropsWithRef} from 'react';

// unit shows a fixed suffix (e.g. "mm") inside the field, clear of the typed value and number spinner.
export function Input({className='',type='text',unit,...props}:ComponentPropsWithRef<'input'>&{unit?:string}){
  const input=<input {...props} type={type} className={`ds-input ds-input--${type}${unit?' ds-input--with-unit':''} ${className}`}/>;
  return unit?<span className="ds-input-unit">{input}<span className="ds-input-unit-label" aria-hidden="true">{unit}</span></span>:input;
}

export function Textarea({className='',...props}:ComponentPropsWithRef<'textarea'>){
  return <textarea {...props} className={`ds-textarea ${className}`}/>;
}
