import {expect, test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {navigate} from './navigation';

// An isolated API on 8021 persists test fixtures, never the user's research database.
test.beforeEach(async ({page}) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); url.port = '8021';
    const response = await route.fetch({url: url.toString()}); await route.fulfill({response});
  });
});

test('discovery previews stay in the workspace and explicit imports persist', async ({page}) => {
  await page.goto('/'); await navigate(page,'Discover');
  const before = await page.request.get('http://127.0.0.1:8021/api/sources').then(r => r.json());
  await page.getByRole('button',{name:'Search internet',exact:true}).click();
  await expect(page.locator('.web-result')).toHaveCount(1);
  const afterSearch = await page.request.get('http://127.0.0.1:8021/api/sources').then(r => r.json());
  expect(afterSearch).toHaveLength(before.length);
  await page.locator('.web-result-title').click();
  await expect(page.getByRole('dialog')).toContainText('search excerpt');
  await expect(page.getByRole('dialog')).toContainText('A public study on memory evaluation');
  expect(page.context().pages()).toHaveLength(1);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Keep this source',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saved in library',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape'); await page.reload();
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await page.getByLabel('Search library').fill('Browser fixture: public memory study');
  await page.locator('.source-card').click();
  await page.getByText('Source provenance',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('search excerpt · retrieved');
});

test('all seven Studio formats work; reviews guard persistent memory promotion', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/'); await page.getByRole('button',{name:'Studio',exact:true}).click();
  await expect(page.locator('.source-picker input').first()).not.toBeVisible();
  await page.locator('.source-picker>summary').click();
  await page.locator('.source-picker input').first().check();
  await page.locator('.source-picker>summary').click();
  await expect(page.getByLabel('Studio provider')).not.toBeVisible();
  await page.locator('summary').filter({hasText:'Generation settings'}).click();
  await page.getByLabel('Studio provider').selectOption('gpt');
  await page.locator('summary').filter({hasText:'Generation settings'}).click();
  for (const [format, title] of [['report','Research report'],['flashcards','Flashcards'],['quiz','Quiz'],['mindmap','Mind map'],['table','Evidence table'],['slides','Slide deck'],['infographic','Infographic']]) {
    await page.getByLabel('Output format',{exact:true}).selectOption(format);
    await page.getByRole('button',{name:'Create '+title.toLowerCase(),exact:true}).click();
    await expect(page.locator('.artifact-workbench')).toContainText('Browser fixture: research memory');
    await expect(page.locator('.artifact-workbench')).toContainText(title.toUpperCase()+' · MODEL-GENERATED');
    if (format==='flashcards') {await page.getByRole('button',{name:'Reveal answer',exact:true}).click(); await expect(page.locator('.study-card')).toHaveClass(/is-flipped/); await page.getByRole('button',{name:'Next card'}).click(); await expect(page.locator('.flashcard-stage')).toContainText('CARD 2');}
    if (format==='quiz') {await page.locator('.quiz-options button').first().click(); await page.getByRole('button',{name:'Check answer',exact:true}).click(); await expect(page.locator('.quiz-feedback')).toContainText('That’s right.');}
    if (format==='mindmap') {await page.locator('.map-branches button').first().click(); await expect(page.locator('.map-concepts')).toContainText('Research finding');}
    if (format==='slides') {await page.getByRole('button',{name:'Next slide'}).click(); await expect(page.locator('.research-slide')).toContainText('Memory concept 2');}
    if (format==='table') {await page.locator('summary').filter({hasText:'Details & export'}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('evidence-table.csv');}
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../artifacts/studio-${format}-desktop.png`,fullPage:true});
    if (format !== 'infographic') await page.getByRole('button',{name:'New creation',exact:true}).click();
  }
  await expect(page.getByRole('button',{name:'Save finding to memory',exact:true})).toHaveCount(0);
  await page.locator('#evidence-review>summary').click();
  await page.getByLabel('Your verdict').selectOption('supported');
  await page.getByLabel('Review note').fill('Browser fixture review checks the citation flow.');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  await page.getByRole('button',{name:'Save finding to memory',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saved in memory',exact:true})).toBeDisabled();
  await page.reload(); await page.getByRole('button',{name:'Studio',exact:true}).click();
  await page.locator('summary').filter({hasText:/^Saved creations/}).click();
  await page.locator('.artifact-shelf>button').first().click();
  await page.locator('#evidence-review>summary').click();
  await expect(page.getByRole('button',{name:'Saved in memory',exact:true})).toBeDisabled();
  await page.locator('.review-claim .citation-row button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile Studio creation and interactive output fit the viewport', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await page.getByRole('button',{name:'Studio',exact:true}).click();
  await page.locator('summary').filter({hasText:/^Saved creations/}).click();
  await page.locator('.artifact-shelf>button').first().click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/studio-infographic-mobile.png',fullPage:true});
  await navigate(page,'Discover');
  await page.getByRole('button',{name:'Search internet',exact:true}).click();
  await expect(page.locator('.web-result')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/discover-mobile.png',fullPage:true});
});
