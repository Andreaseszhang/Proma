import { expect, test } from 'bun:test'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { renderToStaticMarkup } from 'react-dom/server'
import { DefaultAppMenuItem } from './DefaultAppMenuItem'

test('renders the system default open command when default app discovery is unavailable', () => {
  const markup = renderToStaticMarkup(
    <DropdownMenuPrimitive.Root open>
      <DropdownMenuPrimitive.Content forceMount>
        <DefaultAppMenuItem filePath="/tmp/report.md" />
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Root>,
  )

  expect(markup).toContain('用系统默认应用打开')
})
