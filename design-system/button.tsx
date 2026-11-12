import type {ComponentPropsWithRef,ReactNode} from 'react';

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

export function SelectionCard({label,detail,preview,layout='row',className='',...props}:Omit<ButtonProps,'variant'|'children'>&{label:string;detail?:string;preview:ReactNode;layout?:'row'|'tile'}){
  return <Button {...props} variant="item" className={`ds-selection-card ds-selection-card--${layout} ${className}`}>
    <span className="ds-selection-card-preview" aria-hidden="true">{preview}</span>
    <span className="ds-selection-card-copy"><span>{label}</span>{detail&&<small>{detail}</small>}</span>
  </Button>;
}

// `compact` is for dense, long menus such as the canvas context menu.
export function MenuItem({className='',compact=false,...props}:ButtonProps&{compact?:boolean}){
  return <Button variant="ghost" size={compact?'sm':undefined} {...props} className={`ds-menu-item${compact?' ds-menu-item--compact':''} ${className}`}/>;
}
