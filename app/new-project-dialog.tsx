'use client';
import {useState} from 'react';
import {Button,Modal,Select} from '@/design-system';
import {fabrics,hoops,type Fabric} from '@/lib/project';
import {useT} from './i18n';

const hoopOrder=Object.entries(hoops).sort(([,a],[,b])=>a.width*a.height-b.width*b.height);
// Previews keep each hoop's proportions; the longest side grows with hoop size but small hoops stay legible.
function HoopPreview({width,height}:{width:number;height:number}){
  const long=20+36*Math.min(1,Math.max(0,(Math.max(width,height)-60)/240)),k=long/Math.max(width,height),w=width*k,h=height*k,x=(64-w)/2,y=(48-h)/2;
  return <svg className="hoop-preview" viewBox="0 0 64 48" aria-hidden="true">
    <rect x={x-2} y={y-2} width={w+4} height={h+4} rx="4" fill="var(--hoop-rim)"/>
    <rect x={x} y={y} width={w} height={h} rx="2.5" fill="var(--fabric)" stroke="var(--hoop-border)" strokeWidth=".75"/>
    <path d={`M${32-2.5} 24h5M32 ${24-2.5}v5`} stroke="var(--centre-cross)" strokeWidth=".75"/>
  </svg>;
}

// New projects need a hoop; the fabric is optional and defaults to woven cotton.
export function NewProjectDialog({busy,error,onCreate,onClose}:{busy:boolean;error?:string;onCreate:(hoop:string,fabric:Fabric)=>void;onClose:()=>void}){
  const {t}=useT(),[hoop,setHoop]=useState<string|null>(null),[fabric,setFabric]=useState<Fabric>('woven'),profile=fabrics[fabric];
  return <Modal title={t('New project')} onClose={onClose}>
    <fieldset className="new-project-field">
      <legend>{t('Hoop')}</legend>
      <div className="new-project-hoops" role="group" aria-label={t('Hoop')}>
        {hoopOrder.map(([key,h])=><Button key={key} variant="item" className="ds-choice-card" type="button" aria-pressed={hoop===key} disabled={busy} onClick={()=>setHoop(key)}>
          <HoopPreview width={h.width} height={h.height}/>
          <span>{t(h.label)}</span>
        </Button>)}
      </div>
    </fieldset>
    <label>{t('Fabric')} <span className="optional">{t('(optional)')}</span><Select value={fabric} disabled={busy} onChange={e=>setFabric(e.target.value as Fabric)}>{Object.entries(fabrics).map(([key,f])=><option key={key} value={key}>{t(f.label)}</option>)}</Select></label>
    <p>{t('Stabilizer:')} {t(profile.stabilizer)} {t('· Topping:')} {t(profile.topping)}</p>
    {error&&<p role="alert">{error}</p>}
    <div className="io-actions">
      <Button variant="primary" loading={busy} disabled={!hoop||busy} title={hoop?undefined:t('Choose a hoop first')} onClick={()=>{if(hoop)onCreate(hoop,fabric);}}>{t('Create project')}</Button>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{t('Cancel')}</Button>
    </div>
  </Modal>;
}
