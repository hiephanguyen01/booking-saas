export interface SubmissionLock {
  tryAcquire(): boolean;
  release(): void;
}

export function createSubmissionLock(): SubmissionLock {
  let inFlight = false;

  return {
    tryAcquire() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release() {
      inFlight = false;
    },
  };
}
