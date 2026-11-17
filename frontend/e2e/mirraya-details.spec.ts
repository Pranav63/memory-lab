import {expect, test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {navigate} from './navigation';

test.beforeEach(async ({page})=>{
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());url.port='8021';
    const response=await route.fetch({url:url.toString()});await route.fulfill({response});
  });
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
});

test('local fonts load and navigation preview returns to the selected page',async ({page})=>{
  const externalFonts:string[]=[];
  page.on('request',request=>{if(/fonts\.(googleapis|gstatic)\.com/.test(request.url()))externalFonts.push(request.url());});
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.fonts.check('650 14px "Manrope"')&&document.fonts.check('600 40px "Space Grotesk"'))).toBe(true);
  expect(externalFonts).toEqual([]);
  const nav=page.getByRole('navigation',{name:'Main navigation',exact:true});
  const track=nav.locator('.nav-track');
  const workspace=nav.getByRole('button',{name:'Workspace',exact:true});
  const library=nav.getByRole('button',{name:'Library',exact:true});
  await library.hover();
  await expect.poll(async()=>Math.abs((await track.boundingBox())!.y-(await library.boundingBox())!.y)).toBeLessThan(1);
  await expect(workspace).toHaveAttribute('aria-current','page');
  await page.mouse.move(800,100);
  await expect.poll(async()=>Math.abs((await track.boundingBox())!.y-(await workspace.boundingBox())!.y)).toBeLessThan(1);
  const memory=nav.getByRole('button',{name:'Memory',exact:true});
  await memory.focus();await page.keyboard.press('Enter');
  await expect(memory).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Memory',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
  await expect.poll(async()=>Math.abs((await track.boundingBox())!.width-(await memory.boundingBox())!.width)).toBeLessThan(1);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await nav.getByRole('button',{name:'Library',exact:true}).click();
  await page.screenshot({path:'../artifacts/mirraya-inspired-library.png',fullPage:true});
});

test('scroll reveals remain keyboard accessible and narrow-screen navigation fits',async ({page})=>{
  await page.setViewportSize({width:360,height:480});await page.goto('/');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await navigate(page,'Library');
  const cards=page.locator('.source-grid>.source-card');
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(4);
  const upcoming=cards.last();
  await expect(upcoming).toHaveAttribute('data-reveal','pending');
  await upcoming.focus();
  await expect(upcoming).toHaveAttribute('data-reveal','shown');
  await expect(upcoming).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:360,height:780});
  const nav=page.getByRole('navigation',{name:'Mobile navigation',exact:true});
  for(const tab of ['Workspace','Library','Memory','Studio','More']) {
    const button=nav.getByRole('button',{name:tab,exact:true});
    const bounds=(await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(360);
    await button.click();
    if(tab==='More') {
      await expect(page.getByRole('dialog',{name:'More tools'})).toBeVisible();
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
    } else await expect(button).toHaveAttribute('aria-current','page');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  for(const tab of ['Discover','Experiments','Models']) {
    await navigate(page,tab);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await nav.getByRole('button',{name:'Workspace',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('[data-reveal=pending]')).toHaveCount(0);
  await expect(page.locator('.headline-line>span').first()).toHaveCSS('animation-name','none');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'../artifacts/mirraya-inspired-workspace-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
