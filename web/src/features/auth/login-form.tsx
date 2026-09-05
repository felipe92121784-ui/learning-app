import { useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LoginCredentials } from './auth-types'

interface LoginFormProps {
  error: string | null
  isPending: boolean
  onSubmit: (credentials: LoginCredentials) => Promise<void> | void
}

export function LoginForm({ error, isPending, onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onSubmit({ email, password })
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div>
        <Label htmlFor="email">
          E-mail
        </Label>
        <Input
          autoComplete="email"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
          disabled={isPending}
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div>
        <Label htmlFor="password">
          Senha
        </Label>
        <Input
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
          disabled={isPending}
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        className="w-full"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
