import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://automationintesting.online/');
  await page.getByRole('button', { name: 'Book this room' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('ContactPhone').click();
  await page.getByTestId('ContactPhone').fill('ggg');
});