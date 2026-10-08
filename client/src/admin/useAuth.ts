import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoginInput, PublicUser } from "@shared/users";
import { queryClient } from "@/lib/queryClient";
import { api, ApiError, ME_KEY } from "./api";

/** The logged-in staff user: undefined while loading, null when logged out. */
export function useCurrentUser() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<PublicUser>("GET", "/api/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) => api<PublicUser>("POST", "/api/auth/login", input),
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api("POST", "/api/auth/logout"),
    onSettled: () => {
      // Drop every other cached staff query so nothing leaks to the next login.
      // ME_KEY is updated rather than removed: removing it would detach the
      // portal's observer and leave the logged-in screen showing.
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    },
  });
}
