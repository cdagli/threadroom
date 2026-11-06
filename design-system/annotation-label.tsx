import {Button,IconButton} from './button';
import {Icon} from './icon';

/** Compact, keyboard-accessible label for a warning attached to artwork. */
export function AnnotationLabel({title,severity,detail,openLabel,closeLabel,onOpen,onClose}:{title:string;severity:'check'|'fail';detail?:string;openLabel:string;closeLabel:string;onOpen:()=>void;onClose:()=>void}){
  return <div className="ds-annotation-label" data-severity={severity}>
    <Button variant="ghost" className="ds-annotation-open" aria-label={openLabel} title={openLabel} onClick={onOpen}>
      <Icon name="alert" size={16}/><span className="ds-annotation-title">{title}</span>{detail&&<span className="ds-annotation-detail">{detail}</span>}
    </Button>
    <IconButton variant="ghost" aria-label={closeLabel} title={closeLabel} onClick={onClose}><Icon name="close" size={14}/></IconButton>
  </div>;
}
