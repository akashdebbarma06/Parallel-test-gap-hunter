-- Add summary column to runs (used by Phase 5 AI summary)
alter table runs add column if not exists summary text;
