import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { MessageSquareText, Send } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { userInitials } from '~/features/account/lib/account-nav';
import {
  AccountPanel,
  DemoNotice,
  MockDisabledState,
  PageHeading,
} from '~/features/account/components/shared/account-primitives';
import { useAccountMessagesPageController } from '~/features/account/hooks/use-account-messages-page-controller';
import type { loadAccountMessagesRoute } from '~/features/account/server/account-messages-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export function AccountMessagesPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountMessagesRoute>;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const {
    draft,
    filtered,
    handleSubmit,
    messages,
    query,
    selected,
    selectConversation,
    setDraft,
    setQuery,
  } = useAccountMessagesPageController(loaderData.conversations);

  if (!loaderData.enabled) {
    return (
      <div className="space-y-4">
        <PageHeading title={t('messages.title')} />
        <MockDisabledState />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading title={t('messages.title')} demo />
      <DemoNotice />
      <AccountPanel className="grid min-h-145 overflow-hidden md:grid-cols-[280px_1fr]">
        <div className="border-b border-border md:border-b-0 md:border-r">
          <div className="p-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('messages.search')}
            />
          </div>
          <div>
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full gap-3 border-t border-border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${conversation.id === selected?.id ? 'bg-primary/5' : 'hover:bg-muted/60'}`}
              >
                <Avatar>
                  <AvatarFallback>{userInitials(conversation.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{conversation.name}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {conversation.preview}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">{conversation.time}</span>
              </button>
            ))}
          </div>
        </div>
        {selected ? (
          <div className="flex min-h-105 flex-col">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Avatar>
                <AvatarFallback>{userInitials(selected.name)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold">{selected.name}</p>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/25 p-4 sm:p-6">
              {messages.map((message, index) => (
                <div
                  key={`${message.time}-${index}`}
                  className={`max-w-[82%] rounded-xl px-4 py-3 text-sm ${message.from === 'me' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-background shadow-sm'}`}
                >
                  <p>{message.text}</p>
                  <p
                    className={`mt-1 text-right text-[10px] ${message.from === 'me' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                  >
                    {message.time}
                  </p>
                </div>
              ))}
            </div>
            <form className="flex gap-2 border-t border-border p-4" onSubmit={handleSubmit}>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('messages.reply')}
              />
              <Button type="submit" size="icon" aria-label={t('messages.send')}>
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <MessageSquareText className="size-8" />
          </div>
        )}
      </AccountPanel>
    </div>
  );
}
