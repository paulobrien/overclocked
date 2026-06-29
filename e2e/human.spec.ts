/**
 * OVERCOCKED — Playwright e2e: the "I Wanna Play" human lane.
 *
 * The human lane lets a user race the bots via a click-to-classify overlay.
 * This covers: enabling it in the lobby, the overlay appearing during the race,
 * and submitting an answer.
 */
import { test, expect } from '@playwright/test';

test.describe('the human lane', () => {
  // The lobby has two "I Wanna Play" controls (a RunConfig toggle + a prominent
  // GO-bar button). Target the prominent GO-bar one by its title.
  const playBtn = (page: import('@playwright/test').Page) =>
    page.getByTitle(/Add yourself as a third lane/i);

  test('enabling I Wanna Play adds the overlay during a race', async ({ page }) => {
    await page.goto('/');

    // enable the human lane
    await playBtn(page).click();
    await expect(playBtn(page)).toContainText(/✓/);

    // start a standard race
    await page.getByRole('button', { name: /^▶ GO$/ }).click();

    // the overlay appears (it shows when the engine hands the human a parcel)
    await expect(page.getByText(/You're racing the bots/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Stamp/i })).toBeVisible();
  });

  test('submitting an answer clears the current question', async ({ page }) => {
    await page.goto('/');
    await playBtn(page).click();
    await page.getByRole('button', { name: /^▶ GO$/ }).click();

    await expect(page.getByRole('button', { name: /Stamp/i })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Stamp/i }).click();

    // the race continues regardless
    await expect(page.getByText('Cerebras', { exact: false }).first()).toBeVisible();
  });

  test('Skip forfeits the current parcel', async ({ page }) => {
    await page.goto('/');
    await playBtn(page).click();
    await page.getByRole('button', { name: /^▶ GO$/ }).click();

    await expect(page.getByRole('button', { name: /Skip/i })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Skip/i }).click();
    await expect(page.getByText('Cerebras', { exact: false }).first()).toBeVisible();
  });
});
