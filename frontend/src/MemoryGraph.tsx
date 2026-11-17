import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, Focus, GitBranch, List, Minus, Network, Plus, Search, X } from 'lucide-react';
import type { Finding, Graph } from './types';

type Point = {x: number; y: number};
function labelFor(name: string, expanded: boolean) {const max=expanded?24:18;return name.length>max?name.slice(0,max-1)+'…':name;}
function widthFor(name: string, expanded: boolean) {return Math.max(155,Math.min(300,labelFor(name,expanded).length*(expanded?10:13)+75));}
function layout(nodes: Graph['nodes'], edges: Graph['edges'], expanded: boolean) {
  const points: Point[] = nodes.map((_, i) => ({x: 400 + Math.cos(i * 2.399) * (90 + Math.sqrt(i) * 85), y: 250 + Math.sin(i * 2.399) * (90 + Math.sqrt(i) * 65)}));
  if (nodes.length === 1) return [{x: 400, y: 250}];
  if (nodes.length === 2) return [{x: 240, y: 195}, {x: 560, y: 305}];
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  for (let step = 0; step < 100; step++) {
    const forces = points.map(p => ({x: (400-p.x)*.012, y: (250-p.y)*.012}));
    for (let i=0; i<points.length; i++) for (let j=i+1; j<points.length; j++) {
      const dx=points[i].x-points[j].x, dy=points[i].y-points[j].y, distance=Math.max(25, Math.hypot(dx,dy));
      const force=14000/(distance*distance);
      forces[i].x+=dx/distance*force; forces[i].y+=dy/distance*force;
      forces[j].x-=dx/distance*force; forces[j].y-=dy/distance*force;
    }
    for (const edge of edges) {
      const i=index.get(edge.source), j=index.get(edge.target); if (i===undefined || j===undefined || i===j) continue;
      const dx=points[j].x-points[i].x, dy=points[j].y-points[i].y, distance=Math.max(1,Math.hypot(dx,dy)), force=(distance-260)*.012;
      forces[i].x+=dx/distance*force; forces[i].y+=dy/distance*force;
      forces[j].x-=dx/distance*force; forces[j].y-=dy/distance*force;
    }
    points.forEach((p,i) => {p.x+=Math.max(-8,Math.min(8,forces[i].x));p.y+=Math.max(-8,Math.min(8,forces[i].y));});
  }
  // Keep cards and their connection captions apart after the topology settles.
  const widths=nodes.map(n=>widthFor(n.name,expanded));
  for (let step=0;step<100;step++) {
    let separated=false;
    for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
      const dx=points[j].x-points[i].x,dy=points[j].y-points[i].y;
      const overlapX=(widths[i]+widths[j])/2+30-Math.abs(dx),overlapY=105-Math.abs(dy);
      if (overlapX<=0 || overlapY<=0) continue;
      if (overlapX<overlapY) {const move=(overlapX+.1)/2*(dx<0?-1:1);points[i].x-=move;points[j].x+=move;}
      else {const move=(overlapY+.1)/2*(dy<0?-1:1);points[i].y-=move;points[j].y+=move;}
      separated=true;
    }
    if (!separated) break;
  }
  const centerX=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
  const centerY=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
  return points.map(p=>({x:p.x-centerX+400,y:p.y-centerY+250}));
}

export default function MemoryGraph({graph, expanded = false, findings = [], openSource}: {graph: Graph | null; expanded?: boolean; findings?: Finding[]; openSource?: (id: string) => void}) {
  const uid=useId().replaceAll(':','');
  const [compact,setCompact]=useState(()=>matchMedia('(max-width: 600px)').matches);
  useEffect(()=>{const media=matchMedia('(max-width: 600px)');const update=()=>setCompact(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const detailedLabels=expanded&&!compact;
  const canvasWidth=compact?500:800;
  const nodes=graph?.nodes || [], edges=graph?.edges || [];
  const points=useMemo(()=>layout(nodes,edges,detailedLabels),[nodes,edges,detailedLabels]);
  const byId=new Map(nodes.map((n,i)=>[n.id,points[i]]));
  const widest=Math.max(155,...nodes.map(n=>widthFor(n.name,detailedLabels)));
  const fit=Math.min(1,(compact?400:680)/(Math.max(...points.map(p=>p.x),400)-Math.min(...points.map(p=>p.x),400)+widest+40),350/(Math.max(...points.map(p=>p.y),250)-Math.min(...points.map(p=>p.y),250)+110));
  const [selected,setSelected]=useState('');
  const [query,setQuery]=useState('');
  const [view,setView]=useState('map');
  const [camera,setCamera]=useState({zoom:1,x:0,y:0});
  const moved=useRef(false);
  const drag=useRef<{x:number;y:number;panX:number;panY:number;scale:number}|null>(null);
  const zoom=camera.zoom*fit;
  const matches=new Set(nodes.filter(n=>n.name.toLowerCase().includes(query.toLowerCase())).map(n=>n.id));
  if (query) for (const e of edges) if (e.fact.toLowerCase().includes(query.toLowerCase())) {matches.add(e.source);matches.add(e.target);}
  const visible=nodes.filter(n=>!query || matches.has(n.id));
  const chosen=nodes.find(n=>n.id===selected);
  const facts=edges.filter(e=>e.source===selected || e.target===selected);
  const neighbours=new Set(facts.flatMap(e=>[e.source,e.target]));
  const degree=(id:string)=>edges.filter(e=>e.source===id || e.target===id).length;
  function choose(id:string) {
    setSelected(selected===id?'':id);
    if (expanded && nodes.length>10 && selected!==id) {const p=byId.get(id)!;setCamera({zoom:1/fit,x:400-p.x,y:250-p.y});}
  }
  function zoomBy(factor:number) {setCamera(c=>({...c,zoom:Math.max(.6,Math.min(4/fit,c.zoom*factor))}));}
  function search(value:string) {setQuery(value);setSelected('');setCamera({zoom:1,x:0,y:0});}
  function begin(e:PointerEvent<SVGSVGElement>) {
    moved.current=false;
    if (!expanded || (e.target as Element).closest('[data-entity]') || e.button!==0) return;
    const rect=e.currentTarget.getBoundingClientRect();
    drag.current={x:e.clientX,y:e.clientY,panX:camera.x,panY:camera.y,scale:Math.max(canvasWidth/rect.width,500/rect.height)/zoom};
    e.currentTarget.setPointerCapture(e.pointerId);moved.current=false;
  }
  function pan(e:PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
    if (Math.abs(dx)+Math.abs(dy)>3) moved.current=true;
    setCamera(c=>({...c,x:drag.current!.panX+dx*drag.current!.scale,y:drag.current!.panY+dy*drag.current!.scale}));
  }
  return <div className={`memory-network ${expanded?'network-expanded':'network-preview'}`}>
    {expanded && <div className="network-toolbar"><label className="network-search"><Search size={15}/><input aria-label="Search memory graph" value={query} onChange={e=>search(e.target.value)} placeholder="Find an entity or relationship…"/>{query && <button aria-label="Clear graph search" onClick={()=>search('')}><X size={14}/></button>}</label><div className="network-view" aria-label="Graph view"><button aria-pressed={view==='map'} onClick={()=>setView('map')}><Network size={14}/>Map</button><button aria-pressed={view==='list'} onClick={()=>setView('list')}><List size={14}/>List</button></div></div>}
    {nodes.length ? <div className={`network-body ${chosen ? 'network-inspecting' : 'network-browsing'}`}><div className="network-stage"><div className="network-aurora" aria-hidden="true"/>{view==='map' ? <><svg className="network-canvas" viewBox={`${400-canvasWidth/2} 0 ${canvasWidth} 500`} role="group" aria-label="Interactive memory graph" tabIndex={expanded?0:undefined} onPointerDown={begin} onPointerMove={pan} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const directions:Record<string,Point>={ArrowLeft:{x:30,y:0},ArrowRight:{x:-30,y:0},ArrowUp:{x:0,y:30},ArrowDown:{x:0,y:-30}};if(directions[e.key]){e.preventDefault();setCamera(c=>({...c,x:c.x+directions[e.key].x,y:c.y+directions[e.key].y}));}}}>
      <defs><pattern id={uid+'grid'} width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#9eaed0" opacity=".16"/></pattern><linearGradient id={uid+'edge'}><stop stopColor="#b5a0ff"/><stop offset="1" stopColor="#8be0c2"/></linearGradient><marker id={uid+'arrow'} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#96c9c6" strokeWidth="1.3"/></marker></defs><rect x={400-canvasWidth/2} width={canvasWidth} height="500" fill={`url(#${uid}grid)`}/>
      <g transform={`translate(400 250) scale(${zoom}) translate(${-400+camera.x} ${-250+camera.y})`} className="network-world">{edges.map(e=>{const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b||query&&(!matches.has(e.source)||!matches.has(e.target)))return null;const dx=b.x-a.x,dy=b.y-a.y,qx=(a.x+b.x)/2+dy*.15,qy=(a.y+b.y)/2-dx*.15,target=nodes.find(n=>n.id===e.target)!;const tangentX=b.x-qx,tangentY=b.y-qy,inset=Math.min((widthFor(target.name,detailedLabels)/2+7)/Math.max(.01,Math.abs(tangentX)),34/Math.max(.01,Math.abs(tangentY))),x=b.x-tangentX*inset,y=b.y-tangentY*inset;const active=selected===e.source||selected===e.target;return <path key={e.id} className={`network-link ${active?'link-selected':''}`} d={`M${a.x} ${a.y} Q${qx} ${qy} ${x} ${y}`} stroke={selected&&!active?'#45516d':`url(#${uid}edge)`} fill="none" strokeWidth={active?2.5:1.5} markerEnd={`url(#${uid}arrow)`} aria-hidden="true"/>;})}
      {nodes.map((n,i)=>{if(query&&!matches.has(n.id))return null;const p=points[i],connected=!selected||neighbours.has(n.id),active=n.id===selected,color=i%3===0?'#b8a3ff':i%3===1?'#8de2c3':'#ffd29d';const label=labelFor(n.name,detailedLabels),width=widthFor(n.name,detailedLabels);return <g key={n.id} data-entity={n.id} className={`network-entity ${active?'entity-selected':''}`} role="button" aria-label={`Inspect ${n.name}`} aria-pressed={active} tabIndex={0} onClick={()=>{if(!moved.current)choose(n.id);moved.current=false;}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(n.id);}}} transform={`translate(${p.x} ${p.y})`}><title>{n.name} · {degree(n.id)} relationships</title><rect className="entity-halo" x={-width/2-9} y="-36" width={width+18} height="72" rx="24" fill={color} opacity={active?.15:0}/><rect className="entity-card" x={-width/2} y="-27" width={width} height="54" rx="18" fill={active?'#303451':'#202c43'} stroke={active?color:connected?'#56617e':'#414b64'} strokeWidth={active?1.8:1}/><circle cx={-width/2+27} cy="0" r="13" fill={color} opacity=".16"/><circle cx={-width/2+27} cy="0" r="5.5" fill={color}/><text x={-width/2+49} y="6" fontSize={compact?26:detailedLabels?18:23} fontWeight="600" fill={connected?'#f0f3ff':'#b3c0d8'}>{label}</text><text textAnchor="middle" y="48" fontSize={compact?16:expanded?12:17} fill="#b3c0d8">{degree(n.id)} {degree(n.id)===1?'connection':'connections'}</text></g>;})}</g></svg>
      {expanded && <div className="network-zoom"><button aria-label="Zoom out graph" onClick={()=>zoomBy(.8)} disabled={camera.zoom<=.6}><Minus size={15}/></button><output aria-label="Graph zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in graph" onClick={()=>zoomBy(1.25)} disabled={zoom>=4}><Plus size={15}/></button><span/><button aria-label="Fit graph to view" onClick={()=>{setCamera({zoom:1,x:0,y:0});moved.current=false;}}><Focus size={16}/></button></div>}<div className="network-caption"><span><i/>{query?`${visible.length} matching entities`:'YOUR INDEXED CONNECTIONS'}</span>{expanded && <span>Drag to pan · select to inspect</span>}</div></> : <div className="network-entity-list">{visible.map((n,i)=><button key={n.id} aria-pressed={selected===n.id} onClick={()=>choose(n.id)}><span className={`entity-list-dot entity-color-${i%3}`}/><span><strong>{n.name}</strong><small>{degree(n.id)} {degree(n.id)===1?'relationship':'relationships'}</small></span><ArrowUpRight size={15}/></button>)}</div>}
      {query&&!visible.length && <div className="network-no-results"><Search size={25}/><strong>No connections match this search.</strong><button onClick={()=>search('')}>Show all entities</button></div>}
      {!expanded && <div className="network-chips">{nodes.slice(0,4).map(n=><button key={n.id} aria-pressed={selected===n.id} onClick={()=>choose(n.id)}>{n.name}</button>)}{nodes.length>4&&<span>+{nodes.length-4} entities</span>}</div>}</div>
      {chosen && <aside className="network-inspector" aria-label="Graph relationship details"><div className="inspector-heading"><span className="eyebrow">SELECTED ENTITY</span><button aria-label="Clear selected entity" onClick={()=>setSelected('')}><X size={15}/></button></div><h2>{chosen.name}</h2><span className="inspector-count"><GitBranch size={13}/>{facts.length} {facts.length===1?'relationship':'relationships'}</span><div className="inspector-facts">{facts.map((e,i)=>{const linked=nodes.find(n=>n.id===(e.source===selected?e.target:e.source));const origins=findings.filter(m=>m.episode_id&&e.episodes?.includes(m.episode_id));return <details key={e.id} open={i===0}><summary><span className="fact-direction">{e.source===selected?'OUTGOING':'INCOMING'}</span><strong>{linked?.name || 'Connected entity'}</strong><ChevronDown size={13}/></summary><div><p dir="auto">{e.fact}</p>{origins.map(m=><button className="graph-origin" key={m.id} onClick={()=>openSource?.(m.source_id)}><BookOpen size={13}/><span>{m.source_title}<small>Source of indexed finding</small></span><ArrowUpRight size={13}/></button>)}</div></details>;})}</div><p className="inspector-note">Extracted by Graphiti. Check the source before treating a relationship as established evidence.</p></aside>}</div> : <div className="network-empty"><div className="empty-network-orbits" aria-hidden="true"><i/><i/><i/><Network size={30}/></div><span className="eyebrow">{graph?.status==='unavailable'?'GRAPH UNAVAILABLE':'ROOM FOR A CONNECTION'}</span><h2>{graph?.status==='unavailable'?'Your graph is taking a pause.':'Connect the ideas you keep.'}</h2><p>{graph?.status==='unavailable'?graph.error:'Index a saved finding to reveal real entities and relationships. Your sources stay linked to the evidence.'}</p></div>}
  </div>;
}
