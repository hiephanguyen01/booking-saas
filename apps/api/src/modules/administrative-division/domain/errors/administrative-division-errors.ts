import { DomainError } from '../../../../shared/domain/domain-error';

export class InvalidAdministrativeDivision extends DomainError {
  constructor() {
    super(
      'INVALID_ADMINISTRATIVE_DIVISION',
      400,
      'The selected ward does not belong to the selected province',
    );
  }
}
