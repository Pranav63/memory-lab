# Research Memory Lab

An evidence workspace for AI researchers: discover public research, create cited study materials, review claims and preserve versioned findings. Import a source, save a finding with its origin, and retrieve it in a later session. Experiments compare the same question with no workspace context, source retrieval, and source retrieval plus memory.

## Run

```sh
cd research-memory-lab
./start.sh
```

Open **http://127.0.0.1:5180**. The backend runs at **http://127.0.0.1:8020**. Docker Desktop and Ollama must be running. The launcher starts the project graph service, frontend and backend. Ctrl+C stops the frontend and backend; the graph database remains running with its persistent volume. Starting the launcher again reports an already-running workspace or a port conflict.

For a fresh installation, run `./setup.sh` first. It installs Python and frontend dependencies and the small local embedding model. Install a local generator through Ollama separately, or select hosted GPT. The configured generator on this Mac is `glm4-en:latest`.

## First walkthrough

1. Open **Library**. The starter collection contains four original paper briefs linked to the public RAG, LoCoMo, Mem0 and Zep papers, plus an illustrative research notebook. These are reading aids, not full papers or published experimental results.
2. Use **Add source** to import a readable PDF, UTF-8 text file, Markdown note or pasted passage. PDF uploads retain page references. Scanned PDFs need OCR first. Limits: 20 MB, 100 pages and 200,000 extracted characters.
3. Save a finding from a source. In **Memory**, expand that finding and choose **Connect in graph** to extract its relationships with Graphiti. Extraction uses the configured Groq model; embeddings run locally. Saving a finding alone does not call a language model.
4. In **Workspace**, ask a question. **Evidence preview** displays actual retrieved passages without generation. **Local Ollama** and **Hosted GPT** generate answers using those passages. Click a citation to inspect its origin.
5. Open **More → Experiments** to compare three conditions. Expand **Comparison settings** to optionally select the sources retrieval should find, then inspect each result or export the saved JSON. Expected evidence labels are never sent to the generator.
6. Revise a finding. The old version remains in **Memory → Timeline** and is excluded from current memory retrieval. Questions, comparisons and findings remain available after restarting the app.

The sidebar keeps **Workspace**, **Library**, **Memory** and **Studio** in view. **More** opens discovery, experiments and model scores. Workspace starts with a blank question and three optional research starters: **Compare approaches**, **Connect ideas** and **Find a research gap**. A starter fills and focuses the question without submitting or changing your provider; it clears the displayed result while retaining its history. Starters tuck away as you write; **Explore starters** opens them again. Decorative paper motion respects both appearance and system preferences. Research options stay closed until needed; the selected provider and context remain visible. Previous questions open from the clock button. Evidence preview starts with two passages; **Show all evidence** reveals the rest without losing citations. Library uses compact rows that open in the reading room.

## Reading room and model explorer

Open any source to read it in an overlay with a blurred backdrop. **Original paper** displays an uploaded PDF or fetches a linked arXiv PDF on request. The embedded PDF.js reader provides selectable text, page navigation and zoom without relying on a browser PDF plugin. New PDF uploads preserve the original document across restarts. Older uploads from before this reader release retain their extracted text; upload them again to retain the PDF. Previewing a linked original does not import its full text into retrieval. Upload it to make it searchable.

**More → Models** connects to the Artificial Analysis free language-model data API. Refresh the catalog explicitly, search or sort models by intelligence, output speed and output price, and shortlist up to three for comparison. The latest snapshot persists locally with its timestamp and index version. Missing measurements remain blank; external scores are distinct from the lab’s experiments. A shortlist does not install or activate a generator. Speech benchmarks are linked for reference; the lab currently uses text models.

Set `ARTIFICIAL_ANALYSIS_API_KEY` in the ignored backend `.env`, or reference an existing file with `ARTIFICIAL_ANALYSIS_ENV_FILE` and `ARTIFICIAL_ANALYSIS_KEY_NAME`. Restart after changing configuration. Credentials never enter frontend responses. Attribution links appear alongside model data.

Use the top-bar **Appearance** palette button to choose **Iris**, **Lagoon** or **Ember**. The canvas, navigation and primary accents update immediately. Theme, decorative motion and navigation width are remembered in this browser. Pause motion in Appearance or with the desktop top-bar control; system reduced-motion preferences also take priority. The internet-research switch has a whole-row target and keyboard focus.

The sliding navigation highlight, one-time viewport reveals and tactile card frames adapt interaction patterns from Mirraya’s marketing site to the lab’s themes. Hover previews a navigation item; keyboard focus follows the same highlight, while `aria-current` still identifies the selected page. Upcoming content reveals on scroll and becomes visible immediately when focused. Mobile navigation fits narrow screens, and decorative motion respects both Appearance and system preferences. Manrope and Space Grotesk are served locally, with their original SIL Open Font License notices in `frontend/public/fonts/`.

**Memory** separates **Findings**, **Graph** and **Timeline** so one view opens at a time. The graph explorer searches entity names and relationship text, highlights selected connections, and provides map/list views, zoom and fit controls. Drag empty canvas to pan or focus the canvas and use arrow keys. Select an entity with a click, Enter or Space to inspect its actual Graphiti relationship text. Where an edge references an active finding's episode, its source opens in the reading room. Unmatched relationships do not invent a source link. Colours distinguish entities visually; they do not score evidence strength. Empty and unavailable graphs remain explicit.

## What it does, and what comes next

The loop is **discover → collect → question → create → review → remember → evaluate**. Internet searches stay as dated snapshots; importing a result is explicit. Studio converts selected source passages into cited material. Human reviews record whether each item is supported, uncertain or contradicted. A supported item can be saved as a finding linked to a chosen cited source and the review; indexing remains a separate action.

This is not yet a defensible moat or a general replacement for NotebookLM. NotebookLM already has discovery and rich study outputs; Google AI Studio supports building model applications and agents. The lab's focus is an inspectable research process: retained evidence snapshots, human verdict history, versioned findings, local or hosted generation, and memory experiments. A defensible asset would be a useful domain-specific collection of reviewed claims and labelled evaluation questions built through real use.

Next research work: a held-out question set with citation-support labels, repeated and counterbalanced trials, and research threads linking reviewed evidence over time. These are future work.

## Internet discovery and Studio

**More → Discover** searches Tavily (basic depth, up to five results). A repository filter restricts results to arXiv, ACL Anthology and OpenReview. Inspect each result in the workspace and choose **Keep source** to import its cached text. Search excerpts and page extracts are labelled separately; neither is guaranteed to include a complete paper. Imports retain query, provider, retrieval date and the search snapshot ID. Identical URL/text imports reuse the existing source. Original websites are optional external links; cached evidence previews and papers remain in the reading room.

In **Workspace**, open **Research options** and enable **Include internet research** for a question to combine up to four library/memory passages with up to four dated web passages. This action uses search credits, plus generation credits when hosted GPT is selected. Search results do not silently enter the library. Experiments reject live web search: import evidence first so all conditions use the same corpus.

Set `TAVILY_API_KEY` in the backend environment, or use `TAVILY_ENV_FILE` / `TAVILY_KEY_NAME` to reference an existing local credential. No key is sent to the UI. Search failures require an explicit retry; the app does not silently substitute an offline answer.

**Studio** provides research reports, flip flashcards, multiple-choice quizzes, expandable concept maps, evidence tables, slide decks and visual infographics. Open **Choose sources** to select up to eight sources, pick an **Output format**, and set your topic. **Generation settings** selects a local or hosted generator. Saved creations, claim reviews and export details open on request. Each format is generated from up to two selected passages per source, retains source hashes and an evidence snapshot, and persists across restarts. Every item must cite IDs actually supplied to the generator. That validates provenance, not factual support. Reading briefs are clearly identified; import full papers before detailed conclusions.

Inspect an item's citations and save a human verdict. Reviews append to an audit trail. Only an item whose latest verdict is **supported** can be promoted to memory; promotion is explicit and avoids duplicate findings for the same item. Later reviews do not automatically delete a previously saved finding: revise it in Memory when your judgment changes. A finding is linked to one selected cited source; the complete multi-source evidence remains in its Studio snapshot. Nothing is automatically indexed in Graphiti.

Export evidence tables as CSV, other study outputs as Markdown, and complete evidence/generation snapshots as JSON. Slides and infographics are rendered interactively in the browser; there is no PowerPoint, narrated audio or video generation in this release. Studio uses live generators; automated browser checks use a labelled deterministic fixture in a separate temporary database.

## Components

| Component | Implementation |
|---|---|
| UI | React 19, TypeScript, Vite 8, Lucide; expandable detail panels and reduced-motion support |
| API and persistence | FastAPI; local SQLite with FTS5, source hashes, findings and history |
| Source retrieval | `nomic-embed-text:v1.5` via Ollama; exact cosine similarity and FTS5 rankings combined by reciprocal rank fusion |
| Graph memory | `graphiti-core==0.30.2`; dedicated FalkorDB `v4.22.0` container and persistent volume |
| Graph extraction | Groq `openai/gpt-oss-120b`; researcher review required for extracted relationships |
| Internet discovery | Tavily Search; dated snapshots and explicit source imports |
| Research Studio | Structured outputs with item citations, append-only human reviews and guarded finding promotion |
| Generators | Ollama `glm4-en:latest` or pinned GPT `gpt-5.2-2025-12-11` |

SQLite holds the original source text, source/page chunks, saved findings and previous versions. Graphiti holds extracted entities, relationships and source episodes. Only graph facts traced to an active finding enter research context. When graph retrieval is unavailable, the result explicitly identifies the saved-finding keyword search instead.

Credentials are backend-only. The ignored `.env` contains references to existing local environment files, not copied secret values. To use your own setup, define `OPENAI_API_KEY` and `GROQ_API_KEY`, or `OPENAI_ENV_FILE`/`OPENAI_KEY_NAME` and `GROQ_ENV_FILE`/`GROQ_KEY_NAME`. `OPENAI_BASE_URL`, `OPENAI_MODEL`, `LOCAL_MODEL` and `GRAPH_MODEL` select the providers. No frontend key fields are required.

## What the comparison measures

Both retrieval conditions have the same budget: up to six snippets of 600 characters each. The memory condition makes room for saved findings and eligible Graphiti facts. The no-context condition supplies no workspace evidence and instructs generators to state that workspace evidence is absent. This tests workspace grounding, not unrestricted general knowledge.

The same selected generator and question are used in sequential calls. Exports preserve contexts, source and memory hashes, prompt hash, returned generator model, embedding model, latency and reported usage. A changed workspace snapshot marks the comparison for rerunning. Local model tags and Ollama execution state may change; this first release does not establish a fully pinned hardware benchmark.

**Expected-source recall** measures how many researcher-selected sources appear in retrieved context. It does not measure answer accuracy or citation entailment. Citation IDs are checked against the supplied context; researchers must still review whether each passage supports the claim. Evidence preview has no generated answer and no model accuracy score. Latency includes retrieval and generation, with sequential ordering and no counterbalancing.

GPT generation cost is an estimate using reference token prices of $1.75/M input, $0.175/M cached input and $14/M output; gateway billing may differ. Graph extraction spend is separate. Local inference has no API fee; hardware and electricity are not measured. Failed requests retain failure status rather than an invented successful result.

Source retrieval currently scans locally stored vectors, suitable for a small personal corpus. This version has no web crawler, OCR, multi-user hosting, automatic memory extraction from every chat, or universal model leaderboard. Further research can add a held-out question set, labelled citation entailment, randomized condition order and repeated trials.

## Verification

```sh
.venv/bin/python -m pytest -q
npm run build --prefix frontend
npm run test:e2e --prefix frontend
```

Existing browser checks use evidence preview rather than paid generation. New Studio and discovery checks start an isolated API on port 8021 with deterministic, labelled fixtures and a temporary database. The normal workspace must be running on 5180/8020; Playwright starts and stops the fixture API automatically. On this Mac, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chromium headless-shell executable if the default Playwright browser has not been installed.

## References

- [Apple disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) and [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [NotebookLM / Gemini Notebook discovery](https://support.google.com/gemininotebook/answer/16215270?hl=en)
- [Google AI Studio agents](https://ai.google.dev/gemini-api/docs/aistudio-agents)
- [Graphiti source and integration](https://github.com/getzep/graphiti)
- [PDF.js rendering library](https://mozilla.github.io/pdf.js/)
- [Artificial Analysis data API](https://artificialanalysis.ai/data-api/docs)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [RAG paper](https://arxiv.org/abs/2005.11401), [LoCoMo paper](https://arxiv.org/abs/2402.17753), [Mem0 paper](https://arxiv.org/abs/2504.19413), [Zep paper](https://arxiv.org/abs/2501.13956)
