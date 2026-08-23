from pathlib import Path

path = Path('apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts')
text = path.read_text()
needle = '\n});\n'
pos = text.rfind(needle)
if pos == -1:
    raise SystemExit('describe terminator not found')
insert = r'''

  it('uses the explicitly routed bank-transfer provider instead of the first active base config', async () => {
    const { useCase, routedTo } = harness({
      configs: [
        config('sepay', ['bank_transfer']),
        config('payos', ['bank_transfer']),
      ],
      gatewayKey: 'payos',
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(routedTo).toEqual(['payos']);
  });

  it('snapshots the current refund policy onto every new durable payment', async () => {
    const { useCase, created } = harness();

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({
      refundStrategySnapshot: 'manual',
      manualRefundSlaHoursSnapshot: 72,
    });
  });
'''
path.write_text(text[:pos] + insert + text[pos:])
