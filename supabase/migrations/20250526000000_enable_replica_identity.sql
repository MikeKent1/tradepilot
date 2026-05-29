-- Enable REPLICA IDENTITY FULL for Realtime subscriptions
-- This is required so that Supabase Realtime can send the complete
-- OLD record on UPDATE and DELETE events.

ALTER TABLE portfolios REPLICA IDENTITY FULL;
ALTER TABLE positions REPLICA IDENTITY FULL;
ALTER TABLE trades REPLICA IDENTITY FULL;
ALTER TABLE watchlists REPLICA IDENTITY FULL;
ALTER TABLE strategies REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;