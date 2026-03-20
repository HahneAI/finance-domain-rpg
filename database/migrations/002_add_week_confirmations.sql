-- Add week_confirmations column to user_data.
-- Stores per-week check-in results keyed by weekIdx.
-- Shape: { [weekIdx]: { confirmedAt, dayToggles, scheduledDays,
--                       missedScheduledDays, pickupDays, netShiftDelta, eventId } }
ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS week_confirmations JSONB NOT NULL DEFAULT '{}';
