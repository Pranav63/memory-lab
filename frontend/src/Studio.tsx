import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, GitBranch, Layers, LoaderCircle, Palette, Presentation, RotateCw, ShieldCheck, Table2, WandSparkles } from 'lucide-react';
import { api } from './api';
import { Disclosure } from './components';
import type { Artifact, Config, Context, Review, Source, StudioItem } from './types';
import './studio-clean.css';
import './tools-overhaul.css';

const FORMATS = [
  {id: 'report', name: 'Research report', color: 'violet', icon: FileText, description: 'Build a readable argument, one cited claim at a time.'},
  {id: 'flashcards', name: 'Flashcards', color: 'rose', icon: Layers, description: 'Turn key ideas into question-and-answer study cards.'},
  {id: 'quiz', name: 'Quiz', color: 'amber', icon: CircleHelp, description: 'Test your understanding, then check the cited evidence.'},
  {id: 'mindmap', name: 'Mind map', color: 'mint', icon: GitBranch, description: 'Explore suggested connections between your sources.'},
  {id: 'table', name: 'Evidence table', color: 'blue', icon: Table2, description: 'Compare claims, scope and limitations side by side.'},
  {id: 'slides', name: 'Slide deck', color: 'peach', icon: Presentation, description: 'Shape a source-backed story into focused slides.'},
  {id: 'infographic', name: 'Infographic', color: 'lilac', icon: Palette, description: 'Give your cited takeaways a visual structure.'},
];
const nameOf = (id: string) => FORMATS.find(f => f.id === id)?.name || id;
function download(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], {type})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Studio({sources, config, inspect, saved}: {sources: Source[]; config: Config | null; inspect: (c: Context) => void; saved: () => Promise<void>}) {
  const [format, setFormat] = useState('report');
  const [topic, setTopic] = useState('How should we evaluate memory for AI research agents?');
  const [selected, setSelected] = useState<string[]>([]);
  const [provider, setProvider] = useState('local');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [history, setHistory] = useState<Artifact[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [verdict, setVerdict] = useState('uncertain');
  const [note, setNote] = useState('');
  const [anchor, setAnchor] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const chosen = FORMATS.find(f => f.id === format)!;
  const FormatIcon = chosen.icon;
  useEffect(() => {api<Artifact[]>('/history?kind=artifact').then(setHistory).catch(() => setError('Saved creations could not be loaded.'));}, []);
  useEffect(() => {let current = true; setReviews([]); if (artifact?.status === 'completed') api<Review[]>(`/studio/${artifact.id}/reviews`).then(r => {if (current) setReviews(r);}).catch(() => {if (current) setError('Reviews could not be loaded.');}); return () => {current = false;};}, [artifact?.id, artifact?.status]);
  const item = artifact?.items[reviewIndex];
  const latest = reviews.find(r => r.item_index === reviewIndex);
  const promoted = reviews.find(r => r.item_index === reviewIndex && r.finding_id);
  useEffect(() => {setVerdict(latest?.verdict || 'uncertain'); setNote(''); setAnchor(item?.citations[0] || '');}, [artifact?.id, reviewIndex, latest?.id]);
  async function create(e: FormEvent) {
    e.preventDefault(); setBusy('create'); setError(''); setMessage('');
    try {const a = await api<Artifact>('/studio', {format, topic, source_ids: selected, provider}); setArtifact(a); setReviewIndex(0); setHistory(h => [a, ...h]);}
    catch (e) {setError(e instanceof Error ? e.message : 'Generation failed.');} finally {setBusy('');}
  }
  async function review(e: FormEvent) {
    e.preventDefault(); if (!artifact) return; setBusy('review'); setError('');
    try {setReviews(await api<Review[]>(`/studio/${artifact.id}/reviews`, {item_index: reviewIndex, verdict, note})); setMessage('Review saved. Previous verdicts remain in the audit trail.');}
    catch (e) {setError(e instanceof Error ? e.message : 'Review failed.');} finally {setBusy('');}
  }
  async function promote() {
    if (!artifact) return; setBusy('promote'); setError('');
    try {const result = await api<{reviews: Review[]}>(`/studio/${artifact.id}/promote`, {item_index: reviewIndex, context_id: anchor}); setReviews(result.reviews); await saved(); setMessage('Finding saved in memory, linked to this reviewed item and its source.');}
    catch (e) {setError(e instanceof Error ? e.message : 'Finding could not be saved.');} finally {setBusy('');}
  }
  function exportText() {
    if (!artifact) return;
    if (artifact.format === 'table') {
      const escape = (s: string) => '"' + s.replaceAll('"', '""') + '"';
      const rows = [['Approach','Claim','Evidence / scope','Citation IDs'], ...artifact.items.map(i => [i.group, i.title, i.text, i.citations.join('; ')])];
      download(rows.map(row => row.map(escape).join(',')).join('\n'), 'text/csv;charset=utf-8', 'evidence-table.csv');
    } else {
      const text = `# ${artifact.title}\n\n${artifact.summary}\n\n` + artifact.items.map(i => `## ${i.title}\n\n${i.text}\n\n` + (i.options.length ? i.options.map((o,n) => `${n+1}. ${o}${n === i.answer ? ' (correct)' : ''}`).join('\n') + '\n\n' : '') + `Evidence: ${i.citations.join(', ')}`).join('\n\n') + '\n\n## Sources\n\n' + artifact.contexts.map(c => `${c.id}: ${c.title}${c.page ? `, p. ${c.page}` : ''}\n${c.url || ''}\n${c.text}`).join('\n\n');
      download(text, 'text/markdown;charset=utf-8', 'research-' + artifact.format + '.md');
    }
  }
  const savedCreations = <Disclosure title={`Saved creations · ${history.length}`}>
    {history.length ? <div className="artifact-shelf">{history.map(a => <button key={a.id} aria-pressed={artifact?.id === a.id} onClick={() => {setArtifact(a); setReviewIndex(0);}}>
      <span className={`artifact-format tone-${FORMATS.find(f => f.id === a.format)?.color}`}><FileText size={18}/></span>
      <span><strong>{a.title}</strong><small>{nameOf(a.format)} · {a.status === 'failed' ? 'Generation failed' : new Date(a.created_at).toLocaleDateString()}</small></span><ArrowRight size={15}/>
    </button>)}</div> : <p className="small-note">Your creations will appear here.</p>}
  </Disclosure>;
  return <div className={`studio-minimal tools-page creation-page ${artifact ? 'has-output' : ''}`}>
    <header className="tools-heading"><div className="tools-heading-copy"><span className="tool-kicker"><WandSparkles size={13}/>STUDIO</span><h1>Make ideas <span>take shape.</span></h1><p>From the papers you collect to something you can learn from, review and share.</p></div>{artifact ? <button className="button secondary" onClick={() => {setArtifact(null); setError(''); setMessage('');}}><WandSparkles size={15}/>New creation</button> : <div className="creation-sculpture tool-art" aria-hidden="true"><span><FileText size={26}/><i/><i/><i/></span><span><GitBranch size={33}/><i/></span><span><Layers size={29}/><i/><i/></span><b/></div>}</header>
    {!artifact && <>
      <section className="studio-composer">
        <form onSubmit={create} className="modal-form">
          <div className={`creation-format tone-${chosen.color}`}><span className="creation-format-icon"><FormatIcon size={24}/></span><div><label htmlFor="creation-format">Output format</label><select id="creation-format" aria-label="Output format" value={format} onChange={e => setFormat(e.target.value)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><p>{chosen.description}</p></div></div>
          <details className="source-picker">
            <summary><BookOpen size={16}/><strong>{selected.length ? `${selected.length} source${selected.length === 1 ? '' : 's'} selected` : 'Choose sources'}</strong><ChevronDown size={15}/></summary>
            <div><p className="small-note">Select up to eight sources.</p>{sources.map(s => <label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={selected.length >= 8 && !selected.includes(s.id)} onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))}/><span><strong>{s.title}</strong><small>{s.kind === 'brief' ? 'Reading brief · full paper not imported' : s.kind === 'web' ? `Web ${s.origin?.content_type || 'extract'}` : s.kind === 'note' ? 'Research note' : 'Paper / passage'}</small></span></label>)}</div>
          </details>
          <label className="creation-topic">What would you like to explore?<textarea aria-label="Research topic" value={topic} onChange={e => setTopic(e.target.value)} required minLength={3} maxLength={1000} rows={3} placeholder="An idea, comparison or question…"/></label>
          <details className="studio-generation-settings">
            <summary>Generation settings<ChevronDown size={15}/></summary>
            <label>Generate with<select value={provider} onChange={e => setProvider(e.target.value)} aria-label="Studio provider">{config?.providers.filter(p => p.id !== 'evidence').map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.name}{!p.configured ? ' · unavailable' : ''}</option>)}</select></label>
            <p className="small-note">Only selected source passages are sent to the generator. Review generated claims before saving them to memory.</p>
          </details>
          <div className="studio-create-action">
            <p className="small-note">{selected.length ? `${selected.length} selected source${selected.length === 1 ? '' : 's'} · ` : 'Choose your sources to begin · '}{provider === 'local' ? 'Local generation' : 'GPT API credits'}</p>
            <button className="button primary" disabled={!!busy || !selected.length || !config?.providers.find(p => p.id === provider)?.configured}>{busy === 'create' ? <LoaderCircle className="spin" size={16}/> : <WandSparkles size={16}/>} {busy === 'create' ? 'Creating from your evidence…' : `Create ${nameOf(format).toLowerCase()}`}</button>
          </div>
        </form>
      </section>
      {savedCreations}
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {artifact && <>
      <section className="artifact-workbench" key={artifact.id}>
        <div className="artifact-heading"><div><span className="eyebrow">{nameOf(artifact.format).toUpperCase()} · MODEL-GENERATED</span><h2>{artifact.title}</h2></div><span className="artifact-evidence-count"><BookOpen size={14}/>{artifact.contexts.length} evidence passages</span></div>
        {artifact.status === 'failed' ? <p className="inline-error">{artifact.error}</p> : <>
          <ArtifactView artifact={artifact} inspect={inspect} review={i => {setReviewIndex(i); const panel = document.getElementById('evidence-review') as HTMLDetailsElement | null; if (panel) {panel.open = true; panel.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});}}}/>
          <details className="evidence-review" id="evidence-review">
            <summary className="review-heading"><ShieldCheck size={18}/><h3>Review evidence</h3></summary>
            <form onSubmit={review} className="review-form">
              <label>Item to review<select aria-label="Item to review" value={reviewIndex} onChange={e => setReviewIndex(Number(e.target.value))}>{artifact.items.map((i,n) => <option key={n} value={n}>{n+1}. {i.title}</option>)}</select></label>
              {item && <div className="review-claim"><p>{item.text}</p><Citations item={item} artifact={artifact} inspect={inspect}/></div>}
              <div className="form-pair"><label>Your verdict<select value={verdict} onChange={e => setVerdict(e.target.value)}><option value="uncertain">Uncertain / needs more evidence</option><option value="supported">Supported by cited evidence</option><option value="contradicted">Contradicted by cited evidence</option></select></label><label>Review note<input value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Scope, caveats, or conflicting evidence…"/></label></div>
              <div className="review-actions"><button className="button secondary" disabled={!!busy}><Check size={15}/>Save review</button>{latest && <span className={`tag ${latest.verdict === 'supported' ? 'sage' : 'neutral'}`}>Latest review: {latest.verdict}</span>}</div>
            </form>
            {latest?.verdict === 'supported' && <div className="promote-finding"><label>Link finding to a cited source<select aria-label="Finding source" value={anchor} onChange={e => setAnchor(e.target.value)}>{item?.citations.map(id => <option key={id} value={id}>{artifact.contexts.find(c => c.id === id)?.title}</option>)}</select></label><button className="button primary" disabled={!!busy || !!promoted} onClick={promote}><ShieldCheck size={15}/>{promoted ? 'Saved in memory' : 'Save finding to memory'}</button></div>}
            {message && <p className="success-note" role="status">{message}</p>}
          </details>
        </>}
        <Disclosure title="Details & export">
          {artifact.summary && <p className="small-note">{artifact.summary}</p>}
          <p className="small-note">{artifact.model} · {artifact.latency_ms} ms · {artifact.contexts.length} selected passages. {artifact.provider === 'local' ? 'No generation API fee; hardware costs are unmeasured.' : artifact.estimated_cost_usd != null ? `Estimated generation spend: $${artifact.estimated_cost_usd.toFixed(5)}.` : 'Generation spend unavailable.'}</p>
          {artifact.warnings.map(w => <p className="small-note" key={w}>{w}</p>)}
          <p className="small-note">Evidence snapshot: <code>{artifact.evidence_sha256.slice(0, 20)}…</code></p>
          <div className="artifact-exports">{artifact.status === 'completed' && <button className="button secondary" onClick={exportText}><ArrowDownToLine size={14}/>{artifact.format === 'table' ? 'CSV' : 'Markdown'}</button>}<a className="button secondary" href={`/api/history/${artifact.id}/export`} download><ArrowDownToLine size={14}/>Full snapshot</a></div>
          {reviews.length > 0 && <section className="studio-review-history"><h3>Review history · {reviews.length}</h3><div className="review-history">{reviews.map(r => <div key={r.id}><span className="tag neutral">{r.verdict}</span><p><strong>{artifact.items[r.item_index]?.title}</strong><br/>{r.note || 'No additional note.'}<small>{new Date(r.created_at).toLocaleString()}{r.finding_id ? ' · saved in memory' : ''}</small></p></div>)}</div></section>}
        </Disclosure>
      </section>
      {savedCreations}
    </>}
  </div>;
}

function Citations({item, artifact, inspect}: {item: StudioItem; artifact: Artifact; inspect: (c: Context) => void}) {
  return <div className="citation-row">{item.citations.map(id => {const c = artifact.contexts.find(c => c.id === id); return c ? <button key={id} onClick={() => inspect(c)} type="button"><BookOpen size={12}/>{c.title}{c.page ? ` · p. ${c.page}` : ''}</button> : null;})}</div>;
}
function ArtifactView({artifact: a, inspect, review}: {artifact: Artifact; inspect: (c: Context) => void; review: (i: number) => void}) {
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [branch, setBranch] = useState('');
  const item = a.items[position];
  const references = (i: StudioItem) => <Citations item={i} artifact={a} inspect={inspect}/>;
  const reviewButton = (n: number) => <button className="text-button" onClick={() => review(n)}><ShieldCheck size={13}/>Review evidence</button>;
  function step(n: number) {setPosition(n); setFlipped(false);}
  if (a.format === 'flashcards') return <div className="flashcard-stage"><span className="tag lilac">CARD {position+1} / {a.items.length}</span><button className={`study-card ${flipped ? 'is-flipped' : ''}`} aria-label={flipped ? 'Show question' : 'Reveal answer'} aria-pressed={flipped} onClick={() => setFlipped(!flipped)}><span className="study-card-inner"><span className="study-face study-front" aria-hidden={flipped}><span>THE QUESTION</span><strong>{item.title}</strong><small><RotateCw size={14}/>Click to reveal</small></span><span className="study-face study-back" aria-hidden={!flipped}><span>THE ANSWER</span><strong>{item.text}</strong><small>Click to return to the question</small></span></span></button>{flipped && references(item)}<div className="study-controls"><button className="icon-button" aria-label="Previous card" disabled={!position} onClick={() => step(position-1)}><ArrowLeft size={19}/></button>{reviewButton(position)}<button className="icon-button" aria-label="Next card" disabled={position === a.items.length-1} onClick={() => step(position+1)}><ArrowRight size={19}/></button></div></div>;
  if (a.format === 'quiz') return <div className="quiz-stage"><div className="quiz-progress">{a.items.map((_,n) => <button key={n} aria-label={`Question ${n+1}`} aria-current={position === n ? 'step' : undefined} onClick={() => step(n)}>{checked[n] ? <Check size={14}/> : n+1}</button>)}<span>{Object.keys(checked).length} / {a.items.length} checked</span></div><h3>{item.title}</h3><div className="quiz-options">{item.options.map((o,n) => <button key={n} disabled={!!checked[position]} aria-pressed={choices[position] === n} className={checked[position] ? n === item.answer ? 'correct' : choices[position] === n ? 'incorrect' : '' : ''} onClick={() => setChoices({...choices, [position]: n})}><span>{String.fromCharCode(65+n)}</span>{o}{checked[position] && n === item.answer && <Check size={16}/>}</button>)}</div>{checked[position] ? <div className="quiz-feedback"><strong>{choices[position] === item.answer ? 'That’s right.' : 'Here’s what the evidence says.'}</strong><p>{item.text}</p>{references(item)}{reviewButton(position)}</div> : <button className="button primary" disabled={choices[position] === undefined} onClick={() => setChecked({...checked, [position]: true})}>Check answer<ArrowRight size={15}/></button>}</div>;
  if (a.format === 'slides') return <div className="slide-stage"><div className="research-slide"><span>{item.group || 'RESEARCH MEMORY LAB'} / {String(position+1).padStart(2,'0')}</span><h3>{item.title}</h3><ul>{item.text.split('\n').filter(Boolean).map((line,n) => <li key={n}>{line.replace(/^[-•]\s*/, '')}</li>)}</ul></div><div className="slide-navigation"><button className="icon-button" aria-label="Previous slide" disabled={!position} onClick={() => step(position-1)}><ArrowLeft size={19}/></button><span>{position+1} / {a.items.length}</span><button className="icon-button" aria-label="Next slide" disabled={position === a.items.length-1} onClick={() => step(position+1)}><ArrowRight size={19}/></button></div>{references(item)}{reviewButton(position)}</div>;
  if (a.format === 'mindmap') {
    const groups = [...new Set(a.items.map(i => i.group || 'Research'))];
    return <div className="mindmap-stage"><div className="map-root"><GitBranch size={23}/><strong>{a.title}</strong></div><div className="map-branches">{groups.map(g => <button key={g} aria-pressed={branch === g} onClick={() => setBranch(branch === g ? '' : g)}><span/><strong>{g}</strong><small>{a.items.filter(i => (i.group || 'Research') === g).length} concepts</small></button>)}</div>{branch ? <div className="map-concepts">{a.items.map((i,n) => (i.group || 'Research') === branch && <article key={n}><h3>{i.title}</h3><p>{i.text}</p>{references(i)}{reviewButton(n)}</article>)}</div> : <p className="map-hint">Choose a branch to reveal the cited concepts. Connections are generated suggestions for review.</p>}</div>;
  }
  if (a.format === 'table') return <div className="evidence-table-wrap"><table className="evidence-table"><caption>Claims and their reported scope. Each row links to its evidence.</caption><thead><tr><th>Approach</th><th>Claim</th><th>Evidence / limitations</th><th>Check</th></tr></thead><tbody>{a.items.map((i,n) => <tr key={n}><td><span className="tag lilac">{i.group || 'Research'}</span></td><td><strong>{i.title}</strong></td><td>{i.text}{references(i)}</td><td>{reviewButton(n)}</td></tr>)}</tbody></table></div>;
  if (a.format === 'infographic') return <div className="evidence-infographic"><div className="infographic-masthead"><span>MEMORY LAB / EVIDENCE BRIEF</span><h3>{a.title}</h3><span>{a.source_snapshot.length} sources · {a.items.length} takeaways</span></div><div className="infographic-grid">{a.items.map((i,n) => <article key={n} className={`infographic-tile info-tone-${n%4}`}><span className="info-number">{String(n+1).padStart(2,'0')}</span><small>{i.group}</small><h4>{i.title}</h4><p>{i.text}</p>{references(i)}{reviewButton(n)}</article>)}</div></div>;
  return <div className="research-report">{a.items.map((i,n) => <details key={n} open={n === 0}><summary><span>{String(n+1).padStart(2,'0')}</span><strong>{i.title}</strong><ChevronDown size={16}/></summary><div><p dir="auto">{i.text}</p>{references(i)}{reviewButton(n)}</div></details>)}</div>;
}
