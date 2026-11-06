import type {ComponentPropsWithRef} from 'react';

export function Input({className='',type='text',...props}:ComponentPropsWithRef<'input'>){
  return <input {...props} type={type} className={`ds-input ds-input--${type} ${className}`}/>;
}

export function Textarea({className='',...props}:ComponentPropsWithRef<'textarea'>){
  return <textarea {...props} className={`ds-textarea ${className}`}/>;
}
