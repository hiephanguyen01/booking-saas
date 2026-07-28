import { accountMocksEnabled, mockConversations } from '~/features/account/server/mock-data.server';

export function loadAccountMessagesRoute(locale: 'vi' | 'en') {
  const enabled = accountMocksEnabled();
  return {
    enabled,
    conversations: enabled ? mockConversations(locale) : [],
  };
}
