import {expect, test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {navigate} from './navigation';

// Preview actions use the isolated fixture API, never paid search or generation.
test.beforeEach(async ({page}) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); url.port = '8021';
    const response = await route.fetch({url: url.toString()}); await route.fulfill({response});
  });
});

test('research directions and format choices never start work automatically', async ({page}) => {
  const writes: string[] = [];
  page.on('request', r => {if(r.method() === 'POST') writes.push(r.url());});
  await page.goto('/'); await navigate(page, 'Discover');
  await expect(page.getByRole('checkbox',{name:'Research repositories only'})).not.toBeVisible();
  await page.getByRole('button',{name:'Reliable retrieval',exact:true}).click();
  await expect(page.getByLabel('Where should we look?')).toBeFocused();
  await expect(page.getByLabel('Where should we look?')).toHaveValue('Evaluating retrieval augmented generation evidence reliability');
  const options = page.locator('.discovery-options > summary');
  await options.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox',{name:'Research repositories only'})).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox',{name:'Research repositories only'})).not.toBeVisible();
  await navigate(page, 'Studio');
  await page.getByLabel('Output format',{exact:true}).selectOption('flashcards');
  await expect(page.locator('.creation-format')).toContainText('question-and-answer study cards');
  await expect(page.locator('.source-picker input').first()).not.toBeVisible();
  await expect(page.getByLabel('Studio provider')).not.toBeVisible();
  expect(writes).toEqual([]);
});

test('mobile catalog exposes every comparison metric and shortlist control', async ({page}) => {
  await page.setViewportSize({width:320,height:844});
  await page.route('**/api/models', route => route.fulfill({json:{configured:true,updated_at:'2026-10-07T00:00:00Z',index_version:4,source:'Browser fixture',models:Array.from({length:4},(_,i)=>({id:String(i),name:`Browser fixture model ${i+1}`,slug:String(i),creator:'Test fixture',intelligence:40-i,coding:null,agentic:null,input_price:1,output_price:2,speed:80,first_token:.5}))}}));
  await page.goto('/'); await navigate(page,'Models');
  const first = page.locator('.model-table tbody tr').first();
  await expect(first.locator('[data-label="Intelligence"]')).toBeVisible();
  await expect(first.locator('[data-label="Tokens / sec"]')).toBeVisible();
  await expect(first.locator('[data-label="Output / 1M"]')).toBeVisible();
  const button = first.getByRole('button',{name:'Shortlist Browser fixture model 1'});
  const bounds = await button.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await button.click(); await expect(button).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.model-compare-card')).toContainText('Browser fixture model 1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
