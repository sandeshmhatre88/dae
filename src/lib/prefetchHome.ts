import type { QueryClient } from '@tanstack/react-query';

// Fire-and-forget background refresh of everything the Home screen
// (customer-app/src/app/(tabs)/index.tsx) shows. Called only while Home is
// NOT the focused screen (its useFocusEffect cleanup, which fires on blur -
// opening a video, switching tabs) so the data is already fresh by the time
// the user comes back, instead of Home refetching (and visibly swapping
// content) right as it reappears or, worse, mid-scroll.
export function prefetchHomeData(queryClient: QueryClient, userId: number, categoryId: number | null) {
  queryClient.refetchQueries({ queryKey: ['categories'] }).catch(() => {});
  queryClient.refetchQueries({ queryKey: ['advertisements'] }).catch(() => {});
  queryClient.refetchQueries({ queryKey: ['landing-page', userId, categoryId] }).catch(() => {});
}
