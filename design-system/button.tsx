import type {ComponentPropsWithRef} from 'react';

export type ButtonProps=ComponentPropsWithRef<'button'>&{
  variant?:'primary'|'secondary'|'ghost'|'soft'|'danger'|'link'|'item'|'swatch';
  size?:'sm'|'md'|'lg'|'xl';
  loading?:boolean;
};

export function Button({variant='secondary',size='md',loading=false,disabled,type='button',className='',children,...props}:ButtonProps){
  return <button {...props} type={type} disabled={disabled||loading} aria-busy={loading||props['aria-busy']} className={`ds-button ds-button--${variant} ds-button--${size} ${className}`}>
    {loading&&<span className="ds-spinner" aria-hidden="true"/>}{children}
  </button>;
}

export type IconButtonProps=Omit<ButtonProps,'aria-label'>&{'aria-label':string};
export function IconButton({variant='ghost',className='',...props}:IconButtonProps){
  return <Button {...props} variant={variant} className={`ds-button--icon ${className}`}/>;
}

export function ToolButton({className='',...props}:ButtonProps){
  return <Button variant="ghost" size="xl" {...props} className={`ds-button--tool ${className}`}/>;
}

// A content-rich choice with a leading preview and a label.
export function SelectionRow({className='',...props}:Omit<ButtonProps,'variant'>){
  return <Button {...props} variant="item" className={`ds-selection-row ${className}`}/>;
}

// `compact` is for dense, long menus such as the canvas context menu.
export function MenuItem({className='',compact=false,...props}:ButtonProps&{compact?:boolean}){
  return <Button variant="ghost" size={compact?'sm':undefined} {...props} className={`ds-menu-item${compact?' ds-menu-item--compact':''} ${className}`}/>;
}
