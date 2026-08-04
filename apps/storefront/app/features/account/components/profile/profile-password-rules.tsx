import { PASSWORD_CHECK_ORDER, PASSWORD_CHECKS, type PasswordCheck } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { Check, Circle, X } from 'lucide-react';
import type { NamespaceTranslationKey } from '@booking/i18n';

const RULE_LABELS: Record<PasswordCheck, NamespaceTranslationKey<NsI18n.Account>> = {
  length: 'profile.passwordRuleLength',
  letter: 'profile.passwordRuleLetter',
  digit: 'profile.passwordRuleNumber',
};

/**
 * Live version of the password rules. The rules used to be three static lines
 * that said the same thing whether or not the typed password satisfied them —
 * so the only way to find out was to submit. The predicates come from
 * `PASSWORD_CHECKS`, the same definition the schema is built from, so a tick
 * here always means the field will pass.
 */
export function ProfilePasswordRules({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const started = password.length > 0;

  return (
    <ul className="mt-6 space-y-2 text-sm leading-5">
      {PASSWORD_CHECK_ORDER.map((check) => (
        <RuleRow
          key={check}
          label={t(RULE_LABELS[check])}
          state={!started ? 'idle' : PASSWORD_CHECKS[check](password) ? 'met' : 'unmet'}
          metLabel={t('profile.passwordRuleMet')}
          unmetLabel={t('profile.passwordRuleUnmet')}
        />
      ))}

      {confirmPassword.length > 0 ? (
        <RuleRow
          label={
            password === confirmPassword ? t('profile.passwordMatch') : t('profile.passwordNotMatch')
          }
          state={password === confirmPassword ? 'met' : 'failed'}
          metLabel={t('profile.passwordRuleMet')}
          unmetLabel={t('profile.passwordRuleUnmet')}
        />
      ) : null}
    </ul>
  );
}

type RuleState = 'idle' | 'met' | 'unmet' | 'failed';

function RuleRow({
  label,
  state,
  metLabel,
  unmetLabel,
}: {
  label: string;
  state: RuleState;
  metLabel: string;
  unmetLabel: string;
}) {
  // `failed` is only used once the customer has typed something that actively
  // contradicts the rule (a mismatching confirmation); a rule merely not met yet
  // stays neutral so an untouched form does not read as a page full of errors.
  const Icon = state === 'met' ? Check : state === 'failed' ? X : Circle;

  return (
    <li
      className={cn(
        'flex items-center gap-2 transition-colors',
        state === 'met' && 'text-success',
        state === 'failed' && 'text-destructive',
        (state === 'idle' || state === 'unmet') && 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-4 shrink-0', state === 'idle' && 'size-2.5 fill-current opacity-60')}
      />
      <span>{label}</span>
      {state === 'idle' ? null : (
        <span className="sr-only">{state === 'met' ? metLabel : unmetLabel}</span>
      )}
    </li>
  );
}
