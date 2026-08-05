import { HttpException, ServiceUnavailableException } from '@nestjs/common';

export class GeocodingBusyException extends HttpException {
  constructor() {
    super('Location services are busy. Please try again in a few seconds.', 429);
  }
}

export class GeocodingUnavailableException extends ServiceUnavailableException {
  constructor() {
    super(
      'Location services are temporarily unavailable. You can still use GPS or enter coordinates.',
    );
  }
}
