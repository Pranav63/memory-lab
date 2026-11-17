import {expect, test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {navigate, openGraph} from './navigation';

// All graph fixtures and preference checks use the temporary browser database.
test.beforeEach(async ({page}) => {
  await page.route('**/api/**', async route => {
    const url=new URL(route.request().url()); url.port='8021';
    const response=await route.fetch({url:url.toString()}); await route.fulfill({response});
  });
});

test('workspace starters prepare a question and only explicit research submits it', async ({page}) => {
  const requests: {question:string; provider:string; mode:string}[]=[];
  await page.route('**/api/research',async route=>{
    const request=route.request().postDataJSON();requests.push(request);
    await route.fulfill({json:{id:'starter-evidence',question:request.question,mode:request.mode,provider:request.provider,model:'Evidence preview',status:'completed',paragraphs:[{text:'Browser fixture: research starts only after submitting a question.',citations:[]}],contexts:[],warnings:[],strategy:'Deterministic browser fixture; no model called.',latency_ms:1,evidence_recall:null,estimated_cost_usd:null}});
  });
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'What will you discover?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Collect',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'What this lab does',exact:true})).toHaveCount(0);
  const question=page.getByRole('textbox',{name:'Ask a question',exact:true});
  await expect(question).toBeEmpty();
  await expect(page.getByLabel('Answer provider',{exact:true})).not.toBeVisible();
  const options=page.locator('summary').filter({hasText:'Research options'});
  await options.click();
  await expect(page.getByLabel('Answer provider',{exact:true})).toHaveValue('evidence');
  await page.getByLabel('Research context',{exact:true}).selectOption('sources');
  await options.click();
  const starters=[
    ['Compare approaches','How do the approaches in my library differ in how they store and retrieve memory?'],
    ['Connect ideas','What connections do my saved findings reveal between the papers in my library?'],
    ['Find a research gap','What evidence is missing before I can compare these approaches fairly?'],
  ];
  for(const [name,prompt] of starters) {
    const starter=page.getByRole('button',{name,exact:true});
    await starter.focus();await page.keyboard.press('Enter');
    await expect(question).toHaveValue(prompt);await expect(question).toBeFocused();
    await expect(starter).not.toBeVisible();
    await expect(page.getByLabel('Answer provider',{exact:true})).not.toBeVisible();
    await expect(page.getByRole('button',{name:'Find evidence',exact:true})).toBeVisible();
    expect(requests).toHaveLength(0);
    const explore=page.getByRole('button',{name:'Explore starters',exact:true});
    await expect(explore).toHaveAttribute('aria-expanded','false');
    await explore.focus();await page.keyboard.press('Enter');
    await expect(explore).toHaveAttribute('aria-expanded','true');
    await expect(starter).toBeVisible();
  }
  await page.getByRole('button',{name:'Explore starters',exact:true}).click();
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.getByRole('switch',{name:'Decorative motion',exact:true}).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(page.locator('.app')).toHaveAttribute('data-motion','off');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(requests).toHaveLength(0);
  await page.getByRole('button',{name:'Find evidence',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evidence',exact:true})).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({question:starters[2][1],provider:'evidence',mode:'sources'});
  await expect(page.getByRole('button',{name:'Compare approaches',exact:true})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Find evidence',exact:true})).toBeEnabled();
});

test('workspace evidence opens progressively and every passage keeps its citation', async ({page}) => {
  const contexts=Array.from({length:4},(_,i)=>({id:'evidence-'+i,source_id:'browser-source',title:'Browser evidence '+(i+1),text:'Browser fixture passage '+(i+1),url:'',kind:'note',page:null}));
  await page.route('**/api/research',route=>route.fulfill({json:{id:'progressive-evidence',question:'How does research memory work?',mode:'memory',provider:'evidence',model:'Evidence preview',status:'completed',paragraphs:contexts.map(c=>({text:c.text,citations:[c.id]})),contexts,warnings:[],strategy:'Deterministic browser fixture; no model called.',latency_ms:1,evidence_recall:null,estimated_cost_usd:null}}));
  await page.goto('/');
  await page.getByRole('textbox',{name:'Ask a question',exact:true}).fill('How does research memory work?');
  await page.getByRole('button',{name:'Find evidence',exact:true}).click();
  await expect(page.locator('.answer-prose>div')).toHaveCount(2);
  await expect(page.getByText('Browser fixture passage 3',{exact:true})).toHaveCount(0);
  const reveal=page.getByRole('button',{name:'Show all evidence',exact:true});
  await reveal.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.answer-prose>div')).toHaveCount(4);
  await page.getByRole('button',{name:'Browser evidence 3',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Browser fixture passage 3');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Show less evidence',exact:true}).click();
  await expect(page.locator('.answer-prose>div')).toHaveCount(2);
});

test('internet switch works with keyboard and themes remember appearance preferences', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000}); await page.goto('/');
  await page.locator('summary').filter({hasText:'Research options'}).click();
  const internet=page.getByRole('switch',{name:'Include internet research',exact:true});
  await expect(internet).toBeEnabled(); await internet.focus(); await page.keyboard.press('Space');
  await expect(internet).toBeChecked();
  await page.locator('.internet-option-copy').click(); await expect(internet).not.toBeChecked();
  const copy=await page.locator('.internet-option-copy').boundingBox();
  const toggle=await page.locator('.internet-option .preference-switch').boundingBox();
  expect(copy!.x+copy!.width).toBeLessThan(toggle!.x);
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  for (const theme of ['Iris','Lagoon','Ember']) {
    await page.getByRole('button',{name:theme+' theme',exact:true}).click();
    await expect(page.locator('.app')).toHaveAttribute('data-theme',theme.toLowerCase());
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  }
  await page.getByRole('switch',{name:'Decorative motion',exact:true}).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch',{name:'Decorative motion',exact:true})).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-theme','ember');
  await expect(page.locator('.app')).toHaveAttribute('data-motion','off');
  await expect(page.getByRole('button',{name:'Expand navigation',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
  for (const theme of ['Lagoon','Ember']) {
    await page.getByRole('button',{name:'Appearance',exact:true}).click();
    await page.getByRole('button',{name:theme+' theme',exact:true}).click();
    await page.keyboard.press('Escape');
    for (const tab of ['Workspace','Discover','Library','Studio','Memory','Experiments','Models']) {
      await navigate(page,tab);
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ember theme',exact:true})).toHaveAttribute('aria-pressed','true');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/appearance-mobile.png',fullPage:true});
});

test('graph exploration finds facts, pans, zooms and opens the indexed source', async ({page}) => {
  const sources=await page.request.get('http://127.0.0.1:8021/api/sources').then(r=>r.json());
  const source=sources.find((s:{title:string})=>s.title.startsWith('LoCoMo:'));
  const names=['LoCoMo','Graphiti','Long-term memory','Mem0','Zep','Research evaluation'];
  const nodes=names.map((name,i)=>({id:'n'+i,name,summary:''}));
  const edges=[
    {id:'e0',source:'n0',target:'n2',fact:'Browser fixture: LoCoMo evaluates long-term memory.',episodes:['episode-fixture']},
    {id:'e1',source:'n1',target:'n4',fact:'Browser fixture: Graphiti represents temporal connections.',episodes:[]},
    {id:'e2',source:'n2',target:'n5',fact:'Browser fixture: long-term memory needs research evaluation.',episodes:[]},
    {id:'e3',source:'n3',target:'n2',fact:'Browser fixture: Mem0 connects with long-term memory.',episodes:[]},
    {id:'e4',source:'n4',target:'n2',fact:'Browser fixture: Zep uses long-term memory.',episodes:[]},
    {id:'e5',source:'n0',target:'n5',fact:'Browser fixture: LoCoMo informs research evaluation.',episodes:[]},
  ];
  await page.route('**/api/graph',r=>r.fulfill({json:{status:'ready',nodes,edges}}));
  await page.route('**/api/memories',r=>r.fulfill({json:[{id:'fixture-finding',source_id:source.id,source_title:source.title,text:'Browser fixture: trace an indexed finding to its source.',created_at:'2026-10-06',retired_at:null,supersedes:null,status:'indexed',error:null,episode_id:'episode-fixture'}]}));
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000}); await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/'); await openGraph(page);
  await expect(page.locator('.finding-card')).toHaveCount(0);
  await expect(page.locator('.network-entity')).toHaveCount(6);
  const entity=page.getByRole('button',{name:'Inspect LoCoMo',exact:true});
  await entity.focus(); await page.keyboard.press('Enter');
  const inspector=page.getByRole('complementary',{name:'Graph relationship details'});
  await expect(inspector).toContainText(edges[0].fact);
  await inspector.getByRole('button',{name:/LoCoMo: evaluating long-term memory/}).click();
  await expect(page.getByRole('dialog')).toContainText(source.title);
  expect(page.context().pages()).toHaveLength(1); await page.keyboard.press('Escape');
  const zoom=page.getByLabel('Graph zoom'); const before=parseInt(await zoom.innerText());
  await page.getByRole('button',{name:'Zoom in graph',exact:true}).click();
  expect(parseInt(await zoom.innerText())).toBeGreaterThan(before);
  const svg=page.getByRole('group',{name:'Interactive memory graph',exact:true});
  const world=page.locator('.network-world'); const transform=await world.getAttribute('transform');
  await svg.focus(); await page.keyboard.press('ArrowRight');
  await expect(world).not.toHaveAttribute('transform',transform!);
  const afterKeyboard=await world.getAttribute('transform'); const bounds=(await svg.boundingBox())!;
  await page.mouse.move(bounds.x+12,bounds.y+20); await page.mouse.down();
  await page.mouse.move(bounds.x+70,bounds.y+55,{steps:5}); await page.mouse.up();
  await expect(world).not.toHaveAttribute('transform',afterKeyboard!);
  await page.getByRole('button',{name:'Fit graph to view',exact:true}).click();
  await expect(zoom).toHaveText(before+'%');
  await page.getByLabel('Search memory graph').fill('temporal connections');
  await expect(page.locator('.network-entity')).toHaveCount(2);
  await page.getByLabel('Clear graph search').click();
  await page.getByRole('button',{name:'List',exact:true}).click();
  await expect(page.locator('.network-entity-list>button')).toHaveCount(6);
  await page.locator('.network-entity-list>button').filter({hasText:'Mem0'}).click();
  await expect(inspector).toContainText('Mem0 connects');
  await expect(inspector.locator('.graph-origin')).toHaveCount(0);
  await page.getByRole('button',{name:'Map',exact:true}).click();
  await page.getByLabel('Search memory graph').fill('not-an-entity');
  await expect(page.getByText('No connections match this search.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show all entities',exact:true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/memory-graph-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'List',exact:true}).click();
  await page.locator('.network-entity-list>button').filter({hasText:'Zep'}).click();
  await expect(inspector).toContainText('Zep uses');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/memory-graph-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('large graphs keep every entity reachable and show truthful unavailable states', async ({page}) => {
  let unavailable=false;
  const nodes=Array.from({length:24},(_,i)=>({id:'n'+i,name:'Research concept '+i,summary:''}));
  const edges=nodes.slice(1).map((n,i)=>({id:'e'+i,source:'n0',target:n.id,fact:'Browser fixture relationship '+i,episodes:[]}));
  await page.route('**/api/graph',r=>r.fulfill({json:unavailable?{status:'unavailable',nodes:[],edges:[],error:'Browser fixture: graph connection is offline.'}:{status:'ready',nodes,edges}}));
  await page.goto('/'); await openGraph(page);
  await expect(page.locator('.network-entity')).toHaveCount(24);
  const overlaps=await page.locator('.entity-card').evaluateAll(cards=>{
    const boxes=cards.map(card=>card.getBoundingClientRect()); const pairs:number[][]=[];
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j]; if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top) pairs.push([i,j]);
    }
    return pairs;
  });
  expect(overlaps).toEqual([]);
  const fitted=await page.locator('.network-world').getAttribute('transform');
  await page.getByLabel('Search memory graph').fill('Research concept 23');
  await expect(page.locator('.network-entity')).toHaveCount(1);
  await page.getByRole('button',{name:'Inspect Research concept 23',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary',{name:'Graph relationship details'})).toContainText('Browser fixture relationship 22');
  await expect(page.locator('.network-world')).not.toHaveAttribute('transform',fitted!);
  await page.getByLabel('Search memory graph').fill('Research concept 21');
  await expect(page.locator('.network-world')).toHaveAttribute('transform',fitted!);
  await page.getByRole('button',{name:'Inspect Research concept 21',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Graph relationship details'})).toContainText('Browser fixture relationship 20');
  await page.getByLabel('Clear graph search').click();
  await page.getByRole('button',{name:'Fit graph to view',exact:true}).click();
  await page.getByRole('button',{name:'List',exact:true}).click();
  await expect(page.locator('.network-entity-list>button')).toHaveCount(24);
  unavailable=true; await page.reload(); await openGraph(page);
  await expect(page.getByText('Browser fixture: graph connection is offline.',{exact:true})).toBeVisible();
  await expect(page.locator('.network-entity')).toHaveCount(0);
});
