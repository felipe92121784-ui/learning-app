import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useEffectiveAccessQuery } from './access-rules-queries'
import type { AccessResource, AccessSource, EffectiveAccessDecision } from './access-rules-types'

const sourceLabels: Record<AccessSource, string> = {
  COURSE: 'Curso',
  MODULE: 'Módulo',
  MATERIAL: 'Material',
  DEFAULT: 'Padrão',
}

interface EffectiveAccessSummaryProps {
  userId: number
  resource: AccessResource
}

function DecisionRow({ capability, decision }: { capability: string; decision: EffectiveAccessDecision }) {
  const decisionLabel = decision.decision === 'ALLOW' ? 'Permitir' : 'Negar'
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <span className="font-medium">{capability}</span>
      <div className="flex items-center gap-2">
        <Badge variant={decision.allowed ? 'default' : 'destructive'}>
          {decisionLabel}
        </Badge>
        <Badge variant="outline">{sourceLabels[decision.source]}</Badge>
      </div>
    </div>
  )
}

export function EffectiveAccessSummary({ userId, resource }: EffectiveAccessSummaryProps) {
  const query = useEffectiveAccessQuery({ userId, resource })

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Calculando acesso efetivo…</p>
  }

  if (query.isError || !query.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar o acesso efetivo.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card aria-label="Acesso efetivo">
      <CardHeader>
        <CardTitle>Acesso efetivo</CardTitle>
        <CardDescription>
          Decisão atual por capacidade e a regra que a determinou.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DecisionRow capability="Visualização" decision={query.data.view} />
        <DecisionRow capability="Download" decision={query.data.download} />
      </CardContent>
    </Card>
  )
}
