/**
 * Payment / tax / refund / settlement lifecycle auditor.
 *
 * Replaces the integration tests that would otherwise cover the money lifecycle,
 * removed with the no-tests policy (ADR 0005) — same role as `check-rls.ts`, but
 * this one reads the live database instead of the migration SQL.
 *
 * It asserts that the four lifecycles stayed separate and that the tax audit
 * trail reconciles:
 *
 *   booking → payment(s) → transaction accepted → tax assessment
 *           → refund(s) → tax reversal(s) → final tax position
 *           → settlement → payout
 *
 * Run against a dev/staging database (uses the BYPASSRLS admin role so it can
 * audit every tenant at once):
 *
 *   pnpm --filter=@booking/api audit:tax                 # audit everything
 *   pnpm --filter=@booking/api audit:tax -- --booking BK-XXXX   # one trail
 *
 * Exits 1 listing every violated invariant.
 */
import { PrismaClient } from '@prisma/client';

/** Vietnamese calendar month of an instant — a tax period is a +07 date. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnMonth(at: Date): string {
  const shifted = new Date(at.getTime() + VN_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

const vnd = (amount: bigint): string => amount.toLocaleString('vi-VN');

interface Violation {
  invariant: string;
  bookingCode: string;
  detail: string;
}

const violations: Violation[] = [];
function fail(invariant: string, bookingCode: string, detail: string): void {
  violations.push({ invariant, bookingCode, detail });
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL } },
});

const WITHHOLDING_TYPES = ['vat_withheld', 'pit_withheld'] as const;
const REMITTED_TYPES = ['vat_remitted', 'pit_remitted'] as const;

async function main(): Promise<void> {
  const bookingCode = argValue('--booking');

  const settlements = await prisma.bookingSettlement.findMany({
    where: bookingCode ? { booking: { code: bookingCode } } : undefined,
    include: {
      booking: { select: { code: true, status: true, totalAmount: true, finalAmount: true } },
      taxWithholdingEvents: { orderBy: { createdAt: 'asc' }, include: { filingPeriod: true } },
      payoutAllocations: { include: { payout: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (settlements.length === 0) {
    console.error(
      bookingCode
        ? `audit-tax: no settlement found for booking ${bookingCode}`
        : 'audit-tax: no booking settlements in this database — seed it first',
    );
    process.exit(1);
  }

  for (const settlement of settlements) {
    const code = settlement.booking.code;

    const assessments = settlement.taxWithholdingEvents.filter((e) => e.eventType === 'withholding');
    const reversals = settlement.taxWithholdingEvents.filter((e) => e.eventType === 'reversal');
    const assessment = assessments[0];

    const payments = await prisma.payment.findMany({
      where: { bookingId: settlement.bookingId, status: 'succeeded' },
      select: { id: true, amount: true, kind: true, paidAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const refunds = await prisma.refund.findMany({
      where: { bookingId: settlement.bookingId, status: 'succeeded' },
      select: { id: true, amount: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const entries = await prisma.ledgerEntry.findMany({
      where: { bookingId: settlement.bookingId },
      select: {
        journalId: true,
        entryType: true,
        debit: true,
        credit: true,
        createdAt: true,
        account: { select: { ownerType: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // I1 — one original assessment per settlement, whatever the delivery count.
    if (assessments.length > 1) {
      fail(
        'I1 single-assessment',
        code,
        `${assessments.length} withholding events on one settlement (source keys: ${assessments
          .map((e) => e.sourceKey)
          .join(', ')})`,
      );
    }

    // I2 — accepted transaction with a non-zero deduction must be assessed.
    const expectsAssessment =
      settlement.completedAt !== null &&
      settlement.partnerVatWithheld + settlement.partnerPitWithheld > 0n;
    if (expectsAssessment && !assessment) {
      fail(
        'I2 assessed-at-acceptance',
        code,
        `completed_at=${settlement.completedAt?.toISOString()} with vat=${vnd(
          settlement.partnerVatWithheld,
        )} pit=${vnd(settlement.partnerPitWithheld)} but no withholding event`,
      );
    }

    // I3 — never accepted ⇒ never taxed (cancellation before acceptance).
    if (settlement.completedAt === null && settlement.taxWithholdingEvents.length > 0) {
      fail(
        'I3 no-tax-before-acceptance',
        code,
        `settlement has no completed_at but carries ${settlement.taxWithholdingEvents.length} tax event(s)`,
      );
    }

    // I4 — every reversal links to this settlement's own assessment.
    for (const reversal of reversals) {
      if (!reversal.originalEventId) {
        fail('I4 reversal-linked', code, `reversal ${reversal.sourceKey} has no original_event_id`);
      } else if (!assessment || reversal.originalEventId !== assessment.id) {
        fail(
          'I4 reversal-linked',
          code,
          `reversal ${reversal.sourceKey} points at ${reversal.originalEventId}, not this settlement's assessment`,
        );
      }
    }

    const reversed = reversals.reduce(
      (acc, r) => ({
        taxableRevenue: acc.taxableRevenue + r.taxableRevenue,
        vat: acc.vat + r.vatAmount,
        pit: acc.pit + r.pitAmount,
      }),
      { taxableRevenue: 0n, vat: 0n, pit: 0n },
    );

    // I5 — cumulative reversal can never exceed the original assessment.
    if (assessment) {
      if (reversed.taxableRevenue > assessment.taxableRevenue) {
        fail(
          'I5 reversal-bounded',
          code,
          `reversed revenue ${vnd(reversed.taxableRevenue)} > assessed ${vnd(assessment.taxableRevenue)}`,
        );
      }
      if (reversed.vat > assessment.vatAmount || reversed.pit > assessment.pitAmount) {
        fail(
          'I5 reversal-bounded',
          code,
          `reversed vat/pit ${vnd(reversed.vat)}/${vnd(reversed.pit)} > assessed ${vnd(
            assessment.vatAmount,
          )}/${vnd(assessment.pitAmount)}`,
        );
      }
    }

    // I6 — one reversal per refund, so a redelivered refund.completed is a no-op.
    const refundKeys = reversals.map((r) => r.sourceKey);
    if (new Set(refundKeys).size !== refundKeys.length) {
      fail('I6 one-reversal-per-refund', code, `duplicate reversal source keys: ${refundKeys.join(', ')}`);
    }

    // I7 — the ledger's net withholding equals assessment − Σ reversals.
    const netTax = {
      vat: (assessment?.vatAmount ?? 0n) - reversed.vat,
      pit: (assessment?.pitAmount ?? 0n) - reversed.pit,
    };
    // A withholding journal DEBITS the partner and credits the tax authority with
    // the SAME entry_type; a reversal swaps the two. Netting across both accounts
    // is therefore always zero — only the partner side carries the information.
    const partnerTaxLegs = entries.filter(
      (e) =>
        e.account.ownerType === 'partner' &&
        WITHHOLDING_TYPES.includes(e.entryType as (typeof WITHHOLDING_TYPES)[number]),
    );
    const ledgerNetTax = partnerTaxLegs.reduce((acc, e) => acc + e.debit - e.credit, 0n);
    if (ledgerNetTax !== netTax.vat + netTax.pit) {
      fail(
        'I7 ledger-matches-events',
        code,
        `partner ledger net withholding ${vnd(ledgerNetTax)} ≠ event trail ${vnd(netTax.vat + netTax.pit)}`,
      );
    }

    // I8 — every tax event's journal actually exists and balances.
    for (const event of settlement.taxWithholdingEvents) {
      const legs = await prisma.ledgerEntry.findMany({
        where: { journalId: event.journalId },
        select: { debit: true, credit: true },
      });
      if (legs.length === 0) {
        fail('I8 journal-exists', code, `tax event ${event.sourceKey} references a missing journal`);
        continue;
      }
      const debit = legs.reduce((a, l) => a + l.debit, 0n);
      const credit = legs.reduce((a, l) => a + l.credit, 0n);
      if (debit !== credit) {
        fail(
          'I8 journal-exists',
          code,
          `journal of ${event.sourceKey} unbalanced: debit ${vnd(debit)} ≠ credit ${vnd(credit)}`,
        );
      }
    }

    // I9 — an event assigned to a filing period must fall inside that period.
    for (const event of settlement.taxWithholdingEvents) {
      if (!event.filingPeriod) continue;
      const expected = `${event.filingPeriod.taxYear}-${String(event.filingPeriod.taxMonth).padStart(2, '0')}`;
      if (vnMonth(event.occurredAt) !== expected) {
        fail(
          'I9 period-bucketing',
          code,
          `${event.sourceKey} occurred ${vnMonth(event.occurredAt)} but sits in period ${expected}`,
        );
      }
    }

    // I10 — the assessment belongs to the TRANSACTION month, not the payout month.
    if (assessment && settlement.completedAt) {
      const acceptedMonth = vnMonth(settlement.completedAt);
      if (vnMonth(assessment.occurredAt) !== acceptedMonth) {
        fail(
          'I10 transaction-month',
          code,
          `assessment occurred_at is ${vnMonth(assessment.occurredAt)} but the transaction was accepted in ${acceptedMonth}` +
            (settlement.releasedAt ? ` (released ${vnMonth(settlement.releasedAt)})` : ''),
        );
      }
    }

    // I11 — a refund after a payout must be recoverable, never a deleted payout.
    const paidOut = settlement.payoutAllocations.filter((a) => a.payout.status === 'paid');
    if (refunds.length > 0 && paidOut.length > 0) {
      const hasClawback = entries.some((e) => e.entryType === 'clawback');
      if (!hasClawback) {
        fail(
          'I11 post-payout-recovery',
          code,
          `refunded after a paid payout (${paidOut.length} allocation(s)) but no clawback journal exists`,
        );
      }
    }

    if (bookingCode) printTrail(code, settlement, payments, refunds, assessment, reversals, netTax, entries);
  }

  // I12 — per tenant, the tax-authority account equals assessed − reversed − remitted.
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const tenant of tenants) {
    const events = await prisma.taxWithholdingEvent.findMany({
      where: { tenantId: tenant.id },
      select: { eventType: true, vatAmount: true, pitAmount: true },
    });
    if (events.length === 0) continue;
    const owed = events.reduce((acc, e) => {
      const sign = e.eventType === 'reversal' ? -1n : 1n;
      return acc + sign * (e.vatAmount + e.pitAmount);
    }, 0n);
    const remitted = await prisma.ledgerEntry.aggregate({
      where: {
        tenantId: tenant.id,
        entryType: { in: [...REMITTED_TYPES] },
        account: { ownerType: 'tax_authority' },
      },
      _sum: { debit: true },
    });
    const account = await prisma.ledgerEntry.aggregate({
      where: { tenantId: tenant.id, account: { ownerType: 'tax_authority' } },
      _sum: { debit: true, credit: true },
    });
    const balance = (account._sum.credit ?? 0n) - (account._sum.debit ?? 0n);
    const expected = owed - (remitted._sum.debit ?? 0n);
    if (balance !== expected) {
      fail(
        'I12 authority-liability',
        `tenant:${tenant.slug}`,
        `tax_authority balance ${vnd(balance)} ≠ assessed−reversed−remitted ${vnd(expected)}`,
      );
    }
  }

  report(settlements.length);
}

function printTrail(
  code: string,
  settlement: {
    status: string;
    kind: string;
    onlineHeldAmount: bigint;
    onsiteCollectedAmount: bigint;
    securityDepositHeld: bigint;
    partnerGrossEarning: bigint;
    partnerPayable: bigint;
    refundedAmount: bigint;
    retainedAmount: bigint;
    completedAt: Date | null;
    disputeUntil: Date | null;
    releasedAt: Date | null;
    booking: { totalAmount: bigint; finalAmount: bigint; status: string };
    payoutAllocations: { amount: bigint; payout: { status: string; paidAt: Date | null } }[];
  },
  payments: { amount: bigint; kind: string }[],
  refunds: { id: string; amount: bigint; reason: string | null }[],
  assessment: { taxableRevenue: bigint; vatAmount: bigint; pitAmount: bigint; occurredAt: Date } | undefined,
  reversals: { sourceKey: string; vatAmount: bigint; pitAmount: bigint; occurredAt: Date }[],
  netTax: { vat: bigint; pit: bigint },
  entries: { entryType: string; debit: bigint; credit: bigint }[],
): void {
  const line = (label: string, value: string) => console.log(`  ${label.padEnd(32)}${value}`);
  console.log(`\n═══ ${code} — ${settlement.booking.status} / settlement ${settlement.status} (${settlement.kind})`);
  console.log('\n  BOOKING');
  line('booking gross (total)', vnd(settlement.booking.totalAmount));
  line('booking final', vnd(settlement.booking.finalAmount));
  console.log('\n  PAYMENT — money received, not revenue');
  for (const p of payments) line(`payment (${p.kind})`, vnd(p.amount));
  line('online held (net of deposit)', vnd(settlement.onlineHeldAmount));
  line('security deposit held', vnd(settlement.securityDepositHeld));
  line('onsite collected by partner', vnd(settlement.onsiteCollectedAmount));
  console.log('\n  TAX');
  line('transaction accepted at', settlement.completedAt?.toISOString() ?? '— not accepted —');
  if (assessment) {
    line('taxable amount (assessed)', vnd(assessment.taxableRevenue));
    line('assessment vat / pit', `${vnd(assessment.vatAmount)} / ${vnd(assessment.pitAmount)}`);
    line('assessment period (VN)', vnMonth(assessment.occurredAt));
  } else {
    line('assessment', '— none —');
  }
  for (const r of reversals) {
    line(`reversal ${r.sourceKey}`, `-${vnd(r.vatAmount)} / -${vnd(r.pitAmount)}  [${vnMonth(r.occurredAt)}]`);
  }
  line('FINAL TAX POSITION', `${vnd(netTax.vat)} vat + ${vnd(netTax.pit)} pit = ${vnd(netTax.vat + netTax.pit)}`);
  console.log('\n  REFUND');
  if (refunds.length === 0) line('refunds', '— none —');
  for (const r of refunds) line(`refund (${r.reason ?? 'n/a'})`, vnd(r.amount));
  line('cumulative refunded', vnd(settlement.refundedAmount));
  line('retained by tenant', vnd(settlement.retainedAmount));
  console.log('\n  SETTLEMENT / PAYOUT');
  line('dispute window until', settlement.disputeUntil?.toISOString() ?? '—');
  line('released at', settlement.releasedAt?.toISOString() ?? '— still held —');
  line('partner gross earning', vnd(settlement.partnerGrossEarning));
  line('partner payable', vnd(settlement.partnerPayable));
  for (const a of settlement.payoutAllocations) {
    line(`payout (${a.payout.status})`, vnd(a.amount));
  }
  const clawback = entries.filter((e) => e.entryType === 'clawback');
  if (clawback.length > 0) {
    line('clawback legs', `${clawback.length} (recovered from a later payout)`);
  }
  const remaining = settlement.partnerPayable - settlement.payoutAllocations.reduce((a, x) => a + x.amount, 0n);
  line('still payable / receivable', vnd(remaining));
}

function report(audited: number): void {
  console.log('');
  if (violations.length === 0) {
    console.log(`audit-tax: OK — ${audited} settlement(s) audited, all 12 invariants hold.`);
    return;
  }
  console.error(`audit-tax: ${violations.length} violation(s) across ${audited} settlement(s):\n`);
  const byInvariant = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byInvariant.get(v.invariant) ?? [];
    list.push(v);
    byInvariant.set(v.invariant, list);
  }
  for (const [invariant, list] of byInvariant) {
    console.error(`  ✗ ${invariant} — ${list.length} case(s)`);
    for (const v of list.slice(0, 10)) console.error(`      ${v.bookingCode}: ${v.detail}`);
    if (list.length > 10) console.error(`      … and ${list.length - 10} more`);
  }
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main()
  .catch((error: unknown) => {
    console.error('audit-tax: failed —', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
