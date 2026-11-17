import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, FileText, X } from 'lucide-react';
import type { Source } from './types';

export function Disclosure({title, children}: {title: string; children: ReactNode}) {
  return <details className="disclosure"><summary>{title}<ChevronDown size={16} /></summary><div>{children}</div></details>;
}

export function Modal({title, close, children, className = ''}: {title: string; close: () => void; children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {ref.current?.showModal(); return () => {if (timer.current) clearTimeout(timer.current);};}, []);
  function dismiss() {
    if (timer.current) return;
    ref.current?.setAttribute('data-closing', 'true');
    timer.current = setTimeout(close, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
  }
  return <dialog ref={ref} className={className} aria-labelledby="dialog-title" onClick={e => {if (e.target === e.currentTarget) dismiss();}} onCancel={e => {e.preventDefault(); dismiss();}}><div className="modal-top"><div><h2 id="dialog-title">{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={dismiss}><X size={20} /></button></div>{children}</dialog>;
}

export function SourceCard({source, index, open, compact = false}: {source: Source; index: number; open: () => void; compact?: boolean}) {
  const type = source.kind === 'web' ? 'Web evidence' : source.kind === 'brief' ? 'Reading brief' : source.kind === 'note' ? 'Research note' : 'Paper / passage';
  return <button className={`source-card cover-${index % 4} ${compact ? 'compact' : ''}`} style={{'--stagger': `${index % 6 * 55}ms`} as CSSProperties} onClick={open}>
    <span className="paper-cover"><span className="cover-type">{type}</span><span className="cover-art" aria-hidden="true"><i/><i/><i/></span><span className="cover-title">{compact ? source.title.split(':')[0].split(' ')[0] : source.title.split(':')[0]}</span><span className="cover-bottom">{source.kind === 'note' ? <FileText size={17}/> : <BookOpen size={17}/>}<span>MEMORY LAB<br/>SOURCE {String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={18}/></span></span>
    <span className="source-card-info"><strong>{source.title}</strong><span>{compact ? type : source.embedding_status === 'ready' ? 'Semantic search ready' : 'Keyword search ready'}<span className="source-open">Read<ArrowUpRight size={13}/></span></span></span>
  </button>;
}

export {default as GraphMap} from './MemoryGraph';

export function PageTitle({label, title, text, children}: {label?: string; title: string; text?: string; children?: ReactNode}) {
  return <header className="page-heading"><div>{label && <span className="eyebrow">{label}</span>}<h1><span className="headline-line"><span>{title}</span></span></h1>{text && <p>{text}</p>}</div>{children}</header>;
}
