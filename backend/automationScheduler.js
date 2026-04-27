'use strict';

/**
 * Automation Scheduler
 *
 * Runs a 60-second ticker. On each tick, checks all apartments' enabled automations
 * and fires actions when the current local HH:mm matches the configured time.
 *
 * Guarantees each routine fires at most once per minute by tracking the last
 * executed minute per routine.
 */

const lastFiredMinute = new Map(); // automationId -> "YYYY-MM-DDTHH:mm"

function getCurrentMinuteKey() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${m}`;
}

function getCurrentHHmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tickerHandle = null;
let getConfigFn = null;
let executeActionFn = null;
let persistStatusFn = null;

/**
 * Execute a single automation routine for a given apartment.
 * @param {object} apartment - Full apartment object from config
 * @param {object} automation - The automation to run
 * @param {object} allFloors - Combined private + shared floors for action resolution
 */
async function runAutomation(apartment, automation, allFloors) {
  console.log(`[Scheduler] Running routine "${automation.name}" for apartment "${apartment.name}"`);
  const results = [];

  for (const action of automation.actions) {
    try {
      await executeActionFn(apartment, action, allFloors);
      results.push({ id: action.id, ok: true });
    } catch (err) {
      console.error(`[Scheduler] Action ${action.id} failed:`, err.message);
      results.push({ id: action.id, ok: false, error: err.message });
    }
    await sleep(600); // 600ms gap between actions
  }

  const anyError = results.some((r) => !r.ok);
  const status = anyError ? 'error' : 'ok';
  const runAt = new Date().toISOString();

  if (persistStatusFn) {
    try {
      await persistStatusFn(apartment.id, automation.id, { lastRunAt: runAt, lastRunStatus: status });
    } catch (err) {
      console.error(`[Scheduler] Failed to persist run status for "${automation.name}":`, err.message);
    }
  }

  console.log(`[Scheduler] Routine "${automation.name}" finished — status: ${status}`);
}

async function tick() {
  if (!getConfigFn) return;

  const config = getConfigFn();
  if (!Array.isArray(config?.apartments)) return;

  const currentHHmm = getCurrentHHmm();
  const currentMinuteKey = getCurrentMinuteKey();

  for (const apartment of config.apartments) {
    if (!Array.isArray(apartment.automations)) continue;

    // Build full floors list (private + shared) for action resolution
    const sharedAreas = Array.isArray(config.building?.sharedAreas) ? config.building.sharedAreas : [];
    const allFloors = [
      ...(Array.isArray(apartment.floors) ? apartment.floors : []),
      ...sharedAreas,
    ];

    for (const automation of apartment.automations) {
      if (!automation.enabled) continue;
      if (automation.time !== currentHHmm) continue;

      const key = `${automation.id}__${currentMinuteKey}`;
      if (lastFiredMinute.has(key)) continue; // already fired this minute

      lastFiredMinute.set(key, true);

      // Fire async, don't await so we don't block subsequent routines
      runAutomation(apartment, automation, allFloors).catch((err) => {
        console.error(`[Scheduler] Unhandled error in routine "${automation.name}":`, err);
      });
    }
  }

  // Prune old keys to prevent memory leak (keep only last 2 minutes)
  const twoMinsAgoMs = Date.now() - 2 * 60 * 1000;
  for (const key of lastFiredMinute.keys()) {
    const parts = key.split('__');
    if (parts.length < 2) { lastFiredMinute.delete(key); continue; }
    const ts = new Date(parts[1]);
    if (ts.getTime() < twoMinsAgoMs) lastFiredMinute.delete(key);
  }
}

/**
 * Start the scheduler.
 * @param {Function} getConfig - Returns the current in-memory config object
 * @param {Function} executeAction - async (apartment, action, allFloors) => void
 * @param {Function} persistStatus - async (apartmentId, automationId, {lastRunAt, lastRunStatus}) => void
 */
function startScheduler(getConfig, executeAction, persistStatus) {
  getConfigFn = getConfig;
  executeActionFn = executeAction;
  persistStatusFn = persistStatus;

  if (tickerHandle) clearInterval(tickerHandle);
  tickerHandle = setInterval(() => { tick().catch(console.error); }, 60 * 1000);

  console.log('[Scheduler] Automation scheduler started (60s interval)');
}

/**
 * Reload scheduler (call after config changes). Restarts the interval cleanly.
 */
function reloadScheduler() {
  if (!getConfigFn || !executeActionFn) return;
  if (tickerHandle) clearInterval(tickerHandle);
  tickerHandle = setInterval(() => { tick().catch(console.error); }, 60 * 1000);
  console.log('[Scheduler] Automation scheduler reloaded');
}

function stopScheduler() {
  if (tickerHandle) { clearInterval(tickerHandle); tickerHandle = null; }
}

module.exports = { startScheduler, reloadScheduler, stopScheduler };
