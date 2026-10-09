import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/services/api';

/** Server readiness (database reachable). Server state lives in React Query only. */
export function useReadiness(): UseQueryResult<'ok'> {
  return useQuery({
    queryKey: ['readiness'],
    retry: false,
    queryFn: async () => {
      const { data } = await api.GET('/api/ready');
      if (data?.status !== 'ok') throw new Error('unexpected readiness payload');
      return data.status;
    },
  });
}
