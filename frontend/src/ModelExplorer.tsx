import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Cpu, Gauge, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { Disclosure } from './components';
import type { Catalog, CatalogModel } from './types';
import './tools-overhaul.css';

const format = (value: number | null, digits = 1) => value == null ? '—' : value.toLocaleString(undefined, {maximumFractionDigits: digits});

function Landscape({models}: {models: CatalogModel[]}) {
  const points = models.filter(m => m.speed != null && m.intelligence != null);
  const maxX = Math.max(1, ...points.map(m => m.speed!)) * 1.05;
  const minY = Math.min(0, ...points.map(m => m.intelligence!));
  const maxY = Math.max(1, ...points.map(m => m.intelligence!)) * 1.08;
  return <div className="landscape-chart"><svg viewBox="0 0 720 280" role="img" aria-label="Artificial Analysis intelligence scores against output speed. Each point is one measured model.">
    {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1="65" y1={230 - 195 * t} x2="680" y2={230 - 195 * t} stroke="#e7e9f3" strokeDasharray="4 5"/><text x="49" y={234 - 195 * t} textAnchor="end" fontSize="10" fill="#647084">{Math.round(minY + (maxY - minY) * t)}</text><text x={65 + 615 * t} y="250" textAnchor="middle" fontSize="10" fill="#647084">{Math.round(maxX * t)}</text></g>)}
    {points.map((m, i) => <circle key={m.id} className="model-point" cx={65 + m.speed! / maxX * 615} cy={230 - (m.intelligence! - minY) / (maxY - minY) * 195} r="4.5" fill={i % 3 === 0 ? '#7458de' : i % 3 === 1 ? '#24816d' : '#747fbd'} opacity=".72"><title>{m.name}: intelligence {format(m.intelligence)}, {format(m.speed)} tokens/s</title></circle>)}
    <text x="375" y="274" textAnchor="middle" fontSize="11" fill="#59657b">Output speed · tokens / second</text><text x="14" y="135" textAnchor="middle" transform="rotate(-90 14 135)" fontSize="11" fill="#59657b">Intelligence Index</text>
  </svg></div>;
}

export default function ModelExplorer() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('intelligence');
  const [count, setCount] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {fetch('/api/models').then(async response => {if (!response.ok) throw new Error(); setCatalog(await response.json());}).catch(() => setError('Model explorer could not connect to the backend.'));}, []);
  useEffect(() => setCount(10), [search, sort]);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/models/refresh', {method: 'POST'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Model data could not be refreshed.');
      setCatalog(data);
    } catch (e) {setError(e instanceof Error ? e.message : 'Model data could not be refreshed.');}
    finally {setBusy(false);}
  }
  const models = catalog?.models || [];
  const filtered = models.filter(m => (m.name + m.creator).toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const field = sort as 'intelligence' | 'speed' | 'output_price';
    if (a[field] == null) return b[field] == null ? 0 : 1;
    if (b[field] == null) return -1;
    return sort === 'output_price' ? a[field]! - b[field]! : b[field]! - a[field]!;
  });
  function toggle(id: string) {setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 3 ? [...s, id] : s);}
  return <div className="tools-page models-page"><header className="tools-heading"><div className="tools-heading-copy"><span className="tool-kicker"><Cpu size={13}/>MODEL EXPLORER</span><h1>Find your <span>next model.</span></h1><p>Independent scores. Clear tradeoffs. A shortlist that fits your research.</p></div><div className="model-sculpture tool-art" aria-hidden="true"><i/><span><Cpu size={26}/><b/><b/><b/></span><span><Gauge size={22}/><b/><b/></span><span><Check size={19}/></span></div></header>
    <div className="model-catalog-meta"><span>Artificial Analysis · {models.length ? `${models.length} models` : 'Language model catalog'}{catalog?.updated_at ? ` · ${new Date(catalog.updated_at).toLocaleDateString()}` : ''}</span><button className="button secondary" disabled={busy || !catalog?.configured} onClick={refresh}>{busy ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>}Refresh model data</button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {!catalog ? <div className="catalog-loading" role="status"><LoaderCircle size={24} className="spin"/>Loading models…</div> : !models.length ? <section className="catalog-empty"><Cpu size={28}/><h2>{catalog.configured ? 'Ready to load models.' : 'Connect Artificial Analysis.'}</h2><p>{catalog.configured ? 'Refresh to load independent scores. This does not run a language model.' : 'Add an Artificial Analysis key on the backend to load model scores.'}</p></section> : <>
      {selected.length > 0 && <section className="model-comparison" aria-label="Selected model comparison"><div className="section-heading"><h2>Your shortlist <span>{selected.length}/3</span></h2><button className="text-button" onClick={() => setSelected([])}>Clear shortlist<X size={13}/></button></div><div className="model-comparison-grid">{selected.map(id => {const m = models.find(m => m.id === id)!; return <article key={id} className="model-compare-card"><span className="eyebrow">{m.creator}</span><button className="icon-button" aria-label={`Remove ${m.name} from shortlist`} onClick={() => toggle(id)}><X size={15}/></button><h3>{m.name}</h3><dl><div><dt>Intelligence Index</dt><dd>{format(m.intelligence)}</dd></div><div><dt>Output tokens / sec</dt><dd>{format(m.speed)}</dd></div><div><dt>Input / 1M tokens</dt><dd>{m.input_price == null ? '—' : '$' + format(m.input_price, 3)}</dd></div><div><dt>Output / 1M tokens</dt><dd>{m.output_price == null ? '—' : '$' + format(m.output_price, 3)}</dd></div><div><dt>First token · seconds</dt><dd>{format(m.first_token, 2)}</dd></div></dl></article>;})}</div></section>}
      <section className="model-catalog"><div className="section-heading catalog-controls"><h2>Explore models <span className="count-pill">{filtered.length}</span></h2><div><label className="search-control"><Search size={15}/><input aria-label="Search models" placeholder="Model or creator…" value={search} onChange={e => setSearch(e.target.value)}/></label><label className="select-control"><span className="sr-only">Sort models</span><select aria-label="Sort models" value={sort} onChange={e => setSort(e.target.value)}><option value="intelligence">Highest intelligence</option><option value="speed">Fastest output</option><option value="output_price">Lowest output price</option></select></label></div></div>
      <div className="model-table-wrap" role="region" aria-label="Model measurements" tabIndex={0}><table className="model-table"><caption className="sr-only">Artificial Analysis language model measurements</caption><thead><tr><th scope="col">Model</th><th scope="col">Intelligence</th><th scope="col">Tokens / sec</th><th scope="col">Output / 1M tokens</th><th scope="col">Shortlist</th></tr></thead><tbody>{filtered.slice(0, count).map((m, i) => <tr key={m.id} className={selected.includes(m.id) ? 'selected' : ''}><th scope="row"><div className="model-identity"><span className="model-rank" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><span><strong>{m.name}</strong><span>{m.creator}</span></span></div></th><td data-label="Intelligence"><span className="model-intelligence">{format(m.intelligence)}</span></td><td data-label="Tokens / sec">{format(m.speed)}</td><td data-label="Output / 1M">{m.output_price == null ? '—' : '$' + format(m.output_price, 3)}</td><td><button className="shortlist-button" aria-label={`Shortlist ${m.name}`} aria-pressed={selected.includes(m.id)} disabled={!selected.includes(m.id) && selected.length >= 3} onClick={() => toggle(m.id)}>{selected.includes(m.id) ? <Check size={16}/> : <span>+</span>}</button></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="model-search-empty"><Search size={23}/><h3>No models match that search.</h3><button className="text-button" onClick={() => setSearch('')}>Clear search<ArrowUpRight size={14}/></button></div>}
      {filtered.length > count && <div className="show-more"><span>{Math.min(count, filtered.length)} of {filtered.length} models</span><button className="button secondary" onClick={() => setCount(n => n + 10)}>Show more models</button></div>}
      </section>
    </>}
    <div className="catalog-attribution"><span>Data: <a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer">Artificial Analysis<ArrowUpRight size={12}/></a>{catalog?.index_version ? ` · Index v${catalog.index_version}` : ''}{catalog?.updated_at ? ` · Updated ${new Date(catalog.updated_at).toLocaleDateString()}` : ''}</span></div>
    {models.length > 0 && <Disclosure title="Intelligence and speed chart"><Landscape models={models}/><p className="small-note">Each point is a measured model. Models with missing intelligence or speed values are excluded.</p></Disclosure>}
    <Disclosure title="What these scores tell you"><p className="body-copy">These are external language-model benchmarks, not results from your documents. Median speed and API token rates vary by provider and hardware. A high Intelligence Index does not prove a model will cite your papers correctly.</p><p className="body-copy">A dash means the provider did not supply that measurement. Select a model to compare its input pricing and first-token latency.</p><p className="body-copy">Shortlisting does not install or activate a model. Experiments still use the configured Ollama or GPT generator. This lab works with text and papers; <a className="inline-link" href="https://artificialanalysis.ai/#speech-leaderboards" target="_blank" rel="noreferrer">speech benchmarks</a> are available separately.</p>{catalog?.updated_at && <p className="small-note">Catalog snapshot: {new Date(catalog.updated_at).toLocaleString()} · Intelligence Index v{catalog.index_version}</p>}</Disclosure>
    <Disclosure title="Connection guide"><p className="body-copy">Use a free key from <a className="inline-link" href="https://artificialanalysis.ai/data-api" target="_blank" rel="noreferrer">Artificial Analysis</a>. Set <code>ARTIFICIAL_ANALYSIS_API_KEY</code> in the backend’s ignored .env, or use <code>ARTIFICIAL_ANALYSIS_ENV_FILE</code> and <code>ARTIFICIAL_ANALYSIS_KEY_NAME</code> to reference an existing file. Restart the lab, then refresh. Keys never appear in this interface.</p></Disclosure>
  </div>;
}
