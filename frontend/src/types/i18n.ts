import type { Messages } from '@/i18n';

type Join<Prefix extends string, Key extends string> = `${Prefix}.${Key}`;

/** Every leaf message path of the English catalogue, e.g. `home.status.ready`. */
type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? Prefix extends ''
      ? K
      : Join<Prefix, K>
    : Paths<T[K], Prefix extends '' ? K : Join<Prefix, K>>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
