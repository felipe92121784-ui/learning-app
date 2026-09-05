import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { materialTypeLabel, type UploadSetting } from '@/features/materials/materials-types'
import { uploadSettingsQueryKeys, useUpdateUploadSettingMutation } from './upload-settings-queries'

interface UploadSettingsFormProps { settings: UploadSetting[] }

export function UploadSettingsForm({ settings }: UploadSettingsFormProps) {
  const update = useUpdateUploadSettingMutation()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = settings.map((setting) => ({
      type: setting.type,
      maxSizeMb: Number(values[setting.type] ?? String(setting.maxSizeBytes / 1024 / 1024)),
    }))
    if (parsed.some(({ maxSizeMb }) => !Number.isInteger(maxSizeMb) || maxSizeMb < 1 || maxSizeMb > 1024)) {
      setValidationError('Informe valores inteiros entre 1 e 1024 MB.')
      return
    }
    setValidationError(null)
    setSaveError(null)
    setSuccessMessage(null)
    setIsSaving(true)
    const results = await Promise.allSettled(parsed.map((input) => update.mutateAsync(input)))
    await queryClient.invalidateQueries({ queryKey: uploadSettingsQueryKeys.list() })
    setIsSaving(false)
    if (results.some((result) => result.status === 'rejected')) {
      setSaveError('Não foi possível salvar todos os limites. Confira os valores e tente novamente.')
      return
    }
    setSuccessMessage('Limites salvos com sucesso.')
  }

  return <form aria-label="Limites de upload" className="space-y-5" noValidate onSubmit={submit}>
    {settings.map((setting) => <div className="space-y-2" key={setting.type}><label className="text-sm font-medium" htmlFor={`upload-limit-${setting.type}`}>{materialTypeLabel(setting.type)} (MB)</label><Input disabled={isSaving} id={`upload-limit-${setting.type}`} inputMode="numeric" min="1" max="1024" onChange={(event) => setValues((current) => ({ ...current, [setting.type]: event.target.value }))} type="number" value={values[setting.type] ?? String(setting.maxSizeBytes / 1024 / 1024)} /></div>)}
    {validationError ? <Alert variant="destructive"><AlertDescription>{validationError}</AlertDescription></Alert> : null}
    {saveError || update.isError ? <Alert variant="destructive"><AlertDescription>{saveError ?? 'Não foi possível salvar os limites.'}</AlertDescription></Alert> : null}
    {successMessage ? <Alert><AlertDescription>{successMessage}</AlertDescription></Alert> : null}
    <Button disabled={isSaving} type="submit">{isSaving ? 'Salvando…' : 'Salvar limites'}</Button>
  </form>
}
