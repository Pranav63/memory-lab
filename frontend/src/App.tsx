import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Compass, Cpu, FlaskConical, Globe2, GitBranch, Layers, LoaderCircle, MoreHorizontal, Network, Palette, Pause, Play, Plus, Search, Settings2, Sparkles, Telescope, WandSparkles, Upload, X } from 'lucide-react';
import { Disclosure, GraphMap, Modal, SourceCard } from './components';
import Reader from './Reader';
import Appearance, { readAppearance } from './Appearance';
import Navigation from './Navigation';
import useViewportReveal from './useViewportReveal';
import type { Theme } from './Appearance';
import { api } from './api';
import Discover from './Discover';
import Studio from './Studio';
import ModelExplorer from './ModelExplorer';
import type { Answer, Config, Context, Experiment, Finding, Graph, Source } from './types';

const TABS = ['Workspace', 'Discover', 'Library', 'Studio', 'Memory', 'Experiments', 'Models'] as const;
type Tab = typeof TABS[number];
const PRIMARY_TABS: Tab[] = ['Workspace', 'Library', 'Memory', 'Studio'];
const EXTRA_TABS: Tab[] = ['Discover', 'Experiments', 'Models'];
const ICONS = {Workspace: Sparkles, Discover: Globe2, Library: BookOpen, Studio: WandSparkles, Memory: Network, Experiments: FlaskConical, Models: Cpu};
const MODES: Record<string, string> = {none: 'No workspace context', sources: 'Source retrieval', memory: 'Sources + memory'};
const STARTERS = [
  {title: 'Compare approaches', text: 'See how the methods differ.', icon: Layers, tone: 'compare', question: 'How do the approaches in my library differ in how they store and retrieve memory?'},
  {title: 'Connect ideas', text: 'Follow a thread across your findings.', icon: GitBranch, tone: 'connect', question: 'What connections do my saved findings reveal between the papers in my library?'},
  {title: 'Find a research gap', text: 'Find what still needs evidence.', icon: Telescope, tone: 'gap', question: 'What evidence is missing before I can compare these approaches fairly?'},
];
const stamp = (date: string) => new Date(date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});

function Result({answer, inspect, heading = 'h2'}: {answer: Answer; inspect: (context: Context) => void; heading?: 'h2' | 'h4'}) {
  const Heading = heading;
  const [allEvidence, setAllEvidence] = useState(false);
  useEffect(() => setAllEvidence(false), [answer.id]);
  const paragraphs = answer.provider === 'evidence' && !allEvidence ? answer.paragraphs.slice(0, 2) : answer.paragraphs;
  return <article className="answer-card"><div className="answer-heading"><span className="answer-symbol"><Sparkles size={17} /></span><div><Heading>{answer.provider === 'evidence' ? 'Evidence' : 'Research answer'}</Heading><span>{answer.model}</span></div><span className="tag neutral">{answer.latency_ms} ms</span></div>
    {answer.provider === 'evidence' && <p className="small-note">Retrieved passages · no generated answer.</p>}
    {answer.status === 'failed' ? <p className="inline-error">{answer.error}</p> : <div className="answer-prose">{paragraphs.map((p, i) => <div key={i}><p dir="auto">{p.text}</p><div className="citation-row">{p.citations.map(id => {const c = answer.contexts.find(c => c.id === id); return c ? <button key={id} onClick={() => inspect(c)}><BookOpen size={12} />{c.title}{c.page ? ` · p. ${c.page}` : ''}</button> : null;})}</div></div>)}</div>}
    {answer.provider === 'evidence' && answer.paragraphs.length > 2 && <button className="text-button evidence-expand" aria-expanded={allEvidence} onClick={() => setAllEvidence(!allEvidence)}>{allEvidence ? 'Show less evidence' : 'Show all evidence'}<ChevronDown size={14}/></button>}
    {answer.warnings.length > 0 && <div className="notice">{answer.warnings.map(w => <p key={w}>{w}</p>)}</div>}
    <Disclosure title="How this result was produced"><p className="small-note">{answer.strategy}. Context IDs identify retrieved evidence; a citation does not independently verify a claim.</p><p className="small-note">{answer.provider === 'local' ? 'Local model: no API fee. Hardware and electricity costs are not measured.' : answer.provider === 'gpt' ? `Estimated generation API spend: ${answer.estimated_cost_usd == null ? 'unavailable' : '$' + answer.estimated_cost_usd.toFixed(5)}. Graph extraction spend is separate.` : 'Evidence preview does not call a generator.'}</p></Disclosure>
  </article>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Workspace');
  const [sources, setSources] = useState<Source[]>([]);
  const [memories, setMemories] = useState<Finding[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [history, setHistory] = useState<Answer[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [question, setQuestion] = useState('');
  const [showStarters, setShowStarters] = useState(false);
  const [provider, setProvider] = useState('evidence');
  const [useWeb, setUseWeb] = useState(false);
  const [mode, setMode] = useState('memory');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [expected, setExpected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sourceCount, setSourceCount] = useState(6);
  const [findingCount, setFindingCount] = useState(4);
  const [source, setSource] = useState<Source | null>(null);
  const [citation, setCitation] = useState<Context | null>(null);
  const [modal, setModal] = useState<'import' | 'finding' | 'connections' | 'about' | 'appearance' | 'more' | 'history' | 'comparisons' | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [importKind, setImportKind] = useState('note');
  const [collapsed, setCollapsed] = useState(() => readAppearance().collapsed);
  const [motion, setMotion] = useState(() => readAppearance().motion);
  const [theme, setTheme] = useState<Theme>(() => readAppearance().theme);
  const [memoryView, setMemoryView] = useState('findings');
  const pageRef=useRef<HTMLDivElement>(null);
  useViewportReveal(pageRef,tab,motion);
  const [sourceKind, setSourceKind] = useState('all');
  const active = memories.filter(m => !m.retired_at);
  const startersVisible = showStarters || (!question.trim() && !answer);
  const matchingSources = sources.filter(s => (sourceKind === 'all' || s.kind === sourceKind) && (s.title + ' ' + s.text).toLowerCase().includes(search.toLowerCase()));
  useEffect(() => setSourceCount(6), [search, sourceKind]);

  useEffect(() => {try {localStorage.setItem('memorylab.appearance', JSON.stringify({theme, motion, collapsed}));} catch { /* Appearance still works when browser storage is disabled. */ }}, [theme, motion, collapsed]);

  async function reload() {
    const [s, m, c, h, e, g] = await Promise.all([api<Source[]>('/sources'), api<Finding[]>('/memories'), api<Config>('/config'), api<Answer[]>('/history?kind=research'), api<Experiment[]>('/history?kind=experiment'), api<Graph>('/graph')]);
    setSources(s); setMemories(m); setConfig(c); setHistory(h); setExperiments(e); setGraph(g);
  }
  useEffect(() => {reload().catch(() => setError('The backend is unavailable. Run ./start.sh from the project folder.'));}, []);
  useEffect(() => {if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer);}, [toast]);
  async function perform(label: string, operation: () => Promise<void>) {
    setBusy(label); setError('');
    try {await operation();} catch (e) {setError(e instanceof Error ? e.message : 'This action could not finish.');} finally {setBusy('');}
  }
  function navigate(next: Tab) {
    const update = () => {setTab(next); setModal(null); setSearch(''); setSourceKind('all'); setSource(null); setCitation(null);};
    if (document.startViewTransition && motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => flushSync(update)); else update();
  }
  function startQuestion(value: string) {
    setQuestion(value); setAnswer(null); setShowStarters(false);
    document.getElementById('research-question')?.focus();
  }
  function openFinding(s?: Source, previous?: Finding) {setError(''); setSource(s || null); setFinding(previous || null); setModal('finding');}
  async function ask(e: FormEvent, compare = false) {
    e.preventDefault();
    await perform(compare ? 'Comparing three conditions…' : 'Looking through your research…', async () => {
      const data = {question, provider, mode, use_web: !compare && useWeb, expected_source_ids: expected};
      if (compare) {setExperiment(await api<Experiment>('/experiments', data));} else {setAnswer(await api<Answer>('/research', data));}
      await reload();
    });
  }
  async function saveImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    await perform('Adding your source…', async () => {
      const file = form.get('file') as File;
      if (file?.size) {
        const upload = new FormData(); upload.set('title', String(form.get('title'))); upload.set('file', file);
        const response = await fetch('/api/sources/upload', {method: 'POST', body: upload});
        const result = await response.json(); if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Check the file and title.');
      } else {await api('/sources', {title: form.get('title'), text: form.get('text'), kind: importKind, url: form.get('url') || null});}
      setModal(null); await reload(); setToast('Source saved. Ready to explore.');
    });
  }
  async function saveFinding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    await perform('Saving your finding…', async () => {
      await api('/memories', {source_id: form.get('source_id'), text: form.get('text'), supersedes: finding?.id || null});
      setModal(null); setSource(null); setFinding(null); await reload(); setToast('Finding saved. It will be here next session.');
    });
  }
  function questionForm(compare = false) {
    return <form className="question-form" onSubmit={e => ask(e, compare)}>
      <label htmlFor={compare ? 'compare-question' : 'research-question'}>{compare ? 'One question. Three conditions.' : 'Ask a question'}</label>
      <textarea id={compare ? 'compare-question' : 'research-question'} minLength={3} maxLength={1000} required value={question} onChange={e => {setQuestion(e.target.value); if (!compare) setShowStarters(false);}} rows={3} placeholder={compare ? 'What would you like to understand from your research?' : 'Ask about an idea, a paper, or something you want to connect…'}/>
      <div className="question-actions"><span className="research-summary">{config?.providers.find(p => p.id === provider)?.name || 'Evidence preview'}{!compare && ` · ${MODES[mode]}${useWeb ? ' + web' : ''}`}</span><button className="button primary" disabled={!!busy}>{busy ? <LoaderCircle size={16} className="spin"/> : compare ? <FlaskConical size={16}/> : <ArrowUpRight size={16}/>} {compare ? 'Compare conditions' : provider === 'evidence' ? 'Find evidence' : 'Ask your research'}</button></div>
      {provider !== 'evidence' && <p className="small-note">{provider === 'gpt' ? `${config?.providers.find(p => p.id === 'gpt')?.model}. Sends the question and excerpts to GPT; uses API credits.` : `${config?.providers.find(p => p.id === 'local')?.model}. Generation runs locally through Ollama.`}{compare ? ' Three sequential generation calls.' : ''}</p>}
      <details className="research-options"><summary>{compare ? 'Comparison settings' : 'Research options'}<ChevronDown size={15}/></summary><div>
        <div className="question-controls"><label className="select-control"><span className="sr-only">Answer provider</span><select aria-label="Answer provider" value={provider} onChange={e => setProvider(e.target.value)}>{(config?.providers || [{id: 'evidence', name: 'Evidence preview', configured: true}]).map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.name}{!p.configured ? ' · unavailable' : ''}</option>)}</select><ChevronDown size={13}/></label>{!compare && <label className="select-control"><span className="sr-only">Research context</span><select aria-label="Research context" value={mode} onChange={e => setMode(e.target.value)}>{Object.entries(MODES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><ChevronDown size={13}/></label>}</div>
        {!compare && <label className="internet-option"><input type="checkbox" role="switch" aria-label="Include internet research" aria-describedby="internet-research-help" checked={useWeb} disabled={!config?.web.configured} onChange={e => setUseWeb(e.target.checked)}/><span className="internet-option-icon" aria-hidden="true"><Globe2 size={19}/></span><span className="internet-option-copy"><strong>Include internet research</strong><small id="internet-research-help">{config?.web.configured ? 'Tavily · uses search credits' : 'Connect Tavily to enable'}</small></span><span className="preference-switch" aria-hidden="true"/></label>}
        {compare && <><p className="small-note">Expected sources (optional). Measures source recall at six snippets, not answer accuracy.</p><div className="expected-list">{sources.map(s => <label key={s.id}><input type="checkbox" checked={expected.includes(s.id)} onChange={e => setExpected(e.target.checked ? [...expected, s.id] : expected.filter(id => id !== s.id))}/>{s.title}</label>)}</div></>}
      </div></details>
    </form>;
  }

  return <div className={`app ${collapsed ? 'rail-collapsed' : ''}`} data-theme={theme} data-motion={motion ? 'on' : 'off'}><a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="sidebar" aria-label="Research navigation"><a className="brand" href="/" aria-label="Research Memory Lab home"><span className="brand-mark"><span/><span/><span/></span><span className="brand-word">memory<span>lab</span></span></a>
      <div className="sidebar-section-title"><button className="rail-toggle" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}</button></div>
      <Navigation active={tab} label="Main navigation">{PRIMARY_TABS.map(name => {const Icon = ICONS[name]; return <button key={name} title={collapsed ? name : undefined} aria-label={name} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><span className="nav-icon"><Icon size={19}/></span><span className="nav-text">{name}</span></button>;})}<button aria-label="More" title="More tools" aria-current={EXTRA_TABS.includes(tab) ? 'true' : undefined} onClick={() => setModal('more')}><span className="nav-icon"><MoreHorizontal size={19}/></span><span className="nav-text">More</span></button></Navigation>
      <div className="sidebar-bottom"><button className="connections" title="Models and connections" aria-label="Models and connections" onClick={() => setModal('connections')}><Settings2 size={18}/><span>Settings</span></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span className="breadcrumb"><span className="breadcrumb-root">Personal lab</span><ChevronRight size={13}/><strong>{tab}</strong></span><div><button className="icon-button appearance-toggle" aria-label="Appearance" onClick={() => setModal('appearance')} title="Appearance"><Palette size={17}/></button><button className="icon-button motion-toggle" aria-label={motion ? 'Pause animations' : 'Enable animations'} aria-pressed={!motion} onClick={() => setMotion(!motion)} title={motion ? 'Pause animations' : 'Enable animations'}>{motion ? <Pause size={15}/> : <Play size={15}/>}</button><button className="button dark" onClick={() => {setError(''); setImportKind('note'); setModal('import');}}><Plus size={16}/><span>Add source</span></button><button className="icon-button mobile-settings" aria-label="Models and connections" onClick={() => setModal('connections')}><Settings2 size={18}/></button></div></header>
      <main id="main-content" tabIndex={-1} className={`page page-${tab.toLowerCase()}`}><div key={tab} ref={pageRef} className="page-content">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
        {busy && <div className="working" role="status"><LoaderCircle size={15} className="spin"/>{busy}<span className="working-line"/></div>}
        {tab === 'Workspace' && <div className={`workspace-home ${answer ? 'workspace-has-answer' : ''}`}>
          <header className="workspace-intro">
            <div className="workspace-topline"><span className="workspace-kicker">YOUR RESEARCH DESK</span>{history.length > 0 && <button className="workspace-history" aria-label="Previous questions" onClick={() => setModal('history')}><Clock3 size={15}/>Previous questions<ArrowUpRight size={13}/></button>}</div>
            <div className="workspace-welcome"><div className="workspace-welcome-copy"><h1><span className="headline-line"><span>What will you</span></span><span className="headline-line"><span className="workspace-headline-accent">discover?</span></span></h1><p>Follow a thread through your papers and saved findings.</p><button className="workspace-library-link" aria-label="Browse library" onClick={() => navigate('Library')} disabled={!config}><BookOpen size={13}/>{config ? `${sources.length} sources · ${active.length} saved findings` : 'Opening your library…'}<ChevronRight size={13}/></button></div>
              <div className="workspace-art" aria-hidden="true"><div className="workspace-art-glow"/><div className="workspace-art-orbit"/><div className="workspace-art-orbit orbit-second"/><div className="workspace-art-paper paper-back"><i/><i/><i/></div><div className="workspace-art-paper paper-middle"><i/><i/><i/></div><div className="workspace-art-paper paper-front"><span className="paper-spark"><Compass size={29}/></span><i/><i/><i/><span className="paper-tab"/></div><span className="workspace-art-star star-one"><Sparkles size={17}/></span><span className="workspace-art-star star-two"><Plus size={13}/></span><span className="workspace-art-dot"/></div>
            </div>
          </header>
          <div className="workspace-focus">
            {questionForm()}
            <div className="workspace-starting">{(question.trim() || answer) && <button className="workspace-starters-toggle" aria-expanded={startersVisible} aria-controls="research-starters" onClick={() => setShowStarters(!startersVisible)}><Sparkles size={14}/>Explore starters<ChevronDown size={13}/></button>}<div id="research-starters" className="workspace-starters" hidden={!startersVisible} aria-label="Research starters">{STARTERS.map(({title, text, icon: Icon, tone, question: prompt}) => <button key={title} className={`workspace-starter starter-${tone}`} aria-label={title} onClick={() => startQuestion(prompt)} disabled={!!busy}><span className="starter-icon"><Icon size={19}/></span><span className="starter-copy"><strong>{title}</strong><small>{text}</small></span><ArrowUpRight size={15}/></button>)}</div></div>
            {answer && <Result answer={answer} inspect={setCitation}/>}
          </div>
        </div>}
        {tab === 'Library' && <><header className="collection-intro"><div className="collection-copy"><span className="collection-kicker">YOUR RESEARCH COLLECTION</span><h1>Library</h1><p>A home for ideas worth returning to.</p><span className="collection-meta"><BookOpen size={13}/>{sources.length} sources · papers, notes & web evidence</span></div><div className="collection-art library-art" aria-hidden="true"><span className="library-art-orbit"/><span className="library-book book-one"><i/><i/><i/></span><span className="library-book book-two"><i/><i/><i/></span><span className="library-book book-three"><BookOpen size={26}/><i/><i/></span><span className="library-art-spark"><Sparkles size={17}/></span></div></header>
          <div className="library-toolbar"><label className="search-control"><Search size={16}/><input aria-label="Search library" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a source…"/></label><label className="select-control"><span className="sr-only">Source type</span><select aria-label="Source type" value={sourceKind} onChange={e => setSourceKind(e.target.value)}>{[['all','All sources'],['brief','Reading briefs'],['paper','Papers'],['note','Notes'],['web','Web']].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={13}/></label></div>
          <div className="collection-section-label"><span>{search || sourceKind !== 'all' ? 'Matching sources' : 'On your shelf'}</span><span>{matchingSources.length} {matchingSources.length === 1 ? 'source' : 'sources'}</span></div><div className="source-grid">{matchingSources.slice(0, sourceCount).map((s, i) => <SourceCard key={s.id} source={s} index={i} compact open={() => setSource(s)}/>)}</div>{!matchingSources.length && <div className="empty-state"><Search size={30}/><h2>No sources found</h2><p>Try another search or add a source.</p></div>}
          {sourceCount < matchingSources.length && <div className="show-more"><span>{sourceCount} of {matchingSources.length} sources</span><button className="button secondary" onClick={() => setSourceCount(n => n + 6)}>Show more sources<ChevronDown size={15}/></button></div>}
        </>}
        {tab === 'Memory' && <><header className="collection-intro memory-intro"><div className="collection-copy"><span className="collection-kicker">IDEAS THAT STAY WITH YOU</span><h1>Memory</h1><p>Keep the insight. See the connections.</p><span className="collection-meta"><GitBranch size={13}/>{active.length} saved findings · with their source history</span></div><div className="collection-art memory-art" aria-hidden="true"><span className="memory-art-ring"/><span className="memory-art-ring ring-inner"/><span className="memory-art-thread thread-one"/><span className="memory-art-thread thread-two"/><span className="memory-art-center"><GitBranch size={29}/></span><span className="memory-art-node node-one"><BookOpen size={16}/></span><span className="memory-art-node node-two"><Sparkles size={16}/></span><span className="memory-art-node node-three"><Layers size={16}/></span></div></header><div className="memory-controls"><div className="memory-view-tabs" aria-label="Memory view">{[['findings','Findings',active.length],['graph','Graph',graph?.nodes.length || 0],['timeline','Timeline',memories.length]].map(([id,label,count]) => <button key={id} aria-label={String(label)} aria-pressed={memoryView === id} aria-controls="memory-content" onClick={() => setMemoryView(String(id))}>{label}<span>{count}</span></button>)}</div><button className="button primary memory-save" disabled={!!busy || !sources.length} onClick={() => openFinding()}><Plus size={16}/>Save a finding</button></div>
          <div id="memory-content">{memoryView === 'findings' && <>
          {active.length ? <div className="finding-list">{active.slice(0, findingCount).map((m, i) => <details className="finding-card" key={m.id} name="findings"><summary><span className="finding-number">{String(i + 1).padStart(2,'0')}</span><span><strong>{m.text.slice(0, 110)}{m.text.length > 110 ? '…' : ''}</strong><small><BookOpen size={11}/>{m.source_title} · {stamp(m.created_at)}</small></span><span className={`tag ${m.status === 'indexed' ? 'sage' : 'neutral'}`}>{m.status === 'indexed' ? 'Indexed' : m.status === 'indexing' ? 'Indexing' : m.status === 'failed' ? 'Index failed' : 'Saved'}</span><ChevronDown size={16}/></summary><div className="finding-body"><p className="body-copy" dir="auto">{m.text}</p>{m.error && <p className="inline-error">{m.error}</p>}<div className="finding-actions"><button className="button secondary" onClick={() => openFinding(sources.find(s => s.id === m.source_id), m)}>Revise finding</button><button className="button secondary" onClick={() => setSource(sources.find(s => s.id === m.source_id) || null)}><BookOpen size={14}/>Open source</button>{m.status !== 'indexed' && <button className="button primary" disabled={!!busy || m.status === 'indexing'} onClick={() => perform('Connecting this finding with Graphiti…', async () => {try {await api(`/memories/${m.id}/index`, {}); setToast('Finding indexed in the research graph.');} finally {await reload();}})}><Network size={15}/>Connect in graph</button>}</div><p className="small-note">Connecting uses Groq for relationship extraction and local embeddings. Extracted relationships need researcher review.</p></div></details>)}</div> : <section className="empty-state"><GitBranch size={30}/><h2>Your first finding starts the thread.</h2><p>Choose a source, save something useful, and come back to it next session.</p><button className="button secondary" onClick={() => openFinding()}>Save a finding<ArrowRight size={15}/></button></section>}
          {findingCount < active.length && <div className="show-more"><span>{findingCount} of {active.length} findings</span><button className="button secondary" onClick={() => setFindingCount(n => n + 4)}>Show more findings<ChevronDown size={15}/></button></div>}
          </>}
          {memoryView === 'graph' && <section className="memory-graph-room"><div className="collection-section-label"><span>Indexed relationships</span><span>{graph?.nodes.length || 0} entities · {graph?.edges.length || 0} {graph?.edges.length === 1 ? 'connection' : 'connections'}</span></div><GraphMap graph={graph} expanded findings={active} openSource={id => setSource(sources.find(s => s.id === id) || null)}/></section>}
          {memoryView === 'timeline' && <section className="memory-timeline-room"><div className="section-heading"><h2>Memory timeline</h2><span className="tag neutral">{memories.length} versions</span></div><div className="timeline">{memories.length ? memories.map(m => <div key={m.id}><span className="timeline-dot"/><div><span className="eyebrow">{stamp(m.created_at)} · {m.retired_at ? 'SUPERSEDED' : m.supersedes ? 'REVISED' : 'SAVED'}</span><p dir="auto">{m.text}</p><small>{m.source_title}</small></div></div>) : <p className="small-note">Saved findings and their revisions will appear here.</p>}</div></section>}</div>
        </>}
        {tab === 'Experiments' && <><header className="collection-intro experiment-intro"><div className="collection-copy"><span className="collection-kicker">TEST WHAT MEMORY ADDS</span><h1>Experiments</h1><p>One question. A controlled comparison.</p>{experiments.length > 0 && <button className="collection-history" aria-label="Saved comparisons" onClick={() => setModal('comparisons')}><Clock3 size={14}/>{experiments.length} saved comparisons<ArrowUpRight size={13}/></button>}</div><div className="collection-art experiment-art" aria-hidden="true"><span className="experiment-art-ring"/><span className="experiment-art-bar bar-one"/><span className="experiment-art-bar bar-two"/><span className="experiment-art-bar bar-three"/><span className="experiment-art-line"/><span className="experiment-art-icon"><FlaskConical size={22}/></span></div></header>
          {!experiment && <div className="experiment-preview" aria-label="Comparison conditions"><span><i/>No context</span><span><i/>Sources</span><span><i/>Sources + memory</span><small>Same question & provider</small></div>}
          {questionForm(true)}
          {experiment && <section className="experiment-results"><div className="section-heading"><h2>Three views of one question.</h2><a className="button secondary" href={`/api/history/${experiment.id}/export`} download><ArrowDownToLine size={15}/>Export JSON</a></div>{experiment.snapshot_changed && <p className="inline-error">The workspace changed during this experiment. Rerun before comparing results.</p>}<div className="condition-grid">{experiment.conditions.map((c, i) => <article key={c.mode} className={`condition-card condition-${i}`}><span className="condition-number" aria-hidden="true">0{i + 1}</span><span className="eyebrow">CONDITION</span><h3>{MODES[c.mode]}</h3><div className="condition-stats"><strong>{c.contexts.length}<small>evidence snippets</small></strong><strong>{c.latency_ms}<small>milliseconds total</small></strong></div><span className="tag neutral">{c.provider === 'evidence' ? 'Retrieval only' : c.status === 'failed' ? 'Request failed' : 'Live generation'}</span>{c.evidence_recall != null && <p className="recall">{Math.round(c.evidence_recall * 100)}% expected-source recall</p>}<details className="condition-answer"><summary>Open result<ChevronDown size={15}/></summary><Result answer={c} inspect={setCitation} heading="h4"/></details></article>)}</div></section>}
          <Disclosure title="How to read this experiment"><p className="body-copy">Each condition uses the same question, selected provider and a maximum of six 600-character excerpts. Source retrieval combines local semantic vectors with keyword search. Memory adds saved findings and Graphiti relationships when indexed.</p><p className="body-copy">Evidence preview measures retrieval, not model accuracy. Expected-source recall counts which selected sources appeared in context. Citation IDs are checked, but factual support still needs review. Total latency includes retrieval and generation, in sequential order; this is not a universal benchmark.</p></Disclosure>
        </>}
        {tab === 'Discover' && <Discover config={config} sources={sources} saved={reload}/>}
        {tab === 'Studio' && <Studio sources={sources} config={config} inspect={setCitation} saved={reload}/>}
        {tab === 'Models' && <ModelExplorer/>}
        {tab !== 'Workspace' && <footer><button className="text-button" onClick={() => setModal('about')}>What this lab does<ArrowUpRight size={12}/></button></footer>}
      </div></main>
    </div>
    <Navigation active={tab} className="mobile-nav" label="Mobile navigation">{PRIMARY_TABS.map(name => {const Icon = ICONS[name]; return <button key={name} aria-label={name} aria-current={name === tab ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={18}/>{name}</button>;})}<button aria-label="More" aria-current={EXTRA_TABS.includes(tab) ? 'true' : undefined} onClick={() => setModal('more')}><MoreHorizontal size={18}/>More</button></Navigation>
    {modal === 'more' && <Modal title="More tools" close={() => setModal(null)}><div className="more-tools">{EXTRA_TABS.map(name => {const Icon = ICONS[name]; return <button key={name} aria-label={name} onClick={() => navigate(name)}><Icon size={21}/><span><strong>{name}</strong><small>{name === 'Discover' ? 'Find papers and web sources' : name === 'Experiments' ? 'Test what memory adds' : 'Compare model scores and costs'}</small></span><ArrowRight size={16}/></button>;})}</div></Modal>}
    {modal === 'history' && <Modal title="Previous questions" close={() => setModal(null)}><div className="history-list">{history.slice(0, 20).map(h => <button key={h.id} onClick={() => {setAnswer(h); setQuestion(h.question); setModal(null);}}><Clock3 size={16}/><span>{h.question}<small>{stamp(h.created_at!)} · {h.model}</small></span><ArrowRight size={16}/></button>)}</div></Modal>}
    {modal === 'comparisons' && <Modal title="Saved comparisons" close={() => setModal(null)}><div className="history-list">{experiments.slice(0, 20).map(e => <button key={e.id} onClick={() => {setExperiment(e); setQuestion(e.question); setModal(null);}}><FlaskConical size={16}/><span>{e.question}<small>{stamp(e.created_at)} · {e.provider}</small></span><ArrowRight size={16}/></button>)}</div></Modal>}
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {modal === 'appearance' && <Appearance theme={theme} choose={setTheme} motion={motion} setMotion={setMotion} close={() => setModal(null)}/>}
    {modal === 'import' && <Modal title="Add something worth keeping." close={() => setModal(null)}><form onSubmit={saveImport} className="modal-form"><label>Source title<input name="title" required maxLength={180} placeholder="A paper, a note, a new idea…"/></label><div className="form-pair"><label>Source type<select value={importKind} onChange={e => setImportKind(e.target.value)}><option value="note">Research note</option><option value="paper">Paper / passage</option></select></label><label>Original link (optional)<input name="url" type="url" placeholder="https://arxiv.org/abs/…"/></label></div><label>Paste source text<textarea name="text" rows={6} maxLength={200000} placeholder="Paste a passage or write a note, or choose a file below."/></label><label className="upload-field"><Upload size={18}/><span>Or import a PDF, .txt or .md file<small>PDF: up to 100 pages · readable text required · max. 20 MB</small></span><input name="file" type="file" accept=".pdf,.txt,.md" aria-label="Import source file"/></label><p className="small-note">Sources are stored locally and embedded on your Mac. No graph extraction happens on import.</p>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={!!busy}>{busy ? 'Saving…' : 'Add to library'}<ArrowRight size={16}/></button></form></Modal>}
    {modal === 'finding' && <Modal title={finding ? 'Let the finding evolve.' : 'Keep a finding.'} close={() => {setModal(null); setFinding(null); setSource(null);}}><form onSubmit={saveFinding} className="modal-form"><label>Source<select name="source_id" defaultValue={source?.id || finding?.source_id || sources[0]?.id} disabled={!!finding}>{sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>{finding && <input type="hidden" name="source_id" value={finding.source_id}/>}</label><label>The finding<textarea name="text" required minLength={10} maxLength={2000} rows={6} defaultValue={finding?.text || ''} placeholder="What did you learn, decide, or want to revisit?"/></label><p className="small-note">{finding ? 'The new version replaces the active finding. Its previous text remains in the timeline.' : 'This saves your interpretation with its source. You can index it in the graph afterwards.'}</p>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={!!busy}>{finding ? 'Save revision' : 'Save finding'}<Check size={16}/></button></form></Modal>}
    {source && !modal && <Reader key={source.id} source={source} close={() => setSource(null)} save={() => openFinding(source)} busy={!!busy} embed={() => perform('Embedding this source locally…', async () => {const s = await api<Source>(`/sources/${source.id}/embed`, {}); setSource({...source, ...s}); await reload();})}/>}
    {citation && <Modal title="Follow the evidence." close={() => setCitation(null)}><div className="source-detail"><span className="tag neutral">{citation.kind === 'web' ? `Web ${citation.content_type || 'extract'}` : citation.kind === 'graph' ? 'Graphiti-extracted relationship' : citation.kind === 'finding' ? 'Researcher-saved finding' : citation.kind === 'brief' ? 'Reading brief' : 'Source passage'}{citation.page ? ` · page ${citation.page}` : ''}</span><h3>{citation.title}</h3><p className="source-text" dir="auto">{citation.text}</p>{citation.kind === 'web' && citation.search_id ? <><p className="small-note">Retrieved {citation.retrieved_at ? new Date(citation.retrieved_at).toLocaleString() : 'during this search'} · {new URL(citation.url).hostname}</p><button className="button secondary" disabled={!!busy} onClick={() => perform('Keeping this web source…', async () => {const s = await api<Source>('/web/import', {search_id: citation.search_id, result_id: citation.id}); await reload(); setCitation(null); setSource(s);})}>Keep in library<ArrowDownToLine size={15}/></button></> : <button className="button secondary" onClick={() => {setSource(sources.find(s => s.id === citation.source_id) || null); setCitation(null);}}>Open full source<ArrowRight size={15}/></button>}</div></Modal>}
    {modal === 'connections' && <Modal title="Your research setup." close={() => setModal(null)}><div className="connection-list">{config?.providers.map(p => <div key={p.id}><span className="connection-icon">{p.id === 'local' ? <Network size={18}/> : <Sparkles size={18}/>}</span><div><strong>{p.name}</strong><span>{p.model}</span></div><span className={`tag ${p.configured ? 'sage' : 'neutral'}`}>{p.configured ? 'Configured' : 'Unavailable'}</span></div>)}<div><span className="connection-icon"><Layers size={18}/></span><div><strong>Local embeddings</strong><span>{config?.embedding.model}</span></div><span className={`tag ${config?.embedding.configured ? 'sage' : 'neutral'}`}>{config?.embedding.configured ? 'Installed' : 'Unavailable'}</span></div><div><span className="connection-icon"><GitBranch size={18}/></span><div><strong>{config?.graph.engine}</strong><span>Extraction · {config?.graph.extraction_model}</span></div><span className={`tag ${graph?.status === 'ready' ? 'sage' : 'neutral'}`}>{graph?.status === 'ready' ? 'Connected' : 'Unavailable'}</span></div><div><span className="connection-icon"><Globe2 size={18}/></span><div><strong>Internet research</strong><span>Tavily · public web and research repositories</span></div><span className={`tag ${config?.web.configured ? 'sage' : 'neutral'}`}>{config?.web.configured ? 'Configured' : 'Unavailable'}</span></div></div><p className="small-note">Keys stay on the backend. Configured confirms local setup, not provider quota. Explore Artificial Analysis data in Models.</p></Modal>}
    {modal === 'about' && <Modal title="A library that learns with you." close={() => setModal(null)}><div className="about-flow"><div><span>01</span><BookOpen size={23}/><h3>Collect evidence.</h3><p>Add papers and notes. These become your searchable library.</p></div><div><span>02</span><Sparkles size={23}/><h3>Ask your research.</h3><p>Retrieve passages, or ask a model for an answer with inspectable citations.</p></div><div><span>03</span><GitBranch size={23}/><h3>Keep the insight.</h3><p>Explicitly save a finding. Reuse it later and connect its ideas in Graphiti.</p></div></div><div className="about-boundary"><strong>Where answers come from</strong><p>Your imported sources and saved findings, plus dated web evidence when you enable internet research. Search results enter the library only when you choose to keep them. Viewing an arXiv original is a reading action; upload it to add its full text to retrieval.</p></div><div className="about-next"><span className="eyebrow">NEXT RESEARCH MILESTONES</span><p><b>1.</b> Discover public research and create cited study materials in Studio.</p><p><b>2.</b> Review generated claims and save supported findings into versioned memory.</p><p><b>3.</b> Next: build a held-out research question set and measure citation support across local and hosted models.</p></div><button className="button primary" onClick={() => setModal(null)}>Back to the lab<ArrowRight size={15}/></button></Modal>}
  </div>;
}
