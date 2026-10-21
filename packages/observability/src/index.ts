/** Logs de ciclo de vida; las trazas de peticiones se implementarán después. */
export function logLifecycle(
  service: string,
  event: 'started' | 'stopping' | 'failed',
  details: Readonly<Record<string, string | number>> = {},
): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service, event, ...details }));
}
