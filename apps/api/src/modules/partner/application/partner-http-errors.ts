import { ServiceUnavailableException } from '@nestjs/common';

export class TaxThresholdRuleUnavailable extends ServiceUnavailableException {
  constructor() {
    super('No active household tax threshold rule exists');
  }
}
