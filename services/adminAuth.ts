// Admin role gate. Single source of truth for "is this user an admin".
//
// Currently a hardcoded email list — works for 1-2 admins. Move to an
// `is_admin` column on a user_profiles table when the list grows or when
// admin assignment becomes dynamic.

import type { User } from '@supabase/supabase-js';

export const ADMIN_EMAILS: readonly string[] = [
  'son@lovinbot.ai',
];

export function isAdmin(user: User | { email?: string | null } | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return ADMIN_EMAILS.includes(email);
}
