import { useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatBytes, materialTypeLabel, type Material } from './materials-types'
import { useDeleteMaterialMutation, useUpdateMaterialMutation } from './materials-queries'

interface MaterialsListProps {
  moduleId: number
  materials: Material[]
  isLoading?: boolean
  error?: string | Error | null
}

function errorMessage(error: string | Error) { return typeof error === 'string' ? error : error.message }

export function MaterialsList({ moduleId, materials, isLoading = false, error }: MaterialsListProps) {
  const remove = useDeleteMaterialMutation()
  const update = useUpdateMaterialMutation()
  const [selected, setSelected] = useState<Material | null>(null)
  const [editing, setEditing] = useState<Material | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editValidationError, setEditValidationError] = useState<string | null>(null)
  if (isLoading) return <p aria-live="polite">Carregando materiais…</p>
  const ordered = [...materials].sort((left, right) => left.position - right.position)

  return (
    <section aria-label="Materiais do módulo" className="space-y-3">
      {error ? <Alert variant="destructive"><AlertDescription>{errorMessage(error)}</AlertDescription></Alert> : null}
      {remove.isError ? <Alert variant="destructive"><AlertDescription>Não foi possível remover o material.</AlertDescription></Alert> : null}
      {ordered.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum material enviado.</p> : (
        <ol className="space-y-2">
          {ordered.map((material) => <li className="flex items-center justify-between gap-3 rounded-md border p-3" key={material.id}>
            <div className="min-w-0">
              <p className="font-medium">{material.title}</p>
              <p className="text-sm text-muted-foreground">{material.originalFilename} · {materialTypeLabel(material.type)} · {formatBytes(material.size)}</p>
              {material.description ? <p className="text-sm text-muted-foreground">{material.description}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2"><Badge variant="secondary">{material.processingStatus === 'PROCESSING' ? 'Processando' : material.processingStatus}</Badge><Button aria-label={`Editar ${material.title}`} disabled={remove.isPending || update.isPending} onClick={() => { setEditing(material); setTitle(material.title); setDescription(material.description ?? ''); setEditValidationError(null) }} size="sm" type="button" variant="outline">Editar</Button><Button aria-label={`Excluir ${material.title}`} disabled={remove.isPending || update.isPending} onClick={() => setSelected(material)} size="sm" type="button" variant="destructive">Excluir</Button></div>
          </li>)}
        </ol>
      )}
      <Dialog onOpenChange={(open) => !open && setSelected(null)} open={Boolean(selected)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir material?</DialogTitle><DialogDescription>O material “{selected?.title}” será removido permanentemente.</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setSelected(null)} type="button" variant="outline">Cancelar</Button><Button disabled={remove.isPending} onClick={async () => { if (!selected) return; try { await remove.mutateAsync({ moduleId, materialId: selected.id }); setSelected(null) } catch { /* mutation error is rendered */ } }} type="button" variant="destructive">{remove.isPending ? 'Excluindo…' : 'Confirmar exclusão'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={(open) => !open && setEditing(null)} open={Boolean(editing)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar material</DialogTitle><DialogDescription>Atualize o título e a descrição do material.</DialogDescription></DialogHeader>
          <form aria-label="Editar material" className="space-y-4" noValidate onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            if (title.trim().length < 2) { setEditValidationError('Informe pelo menos 2 caracteres no título.'); return }
            setEditValidationError(null)
            if (!editing) return
            try {
              await update.mutateAsync({ moduleId, materialId: editing.id, input: { title: title.trim(), description: description.trim() || null } })
              setEditing(null)
            } catch { /* mutation error is rendered below */ }
          }}>
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="edit-material-title">Título</label><Input disabled={update.isPending} id="edit-material-title" onChange={(event) => setTitle(event.target.value)} value={title} /></div>
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="edit-material-description">Descrição (opcional)</label><Input disabled={update.isPending} id="edit-material-description" onChange={(event) => setDescription(event.target.value)} value={description} /></div>
            {editValidationError ? <Alert variant="destructive"><AlertDescription>{editValidationError}</AlertDescription></Alert> : null}
            {update.isError ? <Alert variant="destructive"><AlertDescription>Não foi possível editar o material.</AlertDescription></Alert> : null}
            <DialogFooter><Button disabled={update.isPending} onClick={() => setEditing(null)} type="button" variant="outline">Cancelar</Button><Button disabled={update.isPending} type="submit">{update.isPending ? 'Salvando…' : 'Salvar alterações'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
