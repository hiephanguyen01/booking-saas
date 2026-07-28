import {
  CalendarCheck2,
  Clock3,
  Database,
  Dumbbell,
  Fingerprint,
  GraduationCap,
  Home,
  KeyRound,
  PackageOpen,
  ReceiptText,
  Sparkles,
} from 'lucide-react';

export const SERVICE_MODELS = [
  { key: 'studio', icon: Sparkles },
  { key: 'sport', icon: Dumbbell },
  { key: 'class', icon: GraduationCap },
  { key: 'appointment', icon: Clock3 },
  { key: 'stay', icon: Home },
  { key: 'inventory', icon: PackageOpen },
] as const;

export const BEFORE_ITEMS = [
  'transformation.before.one',
  'transformation.before.two',
  'transformation.before.three',
  'transformation.before.four',
  'transformation.before.five',
] as const;

export const AFTER_ITEMS = [
  'transformation.after.one',
  'transformation.after.two',
  'transformation.after.three',
  'transformation.after.four',
  'transformation.after.five',
] as const;

export const TRUST_ITEMS = [
  { key: 'isolation', icon: Database },
  { key: 'access', icon: KeyRound },
  { key: 'session', icon: Fingerprint },
  { key: 'schedule', icon: CalendarCheck2 },
  { key: 'ledger', icon: ReceiptText },
] as const;

export const FAQ_ITEMS = ['one', 'two', 'three', 'four', 'five', 'six'] as const;
