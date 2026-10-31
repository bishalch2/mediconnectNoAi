const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
export const SLOT_DURATIONS = Object.freeze([5, 10, 15, 20, 30, 60]);
export const DEFAULT_SLOT_DURATION_MINUTES = 30;

export function parseDateTime(value, fieldName = 'datetime') {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value)) {
    const error = new Error(`${fieldName} must be an ISO datetime that includes a timezone, for example 2027-01-15T09:00:00+05:30.`);
    error.statusCode = 400;
    throw error;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} is not a valid datetime.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

export function timezoneSuffix(value) {
  const match = typeof value === 'string' ? value.match(/(Z|[+-]\d{2}:\d{2})$/i) : null;
  return match?.[1]?.toUpperCase() || null;
}

export function validateSlotDuration(value) {
  if (!Number.isInteger(value) || !SLOT_DURATIONS.includes(value)) {
    const error = new Error(`slotDurationMinutes must be one of: ${SLOT_DURATIONS.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export function buildSlots(start, end, slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES) {
  validateSlotDuration(slotDurationMinutes);
  const durationMs = end.getTime() - start.getTime();
  const slotMs = slotDurationMinutes * 60 * 1000;
  if (durationMs <= 0) {
    const error = new Error('endTime must be later than startTime.');
    error.statusCode = 400;
    throw error;
  }
  if (durationMs < slotMs || durationMs % slotMs !== 0) {
    const error = new Error(`Availability window must be a positive multiple of ${slotDurationMinutes} minutes.`);
    error.statusCode = 400;
    throw error;
  }
  const count = durationMs / slotMs;
  if (count > 500) {
    const error = new Error('This availability window would create more than 500 slots. Shorten the window or use a longer slot duration.');
    error.statusCode = 400;
    throw error;
  }
  const result = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += slotMs) {
    result.push({
      startTime: new Date(cursor),
      endTime: new Date(cursor + slotMs),
      durationMinutes: slotDurationMinutes,
      status: 'available',
    });
  }
  return result;
}
