export async function load(): Promise<number> {
  return 1;
}

export function run(value: any): string {
  load();
  return `${value}`;
}
