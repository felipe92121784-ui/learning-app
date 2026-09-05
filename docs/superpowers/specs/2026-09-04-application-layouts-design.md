# Layouts administrativo e do aluno

## Objetivo

Substituir o shell autenticado simples por dois layouts responsivos inspirados
na arquitetura do `layout-demo.html`, implementados com shadcn/ui: um para
ADMIN e outro para STUDENT.

## Estrutura comum

Desktop usa sidebar lateral persistente/recolhível, cabeçalho de conteúdo e
área principal. Em mobile, a sidebar é exibida em `Sheet` por um botão de
menu. Ações de conta e logout ficam no cabeçalho/rodapé da navegação.

## AdminLayout

Rotas `/admin/*`; itens: visão geral, usuários, cursos, materiais e
configurações (itens ainda não implementados podem aparecer desabilitados ou
ser omitidos até existirem). O layout não aparece para STUDENT.

## StudentLayout

Rotas `/app/*`; itens: portal/cursos e conta. Não mostra ações ou links de
administração.

## Componentes

Usar shadcn/ui como padrão: `Sidebar`, `Sheet`, `Button`, `Tooltip`,
`Avatar`, `DropdownMenu`, `Separator` e `Breadcrumb` quando aplicável.
Tailwind só compõe layout/spacing.

## Verificação

1. ADMIN vê somente navegação administrativa na área `/admin`.
2. STUDENT vê somente navegação do portal em `/app`.
3. Sidebar recolhe no desktop e abre/fecha no mobile.
4. Links ativos, conta e logout continuam funcionais.
5. Guards existentes permanecem a fonte de bloqueio de rota.
