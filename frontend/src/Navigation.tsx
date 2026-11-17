import {useLayoutEffect, useRef} from 'react';
import type {ReactNode} from 'react';

export default function Navigation({active, label, className, children}: {active: string; label: string; className?: string; children: ReactNode}) {
  const root=useRef<HTMLElement>(null);
  const track=useRef<HTMLSpanElement>(null);
  function place(button: Element | null) {
    if (!(button instanceof HTMLButtonElement) || !root.current?.contains(button) || !track.current) return;
    const style=track.current.style;
    style.width=button.offsetWidth+'px'; style.height=button.offsetHeight+'px';
    style.transform=`translate(${button.offsetLeft}px,${button.offsetTop}px)`;
  }
  function restore() {
    const focused=root.current?.contains(document.activeElement)?document.activeElement:null;
    place(focused?.closest('button') || root.current?.querySelector('[aria-current]') || null);
  }
  useLayoutEffect(()=>{
    const nav=root.current;
    if (!nav) return;
    place(nav.querySelector('[aria-current]'));
    const frame=requestAnimationFrame(()=>nav.setAttribute('data-nav-ready','true'));
    const resize=new ResizeObserver(()=>place(nav.querySelector('[aria-current]')));
    resize.observe(nav);
    let disposed=false;
    document.fonts.ready.then(()=>{if(!disposed)place(nav.querySelector('[aria-current]'));});
    return ()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();};
  },[active]);
  return <nav ref={root} className={className} aria-label={label}
    onPointerOver={e=>{if(e.pointerType==='mouse')place((e.target as Element).closest('button'));}}
    onPointerLeave={restore} onFocusCapture={e=>place(e.target.closest('button'))}
    onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))place(e.currentTarget.querySelector('[aria-current]'));}}>
    <span ref={track} className="nav-track" aria-hidden="true"/>{children}
  </nav>;
}
