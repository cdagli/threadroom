import type {ComponentPropsWithRef} from 'react';

export type SelectProps=ComponentPropsWithRef<'select'>&{
  /** Visual size; the native `size` prop still controls listbox rows. */
  controlSize?:'sm'|'md'|'lg';
};

// Keep the native select for labels, keyboard navigation, forms and mobile pickers.
export function Select({className='',controlSize='md',multiple,size,...props}:SelectProps){
  const listbox=multiple||(size!==undefined&&size>1);
  return <select {...props} multiple={multiple} size={size} className={`ds-select ds-select--${controlSize}${listbox?' ds-select--listbox':''} ${className}`}/>;
}
