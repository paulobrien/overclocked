/**
 * OVERCLOCKED — Playwright e2e: the core race flow.
 *
 * Runs against the Vite dev server in mock mode (no API keys). Covers the
 * user-visible journey a judge would take: lobby → browse tasks → GO → watch a
 * race → pause/resume → end → see the winner banner. Mock lanes race
 * deterministically, so these are stable.
 */
import { test, expect } from '@playwright/test';

test.describe('the core race flow', () => {
  test('lobby renders the logo, task explorer, and GO button', async ({ page }) => {
    await page.goto('/');
    // the logo wordmark
    await expect(page.getByText('OVERCLOCKED')).toBeVisible();
    // the task explorer shows shipped tasks (as selectable chips)
    await expect(page.getByRole('button', { name: /Label Parse/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Damage Assess/ })).toBeVisible();
    // the GO button
    await expect(page.getByRole('button', { name: /GO$/ })).toBeVisible();
    // mock-mode indicator
    await expect(page.getByText(/MOCK LANES/i).first()).toBeVisible();
  });

  test('clicking a task in the explorer shows its scenarios', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Hazmat Check').click();
    // the selected task's scenarios appear (blurb text)
    await expect(page.getByText(/UN class/i).first()).toBeVisible();
  });

  test('the agent roster "How it works" panel is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/How it works/i)).toBeVisible();
    // the 4 non-orchestrator roles render with their job descriptions (unique text)
    await expect(page.getByText(/classifies the exception type/i)).toBeVisible();
    await expect(page.getByText(/specialist task agent/i)).toBeVisible();
    await expect(page.getByText(/Independently reviews/i)).toBeVisible();
  });

  test('GO starts a mock race: lanes, scoreboard, and controls render', async ({ page }) => {
    await page.goto('/');
    // use the shortest window for a fast e2e
    await page.getByText('15s Blitz').click();
    await page.getByRole('button', { name: /^▶ GO$/ }).click();

    // we're now in the race — the cabinet's lane headers appear
    await expect(page.getByText('Cerebras', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Challenger', { exact: false }).first()).toBeVisible();
    // the controls bar (End is always present during a race)
    await expect(page.getByRole('button', { name: /⏹ End/ })).toBeVisible();
    // the agent legend in the footer
    await expect(page.getByText('Router').first()).toBeVisible();
  });

  test('End scores the race and shows the winner banner', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^▶ GO$/ }).click();
    // let a couple items process so the summary is meaningful
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /⏹ End/ }).click();

    // the win banner appears with a winner
    await expect(page.getByText(/WINS/i)).toBeVisible();
    // and the ROI line (banner-specific wording)
    await expect(page.getByText(/parcels resolved correctly/i)).toBeVisible();
    // "New race" returns to lobby
    await page.getByRole('button', { name: /New race/i }).click();
    await expect(page.getByText('OVERCLOCKED')).toBeVisible();
  });

  test('Reset returns to the lobby from a running race', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^▶ GO$/ }).click();
    await expect(page.getByText('Cerebras', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: /Reset/i }).click();
    // back in the lobby
    await expect(page.getByRole('button', { name: /GO$/ })).toBeVisible();
  });

  test('a 15s blitz race ends on its own and shows the banner', async ({ page }) => {
    await page.goto('/');
    await page.getByText('15s Blitz').click();
    await page.getByRole('button', { name: /^▶ GO$/ }).click();
    // wait for the natural end (15s + margin)
    await expect(page.getByText(/WINS/i)).toBeVisible({ timeout: 25000 });
  });
});
