import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/features/auth/login-form'

describe('LoginForm', () => {
  it('labels both credentials and exposes a generic authentication error', () => {
    const markup = renderToStaticMarkup(
      <LoginForm
        error="Não foi possível entrar. Verifique suas credenciais."
        isPending={false}
        onSubmit={vi.fn()}
      />,
    )

    expect(markup).toContain('for="email"')
    expect(markup).toContain('for="password"')
    expect(markup).toContain('type="email"')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain(
      'Não foi possível entrar. Verifique suas credenciais.',
    )
    expect(markup).toContain('data-slot="input"')
    expect(markup).toContain('data-slot="button"')
    expect(markup).toContain('data-slot="alert"')
  })
})
