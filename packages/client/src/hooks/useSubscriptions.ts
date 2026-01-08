import { useCallback, useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export interface Subscription {
  _id: Id<"calendarSubscriptions">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;
  url: string;
  color: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncAt?: number;
  lastSyncError?: string;
  etag?: string;
  lastModified?: string;
  visible?: boolean; // Show/hide calendar events (defaults to true)
}

export interface SyncResult {
  success: boolean;
  eventsAdded?: number;
  eventsUpdated?: number;
  eventsDeleted?: number;
  error?: string;
}

export function useSubscriptions() {
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Queries
  const subscriptions = useQuery(api.subscriptions.queries.list, {});

  // Mutations
  const createMutation = useMutation(api.subscriptions.mutations.create);
  const updateMutation = useMutation(api.subscriptions.mutations.update);
  const removeMutation = useMutation(api.subscriptions.mutations.remove);
  const triggerSyncAction = useAction(api.subscriptions.mutations.triggerSync);

  const createSubscription = useCallback(async (data: {
    name: string;
    url: string;
    color: string;
    autoSync?: boolean;
    syncIntervalMinutes?: number;
  }) => {
    return await createMutation(data);
  }, [createMutation]);

  const updateSubscription = useCallback(async (
    id: Id<"calendarSubscriptions">,
    data: {
      name?: string;
      color?: string;
      autoSync?: boolean;
      syncIntervalMinutes?: number;
      visible?: boolean;
    }
  ) => {
    return await updateMutation({ id, ...data });
  }, [updateMutation]);

  const removeSubscription = useCallback(async (id: Id<"calendarSubscriptions">) => {
    return await removeMutation({ id });
  }, [removeMutation]);

  /**
   * Manually trigger a sync for a subscription
   * Useful when users want immediate updates instead of waiting for the cron job
   */
  const syncSubscription = useCallback(async (id: Id<"calendarSubscriptions">): Promise<SyncResult> => {
    setSyncingIds(prev => new Set(prev).add(id));
    try {
      const result = await triggerSyncAction({ id });
      return result;
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [triggerSyncAction]);

  /**
   * Check if a subscription is currently being synced
   */
  const isSyncing = useCallback((id: Id<"calendarSubscriptions">) => {
    return syncingIds.has(id);
  }, [syncingIds]);

  return {
    subscriptions: (subscriptions ?? []) as Subscription[],
    isLoading: subscriptions === undefined,
    createSubscription,
    updateSubscription,
    removeSubscription,
    syncSubscription,
    isSyncing,
  };
}
