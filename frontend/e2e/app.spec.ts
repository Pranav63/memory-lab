import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {navigate} from './navigation';

test('workspace, library and a real evidence citation', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1100});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'What will you discover?', exact: true})).toBeVisible();
  await expect(page.locator('.source-card')).toHaveCount(0);
  const question = page.getByRole('textbox', {name: 'Ask a question', exact: true});
  await expect(question).toBeEmpty();
  await expect(page.getByLabel('Answer provider', {exact: true})).not.toBeVisible();
  const options = page.locator('summary').filter({hasText: 'Research options'});
  await options.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Answer provider', {exact: true})).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Answer provider', {exact: true})).not.toBeVisible();
  await question.fill('How should we evaluate long-term research memory?');
  await page.getByRole('button', {name: 'Find evidence', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Evidence', exact: true})).toBeVisible();
  await page.locator('.citation-row button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Library', exact: true}).click();
  await page.getByLabel('Search library').fill('LoCoMo');
  await expect(page.locator('.source-card')).toHaveCount(1);
  await page.locator('.source-card').click();
  await expect(page.getByText('Original reading brief · full paper not imported', {exact: true})).toBeVisible();
  const before = page.context().pages().length;
  await page.getByRole('button', {name: 'Original paper', exact: true}).click();
  await expect(page.locator('.pdf-sheet')).toHaveAttribute('data-rendered', 'true');
  await expect(page.locator('.pdf-text-layer')).toContainText('Long-Term');
  await page.getByRole('button', {name: 'Next page', exact: true}).click();
  await expect(page.locator('.pdf-toolbar')).toContainText('Page 2');
  await expect(page.locator('.pdf-sheet')).toHaveAttribute('data-rendered', 'true');
  await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
  await expect(page.locator('.pdf-toolbar')).toContainText('125%');
  await expect(page.locator('.pdf-sheet')).toHaveAttribute('data-rendered', 'true');
  expect(page.context().pages()).toHaveLength(before);
  expect(await page.getByRole('dialog').evaluate(node => getComputedStyle(node, '::backdrop').backdropFilter)).toContain('blur');
  await page.getByRole('button', {name: 'Reading brief', exact: true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('a saved finding and its revised version survive reloading', async ({page}) => {
  const token = 'orchid-' + Date.now();
  const original = `The browser check confirms that ${token} findings remain available between research sessions.`;
  const revised = `The revised ${token} finding retains evidence provenance between research sessions.`;
  await page.goto('/');
  await page.getByRole('button', {name: 'Memory', exact: true}).click();
  await page.getByRole('button', {name: 'Save a finding', exact: true}).first().click();
  await page.getByRole('dialog').getByLabel('The finding').fill(original);
  await page.getByRole('dialog').getByRole('button', {name: 'Save finding', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', {name: 'Memory', exact: true}).click();
  const finding = page.locator('.finding-card').filter({hasText: token});
  await expect(finding).toBeVisible();
  await finding.locator('summary').click();
  await finding.getByRole('button', {name: 'Revise finding'}).click();
  await page.getByRole('dialog').getByLabel('The finding').fill(revised);
  await page.getByRole('dialog').getByRole('button', {name: 'Save revision', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.finding-card').filter({hasText: token})).toBeVisible();
  await page.getByRole('button', {name: 'Timeline', exact: true}).click();
  await expect(page.locator('.timeline')).toContainText(original);
  await expect(page.locator('.timeline')).toContainText(revised);
});

test('comparison isolates three conditions and exports the saved snapshot', async ({page}) => {
  await page.goto('/');
  await navigate(page, 'Experiments');
  await page.locator('summary').filter({hasText: 'Comparison settings'}).click();
  await page.getByRole('checkbox', {name: 'LoCoMo: evaluating long-term memory'}).check();
  await page.getByRole('textbox', {name: 'One question. Three conditions.'}).fill('What does LoCoMo evaluate about long-term memory?');
  await page.getByRole('button', {name: 'Compare conditions', exact: true}).click();
  await expect(page.locator('.condition-card')).toHaveCount(3);
  await expect(page.locator('.condition-card').first()).toContainText('0');
  await page.locator('.condition-answer > summary').nth(1).click();
  await expect(page.locator('.condition-card').nth(1).getByRole('heading', {name: 'Evidence', exact: true})).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', {name: 'Export JSON'}).click();
  expect((await download).suggestedFilename()).toMatch(/^memory-lab-.*\.json$/);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('desktop pages, keyboard dialogs and reduced motion remain accessible', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  for (const tab of ['Workspace','Discover','Library','Studio','Memory','Experiments','Models']) {
    await navigate(page, tab);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: `../artifacts/${tab.toLowerCase()}-desktop.png`, fullPage: true});
  }
  await page.getByRole('button', {name: 'Add source', exact: true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('mobile pages keep every navigation action reachable', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  for (const tab of ['Workspace','Discover','Library','Studio','Memory','Experiments','Models']) {
    await navigate(page, tab);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path: `../artifacts/${tab.toLowerCase()}-mobile.png`, fullPage: true});
  }
  await page.getByRole('button', {name: 'Models and connections', exact: true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
});

test('import a note from the UI and inspect it after reload', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Add source', exact: true}).click();
  const dialog = page.getByRole('dialog');
  const title = 'Browser notebook ' + Date.now();
  await dialog.getByLabel('Source title').fill(title);
  await dialog.getByLabel('Paste source text').fill('This original browser note explores how citations make research memory auditable across sessions.');
  await dialog.getByRole('button', {name: 'Add to library'}).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', {name: 'Library', exact: true}).click();
  await page.getByLabel('Search library').fill(title);
  await expect(page.locator('.source-card')).toHaveCount(1);
  await page.locator('.source-card').click();
  await expect(page.getByRole('dialog')).toContainText('This original browser note');
  await page.getByText('Source provenance', {exact: true}).click();
  await expect(page.getByRole('dialog')).toContainText('Local semantic embeddings stored.');
});


test('sidebar collapse and motion control preserve navigation', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.getByRole('button',{name:'Collapse navigation'}).click();
  await expect(page.locator('.app')).toHaveClass(/rail-collapsed/);
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand navigation'}).click();
  await page.getByRole('button',{name:'Pause animations'}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-motion','off');
  await page.getByRole('button',{name:'What this lab does'}).click();
  await expect(page.getByRole('dialog')).toContainText('Search results enter the library only when you choose to keep them.');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
});

test('real model catalog supports search and a three-model shortlist', async ({page}) => {
  await page.goto('/');
  await navigate(page,'Models');
  await expect(page.locator('.model-table tbody tr').first()).toBeVisible();
  await page.locator('.shortlist-button').nth(0).click();
  await page.locator('.shortlist-button').nth(1).click();
  await page.locator('.shortlist-button').nth(2).click();
  await expect(page.locator('.model-compare-card')).toHaveCount(3);
  await expect(page.locator('.shortlist-button').nth(3)).toBeDisabled();
  const firstName = await page.locator('.model-compare-card h3').first().textContent();
  await page.getByLabel('Search models',{exact:true}).fill(firstName!);
  expect(await page.locator('.model-table tbody tr').count()).toBeGreaterThan(0);
  await expect(page.locator('.model-table tbody')).toContainText(firstName!);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Clear shortlist'}).click();
  await expect(page.locator('.model-compare-card')).toHaveCount(0);
  await page.getByText('What these scores tell you',{exact:true}).click();
  await expect(page.getByText(/These are external language-model benchmarks/)).toBeVisible();
});
