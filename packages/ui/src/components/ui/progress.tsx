'use client';

import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';

function Progress({
  className,
  value = 0,
  max = 100,
  ...props
}: React.ComponentProps<'progress'>) {
  const normalizedMax =
    typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 100;
  const normalizedValue =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(normalizedMax, Math.max(0, value))
      : 0;

  return (
    <progress
      data-slot="progress"
      {...props}
      max={normalizedMax}
      value={normalizedValue}
      className={cn(
        'h-2 w-full appearance-none overflow-hidden rounded-full bg-primary/20 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-moz-progress-bar]:transition-all [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-primary/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-all',
        className,
      )}
    />
  );
}

export { Progress };
