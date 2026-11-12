'use client';
import {useState} from 'react';
import {Button,EmptyState,HelpText,Icon,Input,SelectionCard} from '@/design-system';
import {filterLibraryAssets,libraryCategories,libraryDragType,type LibraryAsset,type LibraryCategoryId} from '@/lib/library';
import {libraryAssets} from '@/lib/library-assets';
import {designBounds,objectGeometry} from '@/lib/editor-render';
import {isFillKind} from '@/lib/project';
import {useT} from './i18n';

export default function LibraryPanel({disabled,onInsert}:{disabled:boolean;onInsert:(asset:LibraryAsset)=>void}){
  const {t,lang,formatNumber}=useT(),[categoryId,setCategoryId]=useState<LibraryCategoryId>(),[query,setQuery]=useState('');
  const matches=filterLibraryAssets(libraryAssets,{categoryId,query}),category=libraryCategories.find(c=>c.id===categoryId);
  const searching=!!query.trim();
  return <section className="library-panel" aria-label={t('Design library')}>
    <HelpText>{t('Choose an item to add it to your design, or drag it onto the hoop.')}</HelpText>
    <label className="library-search">{t('Search library')}<Input type="search" value={query} placeholder={t('Search shapes and motifs')} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="library-categories" role="group" aria-label={t('Library categories')}>
      <Button variant="ghost" className="library-all" aria-pressed={!categoryId} onClick={()=>setCategoryId(undefined)}>{t('All items')}<span>{formatNumber(libraryAssets.length)}</span></Button>
      {libraryCategories.map(c=><SelectionCard key={c.id} aria-pressed={categoryId===c.id} onClick={()=>setCategoryId(c.id)} preview={<Icon name={c.icon}/>} label={t(c.name)} detail={t('library.items.other',{count:libraryAssets.filter(a=>a.categoryId===c.id).length})}/>)}
    </div>
    <div className="library-results-heading"><h2>{category?t(category.name):t('All items')}</h2><span aria-live="polite">{t('library.items.other',{count:matches.length})}</span></div>
    {disabled&&<HelpText tone="soft">{t('Finish your current drawing before adding a library item.')}</HelpText>}
    {matches.length>0?<div className="library-items">{matches.map(asset=><SelectionCard layout="tile" key={asset.id} disabled={disabled} draggable={!disabled} label={asset.name[lang]} preview={<LibraryPreview asset={asset}/>} aria-label={t('Add {name} to design',{name:asset.name[lang]})} title={t('Add {name} to design',{name:asset.name[lang]})}
      onClick={()=>onInsert(asset)} onDragStart={e=>{if(disabled){e.preventDefault();return;}e.dataTransfer.setData(libraryDragType,asset.id);e.dataTransfer.effectAllowed='copy';}}/>)}</div>:<EmptyState icon={<Icon name={searching?'search':category?.icon??'library'}/>} title={t(searching?'No matching library items':category?'This category is empty':'Your library is taking shape')} description={t(searching?'Try another search or choose a different category.':'Shapes and motifs will appear here as they are added to the library.')}>
      {(searching||categoryId)&&<Button variant="secondary" onClick={()=>{setCategoryId(undefined);setQuery('');}}>{t('Show all categories')}</Button>}
    </EmptyState>}
  </section>;
}

function LibraryPreview({asset}:{asset:LibraryAsset}){
  const box=designBounds(asset.design.objects),pad=Math.max(box.width,box.height)*.1||1;
  return <svg viewBox={`${box.x-pad} ${box.y-pad} ${box.width+2*pad} ${box.height+2*pad}`} aria-hidden="true">{asset.design.objects.filter(o=>!o.hidden&&!o.layoutOnly).map(o=><path key={o.id} d={objectGeometry(o).path} fill={isFillKind(o.kind)?o.color:'none'} fillRule={o.fillRule??'evenodd'} stroke={isFillKind(o.kind)?'none':o.color} strokeWidth={Math.max(pad*.15,.2)}/>)}</svg>;
}
