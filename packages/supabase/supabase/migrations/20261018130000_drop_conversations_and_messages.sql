-- Drop conversations and messages (FIT-192).
--
-- The old ai-agent edge function wrote them; it is gone. The Coach keeps its
-- Conversations in eve (ADR 0005), with coach_sessions as their ACL, and
-- nothing reads or writes these tables anymore. Their few rows go with them.
-- Dropping them also drops their policies, grants, indexes and the
-- reject_retired_user_id trigger on conversations.
DROP TABLE public.messages;
DROP TABLE public.conversations;
