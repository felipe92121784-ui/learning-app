import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteMaterial, listMaterials, updateMaterial, uploadMaterial } from './materials-api'
import type { UpdateMaterialInput } from './materials-types'

export const materialsQueryKeys = {
  all: ['materials'] as const,
  list: (moduleId: number) => ['materials', 'list', moduleId] as const,
}

export function materialsQueryOptions(moduleId: number) {
  return queryOptions({ queryKey: materialsQueryKeys.list(moduleId), queryFn: () => listMaterials(moduleId) })
}

export function useMaterialsQuery(moduleId: number) {
  return useQuery(materialsQueryOptions(moduleId))
}

function useRefreshMaterials() {
  const queryClient = useQueryClient()
  return async (moduleId: number) => {
    await queryClient.invalidateQueries({ queryKey: materialsQueryKeys.list(moduleId) })
  }
}

export function useUploadMaterialMutation() {
  const refresh = useRefreshMaterials()
  return useMutation({
    mutationFn: ({ moduleId, ...input }: { moduleId: number; title: string; description?: string; file: File }) => uploadMaterial(moduleId, input),
    onSuccess: async (_material, { moduleId }) => refresh(moduleId),
  })
}

export function useUpdateMaterialMutation() {
  const refresh = useRefreshMaterials()
  return useMutation({
    mutationFn: ({ moduleId, materialId, input }: { moduleId: number; materialId: number; input: UpdateMaterialInput }) => updateMaterial(moduleId, materialId, input),
    onSuccess: async (_material, { moduleId }) => refresh(moduleId),
  })
}

export function useDeleteMaterialMutation() {
  const refresh = useRefreshMaterials()
  return useMutation({
    mutationFn: ({ moduleId, materialId }: { moduleId: number; materialId: number }) => deleteMaterial(moduleId, materialId),
    onSuccess: async (_result, { moduleId }) => refresh(moduleId),
  })
}
