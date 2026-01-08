import { useCallback, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export interface FeedToken {
  _id: Id<"calendarFeedTokens">;
  _creationTime: number;
  name: string;
  isActive: boolean;
  includePrivate: boolean;
  lastAccessedAt?: number;
  accessCount: number;
  expiresAt?: number;
  tokenPreview: string;
}

export interface NewFeedToken {
  _id: Id<"calendarFeedTokens">;
  token: string;
  name: string;
  expiresAt?: number;
}

/**
 * Generate feed URLs for a given token
 * Supports both HTTP and webcal:// protocols
 * webcal:// is the preferred protocol for calendar subscriptions as it
 * triggers native calendar app handlers on most devices
 */
export function getFeedUrls(token: string): {
  https: string;
  webcal: string;
  googleCalendar: string;
} {
  // Feed endpoints are served by Convex HTTP actions at .convex.site (not .convex.cloud)
  // VITE_CONVEX_URL is like "https://xxx.convex.cloud" for WebSocket/API
  // HTTP routes are served from "https://xxx.convex.site"
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  const baseUrl = convexUrl
    .replace(/^wss?:/, 'https:')
    .replace('.convex.cloud', '.convex.site');
  const feedPath = `/feed/${token}`;

  const httpsUrl = `${baseUrl}${feedPath}`;
  // webcal:// is the standard protocol for calendar subscriptions
  // It triggers the native calendar app on iOS, macOS, and some Android devices
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:');

  // Google Calendar subscription URL format
  // This opens Google Calendar's "Add by URL" dialog directly
  const googleCalendarUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  return {
    https: httpsUrl,
    webcal: webcalUrl,
    googleCalendar: googleCalendarUrl,
  };
}

export function useFeeds() {
  // Store newly created token to show to user (only shown once)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<NewFeedToken | null>(null);

  // Queries
  const feeds = useQuery(api.feeds.queries.list, {});

  // Mutations
  const createMutation = useMutation(api.feeds.mutations.create);
  const revokeMutation = useMutation(api.feeds.mutations.revoke);
  const removeMutation = useMutation(api.feeds.mutations.remove);

  const createFeed = useCallback(async (data: {
    name: string;
    includePrivate?: boolean;
    expiresInDays?: number;
  }) => {
    const result = await createMutation(data);
    // Store the newly created token so it can be shown to the user
    setNewlyCreatedToken(result as NewFeedToken);
    return result;
  }, [createMutation]);

  const revokeFeed = useCallback(async (id: Id<"calendarFeedTokens">) => {
    return await revokeMutation({ id });
  }, [revokeMutation]);

  const removeFeed = useCallback(async (id: Id<"calendarFeedTokens">) => {
    return await removeMutation({ id });
  }, [removeMutation]);

  const clearNewToken = useCallback(() => {
    setNewlyCreatedToken(null);
  }, []);

  return {
    feeds: (feeds ?? []) as FeedToken[],
    isLoading: feeds === undefined,
    newlyCreatedToken,
    createFeed,
    revokeFeed,
    removeFeed,
    clearNewToken,
  };
}
