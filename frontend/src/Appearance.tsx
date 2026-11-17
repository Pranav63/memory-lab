import { Check, Sparkles } from 'lucide-react';
import { Modal } from './components';

export const THEMES = [
  {id: 'iris', name: 'Iris', description: 'Violet, porcelain & soft ink', colors: ['#6951c9','#c8b7f5','#e9e9fb','#222a43']},
  {id: 'lagoon', name: 'Lagoon', description: 'Teal, sea glass & deep ocean', colors: ['#267366','#a5dece','#e8f2ee','#18343e']},
  {id: 'ember', name: 'Ember', description: 'Terracotta, blush & warm ink', colors: ['#a75443','#e9b7a4','#f6ece7','#392b37']},
] as const;
export type Theme = typeof THEMES[number]['id'];
export function readAppearance(): {theme: Theme; motion: boolean; collapsed: boolean} {
  try {
    const value=JSON.parse(localStorage.getItem('memorylab.appearance') || '{}');
    return {theme: THEMES.some(t=>t.id===value?.theme)?value.theme:'iris', motion:value?.motion!==false, collapsed:value?.collapsed===true};
  } catch {return {theme:'iris',motion:true,collapsed:false};}
}

export default function Appearance({theme, choose, motion, setMotion, close}: {theme: Theme; choose: (theme: Theme)=>void; motion: boolean; setMotion: (on: boolean)=>void; close: ()=>void}) {
  return <Modal title="Make the lab feel like you." close={close} className="appearance-modal"><p className="appearance-intro">A little colour. A little movement. Your workspace, your pace.</p><div className="theme-options" aria-label="Colour theme">{THEMES.map(t=><button key={t.id} aria-label={`${t.name} theme`} aria-pressed={theme===t.id} className={`theme-option theme-${t.id}`} onClick={()=>choose(t.id)}><span className="theme-preview" aria-hidden="true"><i/><span><i/><i/><i/><i/></span></span><span className="theme-option-copy"><strong>{t.name}{theme===t.id&&<Check size={14}/>}</strong><small>{t.description}</small></span><span className="theme-swatches" aria-hidden="true">{t.colors.map(c=><i key={c} style={{background:c}}/>)}</span></button>)}</div><label className="appearance-motion"><span className="appearance-motion-icon"><Sparkles size={21}/></span><span><strong>Decorative motion</strong><small>Ambient graph movement and gentle transitions. Your system’s reduced-motion setting takes priority.</small></span><input type="checkbox" role="switch" aria-label="Decorative motion" checked={motion} onChange={e=>setMotion(e.target.checked)}/><span className="preference-switch" aria-hidden="true"/></label><p className="small-note">Changes apply immediately and are remembered in this browser.</p></Modal>;
}
