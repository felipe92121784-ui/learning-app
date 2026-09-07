import { queryOptions, useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { getProtectedMaterialView, requestOriginalDownload } from './protected-viewer-api'
import { protectedMaterialViewQueryKey } from './protected-viewer-cache'

export function protectedMaterialViewQueryOptions(materialId: number) {
  return queryOptions({
    queryKey: [...protectedMaterialViewQueryKey, materialId] as const,
    queryFn: ({ signal }) => getProtectedMaterialView(materialId, signal),
  })
}

export function useProtectedMaterialViewQuery(materialId: number) {
  return useQuery(protectedMaterialViewQueryOptions(materialId))
}

export function useOriginalDownloadMutation() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const pendingCount = useRef(0)
  const latestRequestId = useRef(0)

  const mutateAsync = useCallback(async (materialId: number) => {
    const requestId = ++latestRequestId.current
    pendingCount.current += 1
    setIsPending(true)
    setError(null)
    try {
      const download = await requestOriginalDownload(materialId)
      if (requestId === latestRequestId.current) setError(null)
      return download
    } catch (caught) {
      if (requestId === latestRequestId.current) {
        setError(
          caught instanceof Error ? caught : new Error('Unable to request original download'),
        )
      }
      throw caught
    } finally {
      pendingCount.current -= 1
      if (pendingCount.current === 0) setIsPending(false)
    }
  }, [])

  const reset = useCallback(() => setError(null), [])

  return { mutateAsync, isPending, error, reset }
}
