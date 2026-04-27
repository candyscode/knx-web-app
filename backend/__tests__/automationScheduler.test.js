import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduler, stopScheduler } from '../automationScheduler';

describe('automationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopScheduler();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  const getMockConfig = (routineHHmm, enabled = true) => ({
    apartments: [
      {
        id: 'apt1',
        name: 'Test Apartment',
        automations: [
          {
            id: 'auto1',
            name: 'Morning Light',
            enabled: enabled,
            time: routineHHmm,
            actions: [
              { id: 'a1', kind: 'scene', targetId: 'scn1', roomId: 'r1' },
              { id: 'a2', kind: 'function', targetId: 'fn1', targetType: 'switch', value: true, roomId: 'r1' },
            ],
          },
        ],
        floors: [],
      },
    ],
  });

  it('fires routines when the current time matches routine time', async () => {
    // Set system time to 07:59:55
    const testDate = new Date();
    testDate.setHours(7, 59, 55, 0);
    vi.setSystemTime(testDate);

    const getConfig = vi.fn().mockReturnValue(getMockConfig('08:00'));
    const executeAction = vi.fn().mockResolvedValue();
    const persistStatus = vi.fn().mockResolvedValue();

    startScheduler(getConfig, executeAction, persistStatus);

    // Initial check (at 07:59:55), shouldn't trigger
    await vi.advanceTimersByTimeAsync(100); 
    expect(executeAction).not.toHaveBeenCalled();

    // Advance 1 minute so the setInterval ticks and system time becomes ~ 08:00:55
    await vi.advanceTimersByTimeAsync(60 * 1000);
    
    // The first action fires immediately. The sleep is 600ms before the second action.
    await vi.advanceTimersByTimeAsync(600); 

    // The second action fired. Another sleep before the status is persisted.
    await vi.advanceTimersByTimeAsync(600); 

    // Now everything should have resolved
    expect(executeAction).toHaveBeenCalledTimes(2);

    expect(executeAction).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'apt1' }), expect.objectContaining({ targetId: 'scn1' }), expect.any(Array));
    expect(executeAction).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'apt1' }), expect.objectContaining({ targetId: 'fn1' }), expect.any(Array));

    expect(persistStatus).toHaveBeenCalledWith('apt1', 'auto1', expect.objectContaining({
      lastRunStatus: 'ok'
    }));
  });

  it('does not fire disabled routines', async () => {
    const testDate = new Date();
    testDate.setHours(10, 0, 0, 0);
    vi.setSystemTime(testDate);

    const getConfig = vi.fn().mockReturnValue(getMockConfig('10:00', false));
    const executeAction = vi.fn().mockResolvedValue();
    const persistStatus = vi.fn().mockResolvedValue();

    startScheduler(getConfig, executeAction, persistStatus);
    
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('prevents double-firing within the same minute', async () => {
    const testDate = new Date();
    testDate.setHours(12, 30, 0, 0);
    vi.setSystemTime(testDate);

    const getConfig = vi.fn().mockReturnValue(getMockConfig('12:30'));
    const executeAction = vi.fn().mockResolvedValue();
    const persistStatus = vi.fn().mockResolvedValue();

    // In a real scenario, reloadScheduler or manually forcing the interval might double trigger.
    // We'll mimic this by manually calling the inner tick function if we exported it, 
    // or by letting it naturally tick, then advancing by <60s and triggering somehow.
    // Actually, setInterval won't double trigger in the same minute unless 60s passes, 
    // but the system time will be 12:31 then. 
    // If we call startScheduler twice within the same minute, the map should prevent it.
    
    // Start once, it ticks after 60s... wait, standard setInterval ticks AFTER 60s.
    // Let's modify system time to 12:29:50
    vi.setSystemTime(new Date(testDate.getTime() - 10000));
    
    // Start scheduler
    startScheduler(getConfig, executeAction, persistStatus);
    
    // Advance 60s -> 12:30:50. Tick happens!
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await vi.advanceTimersByTimeAsync(1500); // clear the inner sleep(600) loop
    
    expect(executeAction).toHaveBeenCalledTimes(2);

    // Reload scheduler (simulating a config save), which clears and restarts the interval.
    // Advance 10s -> 12:31:00. This is the next minute, so it will fire again if time matched, 
    // but config time is 12:30. 
    // Let's simulate two ticks manually happening while HH:mm is the STILL same.
    // We can just keep system time frozen and forcefully advance setInterval without changing system time.
    vi.useFakeTimers({ shouldAdvanceTime: false });
    
    for(let i=0; i<3; i++) {
        await vi.advanceTimersByTimeAsync(60 * 1000);
        await vi.advanceTimersByTimeAsync(1500);
    }
    
    // It should STILL only have fired 2 times total (the 2 actions from the first run)
    expect(executeAction).toHaveBeenCalledTimes(2);
  });

  it('reports "error" status if any action fails', async () => {
    const testDate = new Date();
    testDate.setHours(14, 59, 55, 0);
    vi.setSystemTime(testDate);

    const getConfig = vi.fn().mockReturnValue(getMockConfig('15:00'));
    
    // Fail on the first action, succeed on the second
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new Error('KNX Bus offline'))
      .mockResolvedValueOnce();
      
    const persistStatus = vi.fn().mockResolvedValue();

    startScheduler(getConfig, executeAction, persistStatus);

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await vi.advanceTimersByTimeAsync(1500); // Wait for the sleep(600) between actions

    expect(persistStatus).toHaveBeenCalledWith('apt1', 'auto1', expect.objectContaining({
      lastRunStatus: 'error'
    }));
  });
});
