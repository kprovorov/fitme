-- Add UNIQUE constraint on profiles.user_id to enforce one profile per user.
-- Required for upsert by user_id to work correctly.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
