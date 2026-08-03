interface ErrorNode {
  message?: unknown;
  [key: string]: unknown;
}

function nodeAtPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function collectMessages(node: unknown, seen: Set<object>): string[] {
  if (!node || typeof node !== 'object') return [];
  if (seen.has(node)) return [];
  seen.add(node);

  const error = node as ErrorNode;
  if (typeof error.message === 'string' && error.message.trim()) {
    return [error.message];
  }

  const messages: string[] = [];
  for (const [key, value] of Object.entries(error)) {
    if (key === 'ref' || key === 'types' || key === 'type') continue;
    messages.push(...collectMessages(value, seen));
  }
  return messages;
}

export function formErrorMessagesAt(
  errors: unknown,
  path: ReadonlyArray<string | number>,
): string[] {
  return [...new Set(collectMessages(nodeAtPath(errors, path), new Set()))];
}

export function formErrorMessageAt(
  errors: unknown,
  path: ReadonlyArray<string | number>,
): string | undefined {
  return formErrorMessagesAt(errors, path)[0];
}

export function firstFormErrorField(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined;
  return Object.keys(errors)[0];
}
