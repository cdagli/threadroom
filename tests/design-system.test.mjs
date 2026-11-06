import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {loadDesignSystem} from './load-design-system.mjs';

const {Button,IconButton}=loadDesignSystem('button');
const {Input}=loadDesignSystem('fields');
const {Select}=loadDesignSystem('select');
const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props));

test('Actions preserve native form, popover, ARIA and disabled behavior',()=>{
  const button=render(Button,{children:'Arrange',popoverTarget:'order','aria-expanded':false});
  assert.match(button,/type="button"/);
  assert.match(button,/popover[tT]arget="order"/);
  assert.match(button,/aria-expanded="false"/);
  assert.doesNotMatch(button,/disabled/);
  const busy=render(Button,{children:'Export',loading:true});
  assert.match(busy,/disabled=""/);
  assert.match(busy,/aria-busy="true"/);
  assert.match(busy,/aria-hidden="true"/);
  assert.match(render(Button,{type:'submit',disabled:true,children:'Save'}),/type="submit" disabled=""/);
  const ref={current:null};
  assert.equal(Button({ref,children:'Save'}).props.ref,ref);
  assert.match(render(IconButton,{'aria-label':'Delete',children:'×'}),/aria-label="Delete"/);
});

test('Fields retain native control types, names and validation',()=>{
  assert.match(render(Input,{type:'number',name:'spacing',min:.1,step:.05,required:true,defaultValue:.4}),/type="number"/);
  assert.match(render(Input,{type:'checkbox',defaultChecked:true,disabled:true}),/checked=""/);
  assert.match(render(Select,{name:'units',disabled:true,children:createElement('option',{value:'mm'},'mm')}),/name="units" disabled=""/);
});

test('Select preserves native selection, form props, refs and listbox behavior',()=>{
  const options=[createElement('option',{key:'A4',value:'A4'},'A4'),createElement('option',{key:'Letter',value:'Letter',disabled:true},'Letter')];
  const html=render(Select,{name:'paper',form:'worksheet',required:true,value:'A4',onChange:()=>{},controlSize:'sm','aria-label':'Paper size',children:options});
  assert.match(html,/name="paper"/);
  assert.match(html,/form="worksheet"/);
  assert.match(html,/required=""/);
  assert.match(html,/value="A4" selected=""/);
  assert.match(html,/value="Letter" disabled=""/);
  assert.match(html,/ds-select--sm/);
  assert.doesNotMatch(html,/controlSize=/);
  const ref={current:null},onChange=()=>{};
  const element=Select({ref,onChange,children:options});
  assert.equal(element.props.ref,ref);
  assert.equal(element.props.onChange,onChange);
  const listbox=render(Select,{multiple:true,size:4,defaultValue:['Letter'],children:options});
  assert.match(listbox,/multiple="" size="4"/);
  assert.match(listbox,/ds-select--listbox/);
  assert.match(listbox,/value="Letter" disabled="" selected=""/);
});

test('Editor controls use the shared design-system boundary',()=>{
  const native=new Set(['button','input','select','textarea','dialog']);
  const files=readdirSync(new URL('../app/',import.meta.url),{recursive:true}).filter(file=>file.endsWith('.tsx'));
  const violations=[];
  for(const file of files){
    const source=ts.createSourceFile(file,readFileSync(new URL(`../app/${file}`,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node){
      if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&native.has(node.tagName.getText(source)))violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}`);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  assert.deepEqual(violations,[],'Native controls belong in design-system/; compose shared components in app/.');
});

test('Agent status is a polite plain-text live region with semantic tones',()=>{
  const {StatusBar}=loadDesignSystem('status-bar');
  const html=render(StatusBar,{label:'AI agent',text:'<img src=x onerror=alert(1)>',tone:'working'});
  assert.match(html,/role="status"/);assert.match(html,/aria-live="polite"/);assert.match(html,/ds-spinner/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  assert.match(render(StatusBar,{label:'AI agent',text:'Failed',tone:'error'}),/data-tone="error"/);
  assert.doesNotMatch(render(StatusBar,{label:'AI agent',text:'Done',tone:'done'}),/ds-spinner/);
});
