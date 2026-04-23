function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderInspectorPage(baseUrl: string, token?: string): string {
  const safeBaseUrl = baseUrl.replace(/\/$/, '');
  const escapedBaseUrl = escapeAttribute(safeBaseUrl);
  const escapedToken = escapeAttribute(token ?? '');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GortJS Inspector</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1e8;
        --panel: rgba(255, 252, 245, 0.9);
        --ink: #182126;
        --muted: #5b666c;
        --line: rgba(24, 33, 38, 0.12);
        --accent: #0d7c66;
        --accent-soft: rgba(13, 124, 102, 0.1);
        --warn: #9f3a21;
        --radius: 22px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(13, 124, 102, 0.18), transparent 30%),
          radial-gradient(circle at top right, rgba(233, 137, 18, 0.12), transparent 35%),
          linear-gradient(180deg, #f8f5ec 0%, #efe7d7 100%);
        min-height: 100vh;
      }

      header {
        padding: 32px 24px 20px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 3vw, 3.2rem);
        line-height: 1;
      }

      header p {
        margin: 0;
        color: var(--muted);
        max-width: 760px;
      }

      .toolbar {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 20px;
      }

      .toolbar input,
      .toolbar button {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 12px 16px;
        font: inherit;
      }

      .toolbar input {
        min-width: 280px;
        background: rgba(255, 255, 255, 0.72);
      }

      .toolbar button {
        background: var(--accent);
        color: white;
        cursor: pointer;
      }

      main {
        padding: 0 24px 32px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 18px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        backdrop-filter: blur(14px);
        box-shadow: 0 12px 30px rgba(24, 33, 38, 0.08);
        overflow: hidden;
      }

      .panel header {
        padding: 18px 20px 10px;
      }

      .panel h2 {
        font-size: 1rem;
        margin: 0;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .panel .meta {
        color: var(--muted);
        font-size: 0.9rem;
        margin-top: 6px;
      }

      .panel .body {
        padding: 0 20px 20px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }

      .stat {
        padding: 14px;
        border-radius: 18px;
        background: var(--accent-soft);
      }

      .stat strong {
        display: block;
        font-size: 1.5rem;
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      li {
        padding: 12px 0;
        border-bottom: 1px solid var(--line);
      }

      li:last-child {
        border-bottom: 0;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 10px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.82rem;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 0.85rem;
        color: var(--ink);
      }

      .error {
        color: var(--warn);
        font-weight: 600;
      }

      @media (max-width: 720px) {
        header,
        main {
          padding-left: 16px;
          padding-right: 16px;
        }

        .toolbar input {
          min-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <span class="pill">GortJS Inspector</span>
      <h1>Developer dashboard for runtime adoption</h1>
      <p>Inspect devices, events, workflows, plugins, cluster state, and metrics from a running GortJS runtime without wiring a separate frontend.</p>
      <div class="toolbar">
        <input id="token" type="password" placeholder="Bearer token (optional)" value="${escapedToken}" />
        <button id="refresh">Refresh now</button>
      </div>
      <p id="status" class="meta">Connecting to ${escapedBaseUrl}</p>
    </header>
    <main>
      <section class="panel">
        <header>
          <h2>Overview</h2>
          <div class="meta">Status, versions, packages, and quick metrics.</div>
        </header>
        <div class="body">
          <div id="overview" class="stats"></div>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Devices</h2>
          <div class="meta">Registered devices and current state.</div>
        </header>
        <div class="body">
          <ul id="devices"></ul>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Workflows</h2>
          <div class="meta">Defined workflows and scheduled jobs.</div>
        </header>
        <div class="body">
          <ul id="workflows"></ul>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Events</h2>
          <div class="meta">Most recent persisted events.</div>
        </header>
        <div class="body">
          <ul id="events"></ul>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Plugins</h2>
          <div class="meta">Loaded plugins and compatibility status.</div>
        </header>
        <div class="body">
          <ul id="plugins"></ul>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Cluster</h2>
          <div class="meta">Node summary, reachability, and event sync state.</div>
        </header>
        <div class="body">
          <pre id="cluster"></pre>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Logs</h2>
          <div class="meta">Recent structured runtime logs.</div>
        </header>
        <div class="body">
          <ul id="logs"></ul>
        </div>
      </section>
      <section class="panel">
        <header>
          <h2>Audit</h2>
          <div class="meta">Recent administrative and command audit entries.</div>
        </header>
        <div class="body">
          <ul id="audit"></ul>
        </div>
      </section>
    </main>
    <script>
      const baseUrl = ${JSON.stringify(safeBaseUrl)};
      const statusNode = document.getElementById('status');
      const tokenInput = document.getElementById('token');

      function buildHeaders() {
        const token = tokenInput.value.trim();
        return token ? { Authorization: 'Bearer ' + token } : {};
      }

      async function fetchJson(path) {
        const response = await fetch(baseUrl + path, { headers: buildHeaders() });
        if (!response.ok) {
          throw new Error(path + ' -> ' + response.status + ' ' + response.statusText);
        }
        return response.json();
      }

      function renderList(targetId, items, renderItem) {
        const node = document.getElementById(targetId);
        if (!items.length) {
          node.innerHTML = '<li>No data yet.</li>';
          return;
        }
        node.innerHTML = items.map(renderItem).join('');
      }

      function formatJson(value) {
        return JSON.stringify(value, null, 2);
      }

      async function refresh() {
        statusNode.textContent = 'Refreshing runtime data...';
        statusNode.className = 'meta';
        try {
          const [status, metrics, devices, workflows, jobs, events, runtime, cluster, plugins, logs, audit] = await Promise.all([
            fetchJson('/status'),
            fetchJson('/metrics'),
            fetchJson('/devices'),
            fetchJson('/workflows'),
            fetchJson('/jobs'),
            fetchJson('/events?pageSize=8'),
            fetchJson('/runtime'),
            fetchJson('/cluster'),
            fetchJson('/plugins'),
            fetchJson('/logs?limit=8'),
            fetchJson('/audit?limit=8'),
          ]);

          const overview = document.getElementById('overview');
          const cards = [
            ['Status', status.status],
            ['Devices', String((devices.devices || []).length)],
            ['Workflows', String((workflows.workflows || []).length)],
            ['Jobs', String((jobs.jobs || []).length)],
            ['App Starts', String(metrics.app?.appStarts ?? 0)],
            ['Commands', String(metrics.app?.commandsDispatched ?? 0)],
            ['Events', String(metrics.app?.eventsObserved ?? 0)],
            ['Framework', runtime.versions?.framework ?? 'unknown'],
          ];
          overview.innerHTML = cards.map(([label, value]) => '<div class="stat"><span>' + label + '</span><strong>' + value + '</strong></div>').join('');

          renderList('devices', devices.devices || [], (device) =>
            '<li><strong>' + device.id + '</strong><div class="meta">' + device.type + ' · ' + device.status + '</div><pre>' + formatJson(device.state || {}) + '</pre></li>'
          );

          renderList('workflows', workflows.workflows || [], (workflow) =>
            '<li><strong>' + workflow.id + '</strong><div class="meta">' + ((workflow.steps || []).length) + ' steps</div><pre>' + formatJson(workflow) + '</pre></li>'
          );

          renderList('events', events.events || [], (event) =>
            '<li><strong>' + event.eventName + '</strong><div class="meta">' + (event.deviceId || 'runtime') + ' · ' + event.timestamp + '</div><pre>' + formatJson(event.payload || {}) + '</pre></li>'
          );

          renderList('plugins', plugins.plugins || [], (plugin) =>
            '<li><strong>' + plugin.name + '</strong><div class="meta">v' + plugin.version + ' · api ' + plugin.apiVersion + ' · compatible: ' + String(plugin.compatibility?.supported ?? false) + ' · state: ' + String(plugin.runtime?.state || 'unknown') + '</div><pre>' + formatJson({ capabilities: plugin.capabilities || {}, health: plugin.runtime?.health || null }) + '</pre></li>'
          );

          document.getElementById('cluster').textContent = formatJson(cluster);
          renderList('logs', logs.logs || [], (entry) =>
            '<li><strong>' + entry.level + '</strong><div class="meta">' + entry.source + ' · ' + entry.timestamp + '</div><pre>' + formatJson({ message: entry.message, details: entry.details || {} }) + '</pre></li>'
          );
          renderList('audit', audit.entries || [], (entry) =>
            '<li><strong>' + entry.action + '</strong><div class="meta">' + entry.resource + ' · ' + entry.outcome + ' · ' + entry.timestamp + '</div><pre>' + formatJson(entry.details || {}) + '</pre></li>'
          );
          statusNode.textContent = 'Updated at ' + new Date().toLocaleTimeString() + ' · plugin API ' + (runtime.versions?.pluginApiVersion || 'unknown');
        } catch (error) {
          statusNode.textContent = error instanceof Error ? error.message : String(error);
          statusNode.className = 'meta error';
        }
      }

      document.getElementById('refresh').addEventListener('click', refresh);
      tokenInput.addEventListener('change', refresh);
      refresh();
      setInterval(refresh, 5000);
    </script>
  </body>
</html>`;
}
