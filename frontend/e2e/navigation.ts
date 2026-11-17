import {expect, type Page} from '@playwright/test';

export async function navigate(page: Page, name: string) {
  if (['Discover', 'Experiments', 'Models'].includes(name)) {
    await page.getByRole('button', {name: 'More', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'More tools'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name, exact: true}).click();
    await expect(dialog).not.toBeVisible();
  } else {
    await page.getByRole('button', {name, exact: true}).click();
  }
}

export async function openGraph(page: Page) {
  await navigate(page, 'Memory');
  await page.getByRole('button', {name: 'Graph', exact: true}).click();
}
