import { PASSWORD_CHECK_ORDER, PASSWORD_CHECKS, type PasswordCheck } from '@booking/contracts';
import { NsI18n, useTranslation, type NamespaceTranslationKey } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { Check, Circle } from 'lucide-react';

const RULE_LABELS: Record<PasswordCheck, NamespaceTranslationKey<NsI18n.Auth>> = {
  length: 'password.guidance.rules.length',
  letter: 'password.guidance.rules.letter',
  digit: 'password.guidance.rules.digit',
};

type Strength = 'notStarted' | 'weak' | 'medium' | 'strong';

export function AuthPasswordGuidance({ id, password }: { id?: string; password: string }) {
  const { t } = useTranslation(NsI18n.Auth);
  const completedChecks = PASSWORD_CHECK_ORDER.filter((check) => PASSWORD_CHECKS[check](password));
  const strength: Strength =
    password.length === 0
      ? 'notStarted'
      : completedChecks.length <= 1
        ? 'weak'
        : completedChecks.length === 2
          ? 'medium'
          : 'strong';
  const activeBarClass =
    strength === 'strong' ? 'bg-success' : strength === 'medium' ? 'bg-warning' : 'bg-destructive';
  const strengthTextClass =
    strength === 'strong'
      ? 'text-success'
      : strength === 'medium'
        ? 'text-warning'
        : strength === 'weak'
          ? 'text-destructive'
          : 'text-muted-foreground';

  return (
    <div id={id} className="flex flex-col gap-3 pt-1 text-sm md:sr-only">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {t('password.guidance.strengthLabel')}
        </span>
        <span className={cn('text-xs font-semibold', strengthTextClass)} aria-live="polite">
          {t(`password.guidance.${strength}`)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1 rounded-full bg-muted transition-colors',
              index < completedChecks.length && activeBarClass,
            )}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {PASSWORD_CHECK_ORDER.map((check) => {
          const met = PASSWORD_CHECKS[check](password);
          const Icon = met ? Check : Circle;
          return (
            <li
              key={check}
              className={cn(
                'flex items-center gap-2 text-xs leading-5 transition-colors',
                met ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <Icon
                className={cn('size-3.5 shrink-0', !met && 'size-2.5 fill-current opacity-60')}
                aria-hidden="true"
              />
              <span>{t(RULE_LABELS[check])}</span>
              <span className="sr-only">
                {met ? t('password.guidance.met') : t('password.guidance.unmet')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
