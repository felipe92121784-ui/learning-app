import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MaterialType } from '@/features/materials/materials-types'
import { listUploadSettings, updateUploadSetting } from './upload-settings-api'

export const uploadSettingsQueryKeys = {
  all: ['upload-settings'] as const,
  list: () => ['upload-settings', 'list'] as const,
}

export function uploadSettingsQueryOptions() {
  return queryOptions({ queryKey: uploadSettingsQueryKeys.list(), queryFn: listUploadSettings })
}

export function useUploadSettingsQuery() { return useQuery(uploadSettingsQueryOptions()) }

export function useUpdateUploadSettingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, maxSizeMb }: { type: MaterialType; maxSizeMb: number }) => updateUploadSetting(type, maxSizeMb),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: uploadSettingsQueryKeys.list() })
    },
  })
}
