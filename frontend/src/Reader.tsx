import { lazy, Suspense, useEffect, useState } from 'react';
import { BookOpen, FileText, LoaderCircle, Plus } from 'lucide-react';
import { Disclosure, Modal } from './components';
import type { Source } from './types';
const PdfReader = lazy(() => import('./PdfReader'));

export default function Reader({source, close, save, embed, busy}: {source: Source; close: () => void; save: () => void; embed: () => void; busy: boolean}) {
  const [view, setView] = useState('text');
  const [pdf, setPdf] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => {if (pdf) URL.revokeObjectURL(pdf);}, [pdf]);
  async function original() {
    setView('pdf');
    if (pdf || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/sources/${source.id}/original`);
      if (!response.ok) {const data = await response.json(); throw new Error(data.detail || 'The PDF could not be loaded.');}
      setPdf(URL.createObjectURL(await response.blob()));
    } catch (e) {setError(e instanceof Error ? e.message : 'The PDF could not be loaded.');}
    finally {setLoading(false);}
  }
  return <Modal title={source.title} close={close} className="reader-modal"><div className="reader-toolbar"><div className="segmented"><button aria-pressed={view === 'text'} onClick={() => setView('text')}><FileText size={14}/>{source.kind === 'web' ? 'Saved web text' : source.kind === 'brief' ? 'Reading brief' : 'Saved text'}</button>{source.has_original && <button aria-pressed={view === 'pdf'} onClick={original}><BookOpen size={14}/>Original paper</button>}</div><span className="reader-location">READ WITHOUT LEAVING YOUR WORKSPACE</span></div>
    <div className={`reader-layout ${view === 'pdf' ? 'pdf-view' : ''}`}><div className="reader-page" tabIndex={view === 'text' ? 0 : undefined} role={view === 'text' ? 'region' : undefined} aria-label={view === 'text' ? 'Saved source text' : undefined}>{view === 'text' ? <><span className="tag neutral">{source.kind === 'web' ? 'Web extract · captured from an internet search' : source.kind === 'brief' ? 'Original reading brief · full paper not imported' : source.kind === 'note' ? 'Research note' : 'Imported paper / passage'}</span><p className="source-text" dir="auto">{source.text}</p></> : loading ? <div className="reader-loading" role="status"><LoaderCircle className="spin" size={26}/><strong>Opening the original paper…</strong><p>Fetched from arXiv on request. Your library stays unchanged.</p></div> : error ? <div className="reader-loading"><p className="inline-error" role="alert">{error}</p><button className="button secondary" onClick={original}>Try again</button></div> : pdf ? <Suspense fallback={<div className="reader-loading" role="status"><LoaderCircle className="spin" size={24}/>Preparing the reading room…</div>}><PdfReader url={pdf} title={source.title}/></Suspense> : null}</div>
      <aside className="reader-notes" aria-label="Reading actions"><span className="eyebrow">FROM READING TO REMEMBERING</span><div className="reader-note-icon"><Plus size={23}/></div><h3>Keep the part<br/>that matters.</h3><p>Save your interpretation as a finding, linked to this source.</p><button className="button primary" onClick={save}><Plus size={15}/>Save a finding</button><div className="reader-boundary"><BookOpen size={16}/><p>{view === 'pdf' && source.kind === 'brief' ? 'Viewing the original does not import its full text. Upload the PDF to make it searchable.' : 'Questions use the text saved in your library. Findings become memory only when you save them.'}</p></div></aside></div>
    <div className="reader-footer"><Disclosure title="Source provenance">{source.origin && <p className="small-note">{source.origin.content_type} · retrieved {new Date(source.origin.retrieved_at).toLocaleString()} · search: {source.origin.query}</p>}<p className="small-note">Saved {new Date(source.created_at).toLocaleDateString()}. {source.embedding_status === 'ready' ? 'Local semantic embeddings stored.' : 'Keyword search is available; semantic embeddings are pending.'}</p>{source.url && <p className="small-note">Original: {source.url}</p>}<code>SHA-256: {source.sha256}</code>{source.embedding_status !== 'ready' && <button className="button secondary" disabled={busy} onClick={embed}>Enable semantic search</button>}</Disclosure></div>
  </Modal>;
}
