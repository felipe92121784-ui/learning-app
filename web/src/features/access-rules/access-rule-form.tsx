import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccessRulesQuery, useUpsertAccessRuleMutation } from './access-rules-queries'
import type { AccessCapability, AccessEffect, AccessResource, AccessRule } from './access-rules-types'

const isoUtcPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/

function isUtcIsoDateTime(value: string): boolean {
  const match = isoUtcPattern.exec(value)
  if (!match) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const [, year, month, day, hour, minute, second, fraction] = match
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second) &&
    date.getUTCMilliseconds() === Number((fraction ?? '').padEnd(3, '0') || '0')
  )
}

function validateWindow(
  startsAt: string,
  expiresAt: string,
  startField: string,
  endField: string,
  context: z.RefinementCtx,
) {
  const validStart = !startsAt || isUtcIsoDateTime(startsAt)
  const validEnd = !expiresAt || isUtcIsoDateTime(expiresAt)
  if (!validStart) {
    context.addIssue({
      code: 'custom',
      message: 'Informe uma data UTC ISO válida.',
      path: [startField],
    })
  }
  if (!validEnd) {
    context.addIssue({
      code: 'custom',
      message: 'Informe uma data UTC ISO válida.',
      path: [endField],
    })
  }
  if (startsAt && expiresAt && validStart && validEnd && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    context.addIssue({
      code: 'custom',
      message: 'O fim deve ser posterior ao início.',
      path: [endField],
    })
  }
}

const accessRuleFormSchema = z
  .object({
    view: z.enum(['ALLOW', 'DENY', 'INHERIT']),
    viewStartsAt: z.string(),
    viewExpiresAt: z.string(),
    download: z.enum(['ALLOW', 'DENY', 'INHERIT']),
    downloadStartsAt: z.string(),
    downloadExpiresAt: z.string(),
  })
  .superRefine((values, context) => {
    validateWindow(
      values.viewStartsAt,
      values.viewExpiresAt,
      'viewStartsAt',
      'viewExpiresAt',
      context,
    )
    validateWindow(
      values.downloadStartsAt,
      values.downloadExpiresAt,
      'downloadStartsAt',
      'downloadExpiresAt',
      context,
    )
  })

type AccessRuleFormValues = z.infer<typeof accessRuleFormSchema>

interface AccessRuleFormProps {
  userId: number
  resource: AccessResource
  onSaved?: () => void
}

function ruleFor(rules: AccessRule[], capability: AccessCapability) {
  return rules.find((rule) => rule.capability === capability)
}

function valuesFromRules(rules: AccessRule[]): AccessRuleFormValues {
  const view = ruleFor(rules, 'VIEW')
  const download = ruleFor(rules, 'DOWNLOAD')
  return {
    view: view?.effect ?? 'INHERIT',
    viewStartsAt: view?.startsAt ?? '',
    viewExpiresAt: view?.expiresAt ?? '',
    download: download?.effect ?? 'INHERIT',
    downloadStartsAt: download?.startsAt ?? '',
    downloadExpiresAt: download?.expiresAt ?? '',
  }
}

function accessEffectField(
  value: AccessEffect,
  onChange: (value: AccessEffect) => void,
  disabled: boolean,
  label: string,
) {
  return (
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <FormControl>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value="ALLOW">Permitir</SelectItem>
        <SelectItem value="DENY">Negar</SelectItem>
        <SelectItem value="INHERIT">Herdar</SelectItem>
      </SelectContent>
    </Select>
  )
}

function AccessRuleFormContent({ userId, resource, onSaved }: AccessRuleFormProps) {
  const target = { userId, resource }
  const directRulesQuery = useAccessRulesQuery(target)
  const upsertMutation = useUpsertAccessRuleMutation()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const hasHydratedFreshRules = useRef(false)
  const form = useForm<AccessRuleFormValues>({
    resolver: zodResolver(accessRuleFormSchema),
    defaultValues: valuesFromRules([]),
  })

  useEffect(() => {
    if (
      directRulesQuery.data &&
      !directRulesQuery.isFetching &&
      (!hasHydratedFreshRules.current || !form.formState.isDirty)
    ) {
      form.reset(valuesFromRules(directRulesQuery.data))
      hasHydratedFreshRules.current = true
    }
  }, [directRulesQuery.data, directRulesQuery.isFetching, form, form.formState.isDirty])

  const controlsDisabled =
    directRulesQuery.isFetching || directRulesQuery.isError || !directRulesQuery.data || isSaving

  async function submit(values: AccessRuleFormValues) {
    if (controlsDisabled) return

    setIsSaving(true)
    setSaveError(null)
    const results = await Promise.allSettled([
      upsertMutation.mutateAsync({
        userId,
        resourceType: resource.type,
        resourceId: resource.id,
        capability: 'VIEW',
        effect: values.view,
        startsAt: values.viewStartsAt || null,
        expiresAt: values.viewExpiresAt || null,
      }),
      upsertMutation.mutateAsync({
        userId,
        resourceType: resource.type,
        resourceId: resource.id,
        capability: 'DOWNLOAD',
        effect: values.download,
        startsAt: values.downloadStartsAt || null,
        expiresAt: values.downloadExpiresAt || null,
      }),
    ])
    setIsSaving(false)

    if (results.some((result) => result.status === 'rejected')) {
      setSaveError(
        'Não foi possível salvar todas as permissões. Algumas alterações podem ter sido salvas; confira o acesso efetivo.',
      )
      return
    }

    onSaved?.()
  }

  return (
    <Form {...form}>
      <form
        aria-label="Permissões de acesso"
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <FormField
          control={form.control}
          name="view"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visualização</FormLabel>
              {accessEffectField(field.value, field.onChange, controlsDisabled, 'Visualização')}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="viewStartsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Início da visualização (UTC ISO)</FormLabel>
              <FormControl>
                <Input disabled={controlsDisabled} placeholder="2026-09-06T12:00:00.000Z" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="viewExpiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fim da visualização (UTC ISO)</FormLabel>
              <FormControl>
                <Input disabled={controlsDisabled} placeholder="2026-09-07T12:00:00.000Z" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="download"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Download</FormLabel>
              {accessEffectField(field.value, field.onChange, controlsDisabled, 'Download')}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="downloadStartsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Início do download (UTC ISO)</FormLabel>
              <FormControl>
                <Input disabled={controlsDisabled} placeholder="2026-09-06T12:00:00.000Z" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="downloadExpiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fim do download (UTC ISO)</FormLabel>
              <FormControl>
                <Input disabled={controlsDisabled} placeholder="2026-09-07T12:00:00.000Z" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {directRulesQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar as regras diretas. Tente novamente.
            </AlertDescription>
          </Alert>
        ) : null}
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        <Button disabled={controlsDisabled} type="submit">
          {isSaving ? 'Salvando…' : 'Salvar permissões'}
        </Button>
      </form>
    </Form>
  )
}

export function AccessRuleForm(props: AccessRuleFormProps) {
  const { userId, resource } = props
  return (
    <AccessRuleFormContent
      key={`${userId}:${resource.type}:${resource.id}`}
      {...props}
    />
  )
}
