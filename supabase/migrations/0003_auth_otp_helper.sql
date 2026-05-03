-- ============================================================================
-- Nexvelon · 0003 · Auth OTP middleware helper
-- ============================================================================
-- Adds a single SECURITY DEFINER RPC that the Next.js middleware calls on
-- every request to decide whether to redirect the caller to /auth/verify-otp.
--
-- public.auth_otp has no SELECT policy for `authenticated` (deliberate — the
-- service role is the only one that should ever read it directly). But
-- middleware needs to ask "does the current user have an unconsumed OTP?"
-- without dragging the service-role key into the Edge runtime. This RPC
-- runs as the function owner, bypasses RLS, and only returns a boolean.
-- ============================================================================

create or replace function public.has_pending_otp()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.auth_otp
    where user_id = auth.uid()
      and used_at is null
      and expires_at > now()
  );
$$;

comment on function public.has_pending_otp() is
  'True when the current authenticated user has an unconsumed, unexpired email-OTP row. Called by Next.js middleware to gate access during the second factor.';

-- Allow authenticated users to call the function. They cannot read the row
-- itself, only the boolean answer.
grant execute on function public.has_pending_otp() to authenticated;
