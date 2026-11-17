import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = worker;

export default function PdfReader({url, title}: {url: string; title: string}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const task = getDocument({url});
    task.promise.then(pdf => {if (active) setDocument(pdf);}).catch(() => {if (active) setError('This PDF could not be rendered. Try importing its full text instead.');});
    return () => {active = false; void task.destroy();};
  }, [url]);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    setRendering(true); setError('');
    async function render() {
      try {
        const pdfPage = await document!.getPage(page);
        if (!active || !canvas.current || !text.current) return;
        const viewport = pdfPage.getViewport({scale: Math.max(240, width - 36) / pdfPage.getViewport({scale: 1}).width * zoom});
        const pixelRatio = Math.min(devicePixelRatio || 1, 2);
        canvas.current.width = Math.floor(viewport.width * pixelRatio);
        canvas.current.height = Math.floor(viewport.height * pixelRatio);
        canvas.current.style.width = `${viewport.width}px`;
        canvas.current.style.height = `${viewport.height}px`;
        text.current.replaceChildren();
        text.current.style.setProperty('--total-scale-factor', String(viewport.scale));
        task = pdfPage.render({canvas: canvas.current, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]});
        await task.promise;
        const content = await pdfPage.getTextContent();
        if (!active || !text.current) return;
        layer = new TextLayer({textContentSource: content, container: text.current, viewport});
        await layer.render();
        if (active) setRendering(false);
      } catch (e) {
        if (active && !(e instanceof Error && e.name === 'RenderingCancelledException')) {setError('This page could not be rendered. Choose another page or retry the paper.'); setRendering(false);}
      }
    }
    void render();
    return () => {active = false; task?.cancel(); layer?.cancel();};
  }, [document, page, width, zoom]);

  function turn(next: number) {setPage(next); scroll.current?.scrollTo({top: 0, left: 0});}
  return <div className="pdf-reader"><div className="pdf-toolbar"><div><button className="icon-button" aria-label="Previous page" disabled={!document || page === 1} onClick={() => turn(page - 1)}><ChevronLeft size={16}/></button><span aria-live="polite">Page {page} / {document?.numPages || '…'}</span><button className="icon-button" aria-label="Next page" disabled={!document || page === document.numPages} onClick={() => turn(page + 1)}><ChevronRight size={16}/></button></div><div><button className="icon-button" aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom(z => Math.max(.75, z - .25))}><Minus size={14}/></button><span>Fit · {Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, z + .25))}><Plus size={14}/></button></div></div>
    <div className="pdf-scroll" ref={scroll} tabIndex={0} role="region" aria-label={`Original paper: ${title}`}>
      {rendering && !error && <span className="pdf-render-status" role="status"><LoaderCircle className="spin" size={14}/>Rendering page…</span>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="pdf-sheet" role="group" aria-label={`Paper page ${page}`} data-rendered={!rendering && !error}><canvas ref={canvas} aria-hidden="true"/><div ref={text} className="pdf-text-layer"/></div>
    </div>
  </div>;
}
