from pathlib import Path
import re

path = Path('apps/api/prisma/schema.prisma')
text = path.read_text()


def replace_model(name: str, transform):
    global text
    pattern = re.compile(rf'model {re.escape(name)} \{{.*?\n\}}', re.S)
    match = pattern.search(text)
    if not match:
        raise SystemExit(f'model {name} not found')
    block = match.group(0)
    new_block = transform(block)
    text = text[: match.start()] + new_block + text[match.end() :]


def patch_tenant(block: str) -> str:
    additions = []
    if 'paymentMethodRoutes' not in block:
        additions.append('  paymentMethodRoutes       TenantPaymentMethodRoute[]')
    if 'refundPolicy' not in block:
        additions.append('  refundPolicy              TenantRefundPolicy?')
    if not additions:
        return block
    marker = '\n  @@map("tenants")'
    if marker not in block:
        raise SystemExit('Tenant @@map marker not found')
    return block.replace(marker, '\n' + '\n'.join(additions) + marker)


def patch_payment(block: str) -> str:
    if 'refundStrategySnapshot' in block:
        return block
    lines = block.splitlines()
    insert_at = None
    for index, line in enumerate(lines):
        if 'gatewayConfigRevisionId' in line and not line.strip().startswith('//'):
            insert_at = index + 1
            break
    if insert_at is None:
        raise SystemExit('Payment gatewayConfigRevisionId field not found')
    lines[insert_at:insert_at] = [
        '  refundStrategySnapshot       String?               @map("refund_strategy_snapshot")',
        '  manualRefundSlaHoursSnapshot Int?                  @map("manual_refund_sla_hours_snapshot")',
    ]
    return '\n'.join(lines)


replace_model('Tenant', patch_tenant)
replace_model('Payment', patch_payment)

if 'model TenantPaymentMethodRoute {' not in text:
    new_models = '''

model TenantPaymentMethodRoute {
  id        String         @id @default(uuid(7)) @db.Uuid
  tenantId  String         @map("tenant_id") @db.Uuid
  method    String
  gateway   PaymentGateway
  enabled   Boolean        @default(true)
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, method])
  @@index([tenantId, gateway])
  @@map("tenant_payment_method_routes")
}

model TenantRefundPolicy {
  tenantId             String   @id @map("tenant_id") @db.Uuid
  refundStrategy       String   @map("refund_strategy")
  manualRefundSlaHours Int      @map("manual_refund_sla_hours")
  updatedBy            String?  @map("updated_by") @db.Uuid
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_refund_policies")
}
'''
    marker = '\nmodel TenantGatewayConfig {'
    pos = text.find(marker)
    if pos == -1:
        raise SystemExit('TenantGatewayConfig model not found')
    # Insert immediately before gateway revisions so all payment configuration models stay together.
    text = text[:pos] + new_models + text[pos:]

path.write_text(text)
