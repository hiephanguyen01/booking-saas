import type { UNSAFE_DataWithResponseInit } from 'react-router';

type UnwrapServerData<T> = T extends Response
  ? never
  : T extends UNSAFE_DataWithResponseInit<infer Data>
    ? Data
    : T;

/** Mirrors React Router's server-data unwrapping without coupling features to route typegen. */
export type ServerDataFrom<T> = T extends (...args: infer _Args) => unknown
  ? UnwrapServerData<Awaited<ReturnType<T>>>
  : never;
