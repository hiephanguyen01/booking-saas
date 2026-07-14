export type TranslationShape<T> = T extends string
  ? string
  : { readonly [Key in keyof T]: TranslationShape<T[Key]> };
