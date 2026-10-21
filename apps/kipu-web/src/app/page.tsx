'use client';

import { useEffect, useState } from 'react';
import { SERVICE_DEFINITIONS } from '@kipu/contracts';
import type { ServiceStatus } from '@kipu/contracts';

const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000';

export default function Home() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh(): Promise<void> {
      try {
        const response = await fetch(`${gateway}/health/services`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Gateway no disponible');
        const statuses = await response.json() as ServiceStatus[];
        if (active) { setServices(statuses); setError(false); }
      } catch {
        if (active) { setServices(null); setError(true); }
      }
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; controller.abort(); clearInterval(interval); };
  }, []);

  const ready = services?.filter((entry) => entry.status === 'ok').length ?? 0;
  return (
    <main>
      <header><span className="brand">kipu<span>.</span></span><span className="tag">Prototipo local · Paso 1</span></header>
      <section className="intro">
        <p className="eyebrow">ARQUITECTURA DE SOFTWARE</p>
        <h1>La base está en marcha.</h1>
        <p>Procesos independientes para construir juntos identidad, feed e interacción social.</p>
      </section>
      <section className="panel" aria-labelledby="status-title">
        <div className="panel-heading"><h2 id="status-title">Estado de los servicios</h2><span>{ready} / {SERVICE_DEFINITIONS.length} disponibles</span></div>
        <p className="hint">Consulta técnica a través del API Gateway. Se actualiza cada 5 segundos.</p>
        <p role="status" className={error ? 'warning' : 'summary'}>
          {error ? 'No se puede consultar el gateway. Comprueba que todos los procesos estén iniciados.' : services ? 'Estado recibido del gateway.' : 'Comprobando servicios…'}
        </p>
        <ul>{SERVICE_DEFINITIONS.map((definition) => {
          const status = services?.find((entry) => entry.service === definition.service)?.status;
          const label = status === 'ok' ? 'Disponible' : status === 'unavailable' || error ? 'Sin conexión' : 'Comprobando';
          return <li key={definition.service}><div><strong>{definition.service}</strong><small>Puerto {definition.port}</small></div><span className={`badge ${status === 'ok' ? 'ok' : 'pending'}`}>{label}</span></li>;
        })}</ul>
      </section>
      <footer>Base ejecutable. Las funciones de negocio se incorporarán en los siguientes pasos.</footer>
    </main>
  );
}
