import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, Compass, Globe2, LoaderCircle, Search } from 'lucide-react';
import { api } from './api';
import { Disclosure, Modal } from './components';
import type { Config, Source, WebResult, WebSearch } from './types';
import './tools-overhaul.css';

const DIRECTIONS = [
  {name: 'Agent memory', query: 'Long-term memory evaluation for AI agents'},
  {name: 'Reliable retrieval', query: 'Evaluating retrieval augmented generation evidence reliability'},
  {name: 'Open questions', query: 'Limitations and open problems in AI research assistants'},
];

export default function Discover({config, sources, saved}: {config: Config | null; sources: Source[]; saved: () => Promise<void>}) {
  const [query, setQuery] = useState('Long-term memory evaluation for AI agents');
  const [papersOnly, setPapersOnly] = useState(true);
  const [search, setSearch] = useState<WebSearch | null>(null);
  const [history, setHistory] = useState<WebSearch[]>([]);
  const [preview, setPreview] = useState<WebResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [count, setCount] = useState(4);
  const queryInput = useRef<HTMLInputElement>(null);
  useEffect(() => {api<WebSearch[]>('/history?kind=web').then(setHistory).catch(() => setError('Saved searches could not be loaded.'));}, []);
  const imported = (r: WebResult) => sources.some(s => s.origin?.result_id === r.id || s.url === r.url && s.text === r.text);
  async function find(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy('search');
    try {const result = await api<WebSearch>('/web/search', {query, papers_only: papersOnly}); setSearch(result); setCount(4); setHistory(h => [result, ...h]);}
    catch (e) {setError(e instanceof Error ? e.message : 'Search failed.');} finally {setBusy('');}
  }
  async function collect(result: WebResult) {
    if (!search) return;
    setError(''); setBusy(result.id);
    try {await api('/web/import', {search_id: search.id, result_id: result.id}); await saved();}
    catch (e) {setError(e instanceof Error ? e.message : 'Import failed.');} finally {setBusy('');}
  }
  return <div className={`tools-page discovery-page ${search ? 'has-output' : ''}`}>
    <header className="tools-heading"><div className="tools-heading-copy"><span className="tool-kicker"><Compass size={13}/>DISCOVER</span><h1>Follow a <span>fresh lead.</span></h1><p>Your next idea is out there. Explore the web, then bring the useful evidence home.</p></div><div className="discovery-signal tool-art" aria-hidden="true"><i/><i/><i/><span className="signal-center"><Compass size={37}/></span><b className="signal-spark spark-one"/><b className="signal-spark spark-two"/></div></header>
    <form className="discovery-search" onSubmit={find}><label htmlFor="internet-query">Where should we look?</label><div className="discovery-input"><Search size={20}/><input ref={queryInput} id="internet-query" required minLength={3} maxLength={1000} value={query} onChange={e => setQuery(e.target.value)} placeholder="A paper, topic or question…"/><button className="button primary" disabled={!!busy || !config?.web.configured}>{busy === 'search' ? <LoaderCircle className="spin" size={16}/> : <ArrowRight size={16}/>}Search internet</button></div><div className="discovery-search-footer"><span>{papersOnly ? 'Research repositories' : 'Public web'} · Tavily search credits</span><details className="discovery-options"><summary>Search options<ChevronDown size={14}/></summary><div className="search-scope"><label><input type="checkbox" checked={papersOnly} onChange={e => setPapersOnly(e.target.checked)}/>Research repositories only</label><p>arXiv, ACL Anthology and OpenReview. Turn this off to search the public web.</p></div></details></div></form>
    {!search && <div className="discovery-directions"><span>A starting point</span>{DIRECTIONS.map(d => <button key={d.name} onClick={() => {setQuery(d.query); queryInput.current?.focus();}}>{d.name}<ArrowUpRight size={13}/></button>)}</div>}
    {!config?.web.configured && <p className="notice">Connect Tavily on the backend to enable internet research.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {search && <section className="discovery-results"><div className="section-heading"><div><span className="tool-kicker">FOUND ON THE WEB</span><h2>{search.results.length} fresh leads</h2><p className="discovery-result-query">{search.query}</p></div><span className="tag neutral">{new Date(search.created_at).toLocaleDateString()}{search.usage.credits != null ? ` · ${search.usage.credits} search credit` : ''}</span></div>{search.results.length ? <><div className="web-result-grid">{search.results.slice(0, count).map((r, i) => <article className="web-result" key={r.id} style={{animationDelay: `${i * 70}ms`}}><div className="web-result-top"><span><Globe2 size={13}/>{new URL(r.url).hostname}</span><span className="result-index">{String(i+1).padStart(2,'0')}</span></div><button className="web-result-title" onClick={() => setPreview(r)}>{r.title}<ArrowUpRight size={18}/></button><p>{r.excerpt.slice(0, 210)}{r.excerpt.length > 210 ? '…' : ''}</p><div className="web-result-bottom"><span>{r.content_type}</span><button className="text-button" disabled={!!busy || imported(r)} onClick={() => collect(r)}>{imported(r) ? <Check size={14}/> : busy === r.id ? <LoaderCircle className="spin" size={14}/> : <ArrowDownToLine size={14}/>} {imported(r) ? 'In library' : 'Keep source'}</button></div></article>)}</div>{search.results.length > count && <div className="show-more"><span>{count} of {search.results.length} leads</span><button className="button secondary" onClick={() => setCount(n => n+4)}>Show more results<ChevronDown size={14}/></button></div>}</> : <div className="empty-state"><Search size={25}/><h3>No usable results.</h3><p>Try a broader query or search the public web.</p></div>}</section>}
    {history.length > 0 && <Disclosure title={`Previous discoveries · ${history.length}`}><div className="history-list">{history.map(h => <button key={h.id} onClick={() => {setSearch(h); setCount(4); setQuery(h.query); setPapersOnly(h.papers_only);}}><Globe2 size={17}/><span>{h.query}<small>{new Date(h.created_at).toLocaleString()} · {h.results.length} results</small></span><ArrowUpRight size={16}/></button>)}</div></Disclosure>}
    <Disclosure title="How internet sources work"><p className="body-copy">Searches are dated snapshots. Only sources you choose to keep enter your library. Repository search covers arXiv, ACL Anthology and OpenReview; turn it off to search the public web.</p><p className="body-copy">Web extracts may be incomplete. Upload the full PDF for paper-level analysis.</p></Disclosure>
    {preview && <Modal title="Source preview" close={() => setPreview(null)} className="web-preview"><div className="source-detail"><span className="tag lilac">{preview.content_type} · retrieved {new Date(preview.retrieved_at).toLocaleString()}</span><h3>{preview.title}</h3>{preview.published_at && <p className="small-note">Published date supplied by search provider: {preview.published_at}</p>}<div className="web-preview-text source-text" dir="auto">{preview.text}</div><div className="reader-actions"><button className="button primary" disabled={!!busy || imported(preview)} onClick={() => collect(preview)}>{imported(preview) ? 'Saved in library' : 'Keep this source'}<ArrowDownToLine size={15}/></button><a className="button secondary" href={preview.url} target="_blank" rel="noreferrer">Original website<ArrowUpRight size={15}/></a></div>{error && <p className="inline-error" role="alert">{error}</p>}</div></Modal>}
  </div>;
}
