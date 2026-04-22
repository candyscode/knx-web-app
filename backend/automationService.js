'use strict';

const { getApartmentById } = require('./configModel');

function parseAutomationTime(time) {
  if (typeof time !== 'string') return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return { hours, minutes };
}

function getLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getScheduledDate(now, time) {
  const parsedTime = parseAutomationTime(time);
  if (!parsedTime) return null;

  const scheduled = new Date(now);
  scheduled.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  return scheduled;
}

function hasAutomationRunToday(automation, now) {
  if (!automation?.lastRunAt) return false;
  const lastRun = new Date(automation.lastRunAt);
  if (Number.isNaN(lastRun.getTime())) return false;
  return getLocalDateKey(lastRun) === getLocalDateKey(now);
}

function isAutomationDue(automation, now = new Date()) {
  if (!automation || automation.enabled === false) return false;
  if (automation.frequency !== 'daily') return false;

  const scheduledDate = getScheduledDate(now, automation.time);
  if (!scheduledDate) return false;
  if (now < scheduledDate) return false;

  return !hasAutomationRunToday(automation, now);
}

function getDueAutomations(config, now = new Date()) {
  return (config?.apartments || []).flatMap((apartment) =>
    (apartment.automations || [])
      .filter((automation) => isAutomationDue(automation, now))
      .map((automation) => ({ apartmentId: apartment.id, automation }))
  );
}

function getAreasForScope(config, apartmentId, scope) {
  if (scope === 'shared') {
    return Array.isArray(config?.building?.sharedAreas) ? config.building.sharedAreas : [];
  }

  const apartment = getApartmentById(config, apartmentId);
  return Array.isArray(apartment?.floors) ? apartment.floors : [];
}

function findRoomForAction(config, apartmentId, action) {
  const areas = getAreasForScope(config, apartmentId, action.scope);
  const area = areas.find((entry) => entry.id === action.areaId) || null;
  const preferredRooms = Array.isArray(area?.rooms) ? area.rooms : [];
  const fallbackRooms = areas.flatMap((entry) => Array.isArray(entry.rooms) ? entry.rooms : []);

  const room = preferredRooms.find((entry) => entry.id === action.roomId)
    || fallbackRooms.find((entry) => entry.id === action.roomId)
    || null;

  return { area, room };
}

function normalizeAutomationValue(type, rawValue) {
  if (type === 'switch') {
    return rawValue === true || rawValue === 1 || rawValue === '1' || rawValue === 'true';
  }

  if (type === 'percentage') {
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) return null;
    return Math.max(0, Math.min(100, parsedValue));
  }

  return rawValue;
}

function resolveAutomationAction(config, apartmentId, action) {
  const apartment = getApartmentById(config, apartmentId);
  if (!apartment) {
    return { success: false, error: 'Apartment not found' };
  }

  const { area, room } = findRoomForAction(config, apartmentId, action);
  if (!room) {
    return { success: false, error: 'Room no longer exists' };
  }

  const scope = action.scope === 'shared' ? 'shared' : 'apartment';
  const locationParts = [area?.name, room.name].filter(Boolean);

  if (action.kind === 'scene') {
    const scene = (room.scenes || []).find((entry) => entry.id === action.targetId);
    if (!scene) {
      return { success: false, error: 'Scene no longer exists' };
    }
    if (!room.sceneGroupAddress) {
      return { success: false, error: 'Scene group address is missing' };
    }

    return {
      success: true,
      label: [...locationParts, scene.name || `Scene ${scene.sceneNumber}`].join(' > '),
      payload: {
        apartmentId,
        scope,
        type: 'scene',
        groupAddress: room.sceneGroupAddress,
        sceneNumber: scene.sceneNumber,
      },
      scope,
    };
  }

  if (action.kind === 'function') {
    const func = (room.functions || []).find((entry) => entry.id === action.targetId);
    if (!func) {
      return { success: false, error: 'Function no longer exists' };
    }
    if (!func.groupAddress) {
      return { success: false, error: 'Function group address is missing' };
    }
    if (func.type !== 'switch' && func.type !== 'percentage') {
      return { success: false, error: `Function type "${func.type}" is not automation-capable` };
    }

    const normalizedValue = normalizeAutomationValue(func.type, action.value);
    if (normalizedValue === null) {
      return { success: false, error: 'Function value is invalid' };
    }

    return {
      success: true,
      label: [...locationParts, func.name || 'Function'].join(' > '),
      payload: {
        apartmentId,
        scope,
        type: func.type,
        groupAddress: func.groupAddress,
        value: normalizedValue,
      },
      scope,
    };
  }

  return { success: false, error: 'Unsupported automation action' };
}

function findAutomation(config, apartmentId, automationId) {
  const apartment = getApartmentById(config, apartmentId);
  if (!apartment) return null;
  const automation = (apartment.automations || []).find((entry) => entry.id === automationId) || null;
  return { apartment, automation };
}

async function executeAutomation(config, apartmentId, automationId, executeAction, now = new Date()) {
  const lookup = findAutomation(config, apartmentId, automationId);
  if (!lookup?.apartment || !lookup.automation) {
    return { success: false, status: 'error', error: 'Automation not found' };
  }

  const automation = lookup.automation;
  const results = [];

  if (!Array.isArray(automation.actions) || automation.actions.length === 0) {
    automation.lastRunAt = now.toISOString();
    automation.lastRunStatus = 'error';
    automation.lastRunMessage = 'Routine has no actions';
    return { success: false, status: 'error', results };
  }

  for (const action of automation.actions) {
    const resolved = resolveAutomationAction(config, apartmentId, action);
    if (!resolved.success) {
      results.push({ success: false, label: 'Unknown action', error: resolved.error });
      continue;
    }

    try {
      await executeAction(resolved.payload);
      results.push({ success: true, label: resolved.label, scope: resolved.scope });
    } catch (error) {
      results.push({
        success: false,
        label: resolved.label,
        scope: resolved.scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successCount = results.filter((entry) => entry.success).length;
  const failureCount = results.length - successCount;
  const status = failureCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'error');
  const message = failureCount === 0
    ? `Executed ${successCount} action(s)`
    : `Executed ${successCount} action(s), ${failureCount} failed`;

  automation.lastRunAt = now.toISOString();
  automation.lastRunStatus = status;
  automation.lastRunMessage = message;

  return {
    success: status === 'success',
    status,
    results,
    message,
  };
}

module.exports = {
  executeAutomation,
  getDueAutomations,
  getLocalDateKey,
  getScheduledDate,
  isAutomationDue,
  normalizeAutomationValue,
  parseAutomationTime,
  resolveAutomationAction,
};
