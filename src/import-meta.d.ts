/** Ambient typing for Angular application builder's import.meta.glob support. */
interface ImportMeta {
  readonly glob: <T = unknown>(
    pattern: string,
    options?: {
      eager?: boolean;
      query?: string;
      import?: string;
    },
  ) => Record<string, T>;
}
