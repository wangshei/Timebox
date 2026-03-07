/**
 * Client-side sharing service.
 * Calls the share-invite Supabase edge function.
 */

import { supabase } from '../supabaseClient';
import type { ShareScope } from '../types/sharing';

async function callEdgeFunction(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('share-invite', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Create a new share at any hierarchy level and invite members. */
export async function createShare(params: {
  scope: ShareScope;
  scopeId: string;
  displayName?: string;
  emails: string[];
  includeExisting?: boolean;
  pushToGoogle?: boolean;
}): Promise<{
  shareId: string;
  memberCount: number;
  inviteLinks: Array<{ email: string; link: string }>;
}> {
  return callEdgeFunction({ action: 'create_share', ...params });
}

/** Add a member to an existing share. */
export async function addShareMember(params: {
  shareId: string;
  email: string;
  pushToGoogle?: boolean;
}): Promise<{ memberId: string; token: string }> {
  return callEdgeFunction({ action: 'add_member', ...params });
}

/** Remove a member from a share. */
export async function removeShareMember(params: {
  shareId: string;
  memberId: string;
}): Promise<void> {
  await callEdgeFunction({ action: 'remove_member', ...params });
}

/** Accept or decline a share invite (can be called without auth). */
export async function respondToInvite(params: {
  token: string;
  status: 'accepted' | 'declined';
}): Promise<{ success: boolean }> {
  // This uses a direct fetch since the respondent may not be authenticated
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase not configured');

  const res = await fetch(`${supabaseUrl}/functions/v1/share-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'respond', ...params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/** List shares the current user owns. */
export async function getMyShares(): Promise<unknown[]> {
  const result = await callEdgeFunction({ action: 'my_shares' });
  return result.shares;
}

/** List shares the current user is a member of (accepted). */
export async function getSharedWithMe(): Promise<unknown[]> {
  const result = await callEdgeFunction({ action: 'shared_with_me' });
  return result.shares;
}
