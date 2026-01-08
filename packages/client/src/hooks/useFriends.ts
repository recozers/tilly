import { useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export interface Friend {
  friendshipId: Id<"friendships">;
  friendId: Id<"users">;
  email?: string;
  name?: string;
  status: string;
}

export interface FriendRequest {
  _id: Id<"friendRequests">;
  senderId?: Id<"users">;
  receiverId?: Id<"users">;
  senderEmail?: string;
  senderName?: string;
  receiverEmail?: string;
  receiverName?: string;
  status: string;
  _creationTime: number;
}

export function useFriends() {
  // Queries
  const friends = useQuery(api.friends.queries.list, {});
  const pendingRequests = useQuery(api.friends.queries.getPendingRequests, {});
  const sentRequests = useQuery(api.friends.queries.getSentRequests, {});

  // Mutations
  const sendRequestMutation = useMutation(api.friends.mutations.sendRequest);
  const acceptRequestMutation = useMutation(api.friends.mutations.acceptRequest);
  const declineRequestMutation = useMutation(api.friends.mutations.declineRequest);
  const removeFriendMutation = useMutation(api.friends.mutations.removeFriend);

  const sendRequest = useCallback(async (email: string) => {
    return await sendRequestMutation({ receiverEmail: email });
  }, [sendRequestMutation]);

  const acceptRequest = useCallback(async (requestId: Id<"friendRequests">) => {
    return await acceptRequestMutation({ requestId });
  }, [acceptRequestMutation]);

  const declineRequest = useCallback(async (requestId: Id<"friendRequests">) => {
    return await declineRequestMutation({ requestId });
  }, [declineRequestMutation]);

  const removeFriend = useCallback(async (friendId: Id<"users">) => {
    return await removeFriendMutation({ friendId });
  }, [removeFriendMutation]);

  return {
    friends: (friends ?? []) as Friend[],
    pendingRequests: (pendingRequests ?? []) as FriendRequest[],
    sentRequests: (sentRequests ?? []) as FriendRequest[],
    isLoading: friends === undefined,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
  };
}
