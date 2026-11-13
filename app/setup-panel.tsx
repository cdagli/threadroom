'use client';
import {Button,HelpText,Input,Section,Select,SubSection} from '@/design-system';
import {fabrics,hoops,lockLimits,lockNames,withFabric,type Fabric,type Lock,type Locks,type Project} from '@/lib/project';
import {backgroundLook} from '@/lib/thread';
import {backgroundPresets,textiles,type CanvasBackground} from '@/lib/canvas-background';
import type {ViewSettings} from '@/lib/view-settings';
import {ViewControls} from './editing-controls';
import {OverlayControls} from './stitch-overlays';
import {SewingSpeed} from './worksheet';
import {useT} from './i18n';

type Props={project:Project;disabled:boolean;view:ViewSettings;onView:(patch:Partial<ViewSettings>)=>void;onProject:(project:Project)=>void;onHoop:(hoop:string)=>void;onLocks:(patch:Partial<Locks>,merge?:string)=>void;onTrim:(value:number)=>void;onShortcuts:()=>void};

export default function SetupPanel({project,disabled,view,onView,onProject,onHoop,onLocks,onTrim,onShortcuts}:Props){
  const {t}=useT(),fabric=fabrics[project.fabric];
  const background=project.background,preset=background?String(backgroundPresets.findIndex(p=>p.background.textile===background.textile&&p.background.color===background.color)):'auto';
  const effectiveBackground:CanvasBackground=background??{textile:({woven:'cotton',gauze:'gauze',jersey:'jersey',rib:'rib',fleece:'felt',terry:'terry',denim:'denim'} as const)[project.fabric],color:backgroundLook(project.fabric).base};
  const setBackground=(patch:Partial<CanvasBackground>)=>onProject({...project,background:{...effectiveBackground,...patch}});
  const lockOptions=Object.entries(lockNames).map(([key,label])=><option key={key} value={key}>{t(label)}</option>);
  return <section className="panel-section setup-panel">
    <HelpText>{t('Choose your hoop and fabric. You can leave the other settings as they are to get started.')}</HelpText>
    <div className="setup-basics">
      <label htmlFor="setup-hoop">{t('Hoop')}<Select id="setup-hoop" disabled={disabled} value={project.hoop} aria-describedby="setup-hoop-help" onChange={e=>onHoop(e.target.value)}>{Object.entries(hoops).map(([key,h])=><option key={key} value={key}>{t(h.label)}</option>)}</Select></label>
      <HelpText id="setup-hoop-help">{t('Use the size of the hoop attached to your machine.')}</HelpText>
      <label htmlFor="setup-fabric">{t('Fabric')}<Select id="setup-fabric" disabled={disabled} value={project.fabric} aria-describedby="setup-fabric-help" onChange={e=>onProject(withFabric(project,e.target.value as Fabric))}>{Object.entries(fabrics).map(([key,f])=><option key={key} value={key}>{t(f.label)}</option>)}</Select></label>
      <HelpText id="setup-fabric-help">{t('Stitch defaults adapt to the fabric you choose.')}</HelpText>
    </div>
    <HelpText tone="soft"><strong>{t('Suggested fabric support')}</strong><br/>{t('Stabilizer:')} {t(fabric.stabilizer)}<br/>{t('Topping:')} {t(fabric.topping)}</HelpText>
    <HelpText>{t('Machine')}: {t('Brother PR1X')}</HelpText>
    <Section id="setup-background" title={t('Canvas background')}>
      <HelpText>{t('Saved with this design. Changes the preview and PNG background, not stitch settings.')}</HelpText>
      <label>{t('Background preset')}<Select disabled={disabled} value={preset} onChange={e=>{const value=e.target.value;if(value==='auto'){const next={...project};delete next.background;onProject(next);}else if(value!=='-1')onProject({...project,background:{...backgroundPresets[Number(value)].background}});}}>
        <option value="auto">{t('Follow sewing fabric')}</option>
        {backgroundPresets.map((p,i)=><option key={p.name} value={i}>{t(p.name)}</option>)}
        {preset==='-1'&&<option value="-1">{t('Custom background')}</option>}
      </Select></label>
      <div className="setting-grid">
        <label>{t('Textile')}<Select disabled={disabled} value={effectiveBackground.textile} onChange={e=>setBackground({textile:e.target.value as CanvasBackground['textile']})}>{Object.entries(textiles).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</Select></label>
        <label>{t('Fabric colour')}<Input type="color" disabled={disabled} value={effectiveBackground.color} onChange={e=>setBackground({color:e.target.value})}/></label>
      </div>
    </Section>
    <Section id="setup-view" title={t('View settings')}>
      <ViewControls value={view} onChange={onView}/>
    </Section>
    <Section id="setup-stitch-details" title={t('Stitch details')}>
      <HelpText>{t('Show thread movements and needle points on the canvas. These options only change the preview.')}</HelpText>
      <OverlayControls value={view} onChange={onView}/>
    </Section>
    <Section id="setup-advanced" title={t('Advanced sewing settings')}>
      <HelpText>{t('These defaults suit most designs. Change them only when you need a different sewing speed or thread finish.')}</HelpText>
      <fieldset className="setup-sewing" disabled={disabled}>
        <SewingSpeed project={project} onChange={onProject}/>
        <HelpText>{t('Used to estimate sewing time.')}</HelpText>
        <SubSection title={t('Start & finish')}>
          <HelpText>{t('Small locking stitches secure the thread at the start and end of each section.')}</HelpText>
          <div className="setting-grid setup-locks">
            <label>{t('Tie-in')}<Select value={project.locks.tieIn} onChange={e=>onLocks({tieIn:e.target.value as Lock})}>{lockOptions}</Select></label>
            <label>{t('Tie-off')}<Select value={project.locks.tieOff} onChange={e=>onLocks({tieOff:e.target.value as Lock})}>{lockOptions}</Select></label>
          </div>
          <label>{t('Lock size · mm')}<Input type="number" min={lockLimits.size[0]} max={lockLimits.size[1]} step=".1" value={project.locks.lockSize} onChange={e=>{const n=e.target.valueAsNumber;if(n>=lockLimits.size[0]&&n<=lockLimits.size[1])onLocks({lockSize:n},'lockSize');}}/></label>
        </SubSection>
        <SubSection title={t('Thread trimming')}>
          <label>{t('Trim jumps longer than · mm')}<Input type="number" min={lockLimits.trim[0]} max={lockLimits.trim[1]} step=".5" value={project.trimJump} aria-describedby="setup-trim-help" onChange={e=>{const n=e.target.valueAsNumber;if(n>=lockLimits.trim[0]&&n<=lockLimits.trim[1])onTrim(n);}}/></label>
          <HelpText id="setup-trim-help">{t('Shorter jumps sew as one stitch only where later stitches cover it; over bare fabric, moves longer than 1 mm are trimmed')}</HelpText>
        </SubSection>
      </fieldset>
    </Section>
    <Button variant="link" className="setup-shortcuts" onClick={onShortcuts}>{t('Keyboard shortcuts')} (?)</Button>
  </section>;
}
