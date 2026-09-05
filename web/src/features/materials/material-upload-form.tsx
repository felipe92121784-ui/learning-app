import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { materialTypeLabel, type MaterialType, type UploadSetting } from './materials-types'
import { useUploadMaterialMutation } from './materials-queries'

interface MaterialUploadFormProps {
  moduleId: number
  settings: UploadSetting[]
  onSuccess: () => void
}

function inferMaterialType(file: File): MaterialType | null {
  const filename = file.name.toLowerCase()
  if (file.type === 'application/pdf' || filename.endsWith('.pdf')) return 'PDF'
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || filename.endsWith('.zip')) return 'ZIP'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(filename)) return 'IMAGE'
  return null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível enviar o material.'
}

export function MaterialUploadForm({ moduleId, settings, onSuccess }: MaterialUploadFormProps) {
  const upload = useUploadMaterialMutation()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedType = useMemo(() => (file ? inferMaterialType(file) : null), [file])
  const limit = selectedType ? settings.find((setting) => setting.type === selectedType) : undefined

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setValidationError(null)
    if (!nextFile) return
    const type = inferMaterialType(nextFile)
    if (!type) setValidationError('Selecione um arquivo PDF, imagem ou ZIP.')
    else {
      const setting = settings.find((item) => item.type === type)
      if (setting && nextFile.size > setting.maxSizeBytes) {
        setValidationError(`O arquivo excede o limite de ${Math.floor(setting.maxSizeBytes / 1024 / 1024)} MB para ${materialTypeLabel(type)}.`)
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return setValidationError('Selecione um arquivo.')
    if (!title.trim()) return setValidationError('Informe um título para o material.')
    if (!selectedType) return setValidationError('Selecione um arquivo PDF, imagem ou ZIP.')
    if (limit && file.size > limit.maxSizeBytes) return setValidationError(`O arquivo excede o limite de ${Math.floor(limit.maxSizeBytes / 1024 / 1024)} MB para ${materialTypeLabel(selectedType)}.`)
    setValidationError(null)
    try {
      await upload.mutateAsync({ moduleId, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}), file })
      if (fileInputRef.current) fileInputRef.current.value = ''
      setFile(null)
      setTitle('')
      setDescription('')
      onSuccess()
    } catch {
      // The mutation state supplies the visible error.
    }
  }

  return (
    <form aria-label="Enviar material" className="space-y-4" noValidate onSubmit={submit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`material-file-${moduleId}`}>Arquivo</label>
        <Input accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.zip,application/pdf,image/*,application/zip" disabled={upload.isPending} id={`material-file-${moduleId}`} onChange={selectFile} ref={fileInputRef} type="file" />
        <p className="text-sm text-muted-foreground">Formatos aceitos: PDF, imagens e ZIP.</p>
        {selectedType && limit ? <p className="text-sm text-muted-foreground">{materialTypeLabel(selectedType)}: até {Math.floor(limit.maxSizeBytes / 1024 / 1024)} MB.</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`material-title-${moduleId}`}>Título</label>
        <Input disabled={upload.isPending} id={`material-title-${moduleId}`} onChange={(event) => setTitle(event.target.value)} value={title} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`material-description-${moduleId}`}>Descrição (opcional)</label>
        <Input disabled={upload.isPending} id={`material-description-${moduleId}`} onChange={(event) => setDescription(event.target.value)} value={description} />
      </div>
      {validationError ? <Alert variant="destructive"><AlertDescription>{validationError}</AlertDescription></Alert> : null}
      {upload.isError ? <Alert variant="destructive"><AlertDescription>{errorMessage(upload.error)}</AlertDescription></Alert> : null}
      <Button disabled={upload.isPending} type="submit">{upload.isPending ? 'Enviando…' : 'Enviar material'}</Button>
    </form>
  )
}
