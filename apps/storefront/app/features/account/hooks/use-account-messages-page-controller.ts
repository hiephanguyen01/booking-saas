import { useMemo, useState, type FormEvent } from 'react';

interface AccountMessage {
  from: 'me' | 'them';
  text: string;
  time: string;
}

interface AccountConversation {
  id: string;
  name: string;
  messages: AccountMessage[];
}

export function useAccountMessagesPageController<TConversation extends AccountConversation>(
  conversations: readonly TConversation[],
) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return conversations.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [conversations, query]);
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0];
  const messages = useMemo(
    () => [
      ...(selected?.messages ?? []),
      ...sent.map((text, index) => ({
        from: 'me' as const,
        text,
        time: `${10 + index}:02`,
      })),
    ],
    [selected, sent],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setSent((items) => [...items, value]);
    setDraft('');
  }

  return {
    draft,
    filtered,
    handleSubmit,
    messages,
    query,
    selected,
    selectConversation: setSelectedId,
    setDraft,
    setQuery,
  };
}
