declare module "react" {
  export function useState<T>(initial: T): [T, (next: T) => void];
  export function useEffect(effect: () => void, deps?: unknown[]): void;
}
declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
}
