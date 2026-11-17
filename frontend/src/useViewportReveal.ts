import {useEffect} from 'react';
import type {RefObject} from 'react';

const TARGETS='.source-grid>.source-card,.recent-sources>.source-card,.recent-heading,.import-banner,.finding-card,.web-result,.studio-formats>button,.artifact-shelf>button,.landscape-panel,.model-comparison';

export default function useViewportReveal(page: RefObject<HTMLDivElement | null>, pageKey: string, motion: boolean) {
  useEffect(()=>{
    const root=page.current, reduced=matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || !motion || reduced.matches || !('IntersectionObserver' in window)) return;
    const prepared=new WeakSet<Element>();
    const observer=new IntersectionObserver(entries=>{
      for (const entry of entries) if(entry.isIntersecting) {
        (entry.target as HTMLElement).dataset.reveal='shown'; observer.unobserve(entry.target);
      }
    },{threshold:.06,rootMargin:'0px 0px -20px 0px'});
    function prepare() {
      if (reduced.matches) return;
      root!.querySelectorAll<HTMLElement>(TARGETS).forEach((element,i)=>{
        if (prepared.has(element)) return;
        prepared.add(element);
        // Content already in view stays visible; only upcoming blocks are armed.
        if (element.getBoundingClientRect().top<innerHeight) return;
        element.dataset.reveal='pending';
        element.style.setProperty('--reveal-delay',`${i%3*55}ms`);
        observer.observe(element);
      });
    }
    function showFocused(event: Event) {
      const element=(event.target as Element).closest<HTMLElement>('[data-reveal="pending"]');
      if(element) {element.dataset.reveal='shown';observer.unobserve(element);}
    }
    function clear() {
      observer.disconnect();
      root!.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element=>{
        delete element.dataset.reveal; element.style.removeProperty('--reveal-delay');
      });
    }
    const changes=new MutationObserver(prepare);
    changes.observe(root,{childList:true,subtree:true});
    root.addEventListener('focusin',showFocused); reduced.addEventListener('change',clear);
    prepare();
    return ()=>{changes.disconnect();root.removeEventListener('focusin',showFocused);reduced.removeEventListener('change',clear);clear();};
  },[page,pageKey,motion]);
}
