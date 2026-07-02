import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles, buttonStyles } from '../theme';
import { getOpenApiSpec } from '../services/api-docs.service';

/**
 * API Documentation page (B8).
 *
 * Two tabs :
 *   - Guide     — narrative getting-started (inline React)
 *   - Reference — interactive Swagger UI, loaded from a CDN on first
 *                 visit and populated with the OpenAPI spec fetched via
 *                 the app's authenticated axios path.
 *
 * Behind ProtectedRoute — any signed-in TaskMgr user (any role) reaches
 * it. The docs never expose data, only the API schema, so gating them
 * behind the "subscriber" bar (i.e. a logged-in account) is enough.
 */

const SWAGGER_CDN_JS =
  'https://unpkg.com/swagger-ui-dist@5.11.8/swagger-ui-bundle.js';
const SWAGGER_CDN_CSS =
  'https://unpkg.com/swagger-ui-dist@5.11.8/swagger-ui.css';

type Tab = 'guide' | 'reference';

export default function ApiDocsPage() {
  const { t } = useTranslation('apiDocs');
  const [tab, setTab] = useState<Tab>('guide');

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        <p
          style={{
            color: theme.colors.textMuted,
            margin: '4px 0 0',
            fontSize: 13,
          }}
        >
          {t('subtitle')}
        </p>
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <TabBtn active={tab === 'guide'} onClick={() => setTab('guide')}>
          📖 {t('tabs.guide')}
        </TabBtn>
        <TabBtn active={tab === 'reference'} onClick={() => setTab('reference')}>
          🧪 {t('tabs.reference')}
        </TabBtn>
      </div>

      {tab === 'guide' && <GuidePanel />}
      {tab === 'reference' && <ReferencePanel />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        border: 'none',
        borderBottom: active
          ? `2px solid ${theme.colors.primary}`
          : `2px solid transparent`,
        background: 'transparent',
        color: active ? theme.colors.text : theme.colors.textMuted,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

// ─── Reference (Swagger UI embedded from CDN) ───────────────────────

function ReferencePanel() {
  const { t } = useTranslation('apiDocs');
  const containerRef = useRef<HTMLDivElement>(null);
  const [swaggerReady, setSwaggerReady] = useState(false);

  // Fetch the spec through the authenticated axios path.
  const { data: spec, isLoading, error } = useQuery({
    queryKey: ['api-docs', 'openapi-spec'],
    queryFn: getOpenApiSpec,
    staleTime: 5 * 60_000,
  });

  // Lazily load the Swagger UI bundle (CSS + JS) from CDN. Loaded once
  // per session ; cached by the browser afterwards.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as unknown as { SwaggerUIBundle?: unknown }).SwaggerUIBundle) {
      setSwaggerReady(true);
      return;
    }
    let cssLoaded = false;
    let jsLoaded = false;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SWAGGER_CDN_CSS;
    link.onload = () => {
      cssLoaded = true;
      if (jsLoaded) setSwaggerReady(true);
    };
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = SWAGGER_CDN_JS;
    script.async = true;
    script.onload = () => {
      jsLoaded = true;
      if (cssLoaded) setSwaggerReady(true);
    };
    document.head.appendChild(script);

    // Do not remove the tags on unmount — the user may switch back to
    // this tab and we want the cached script.
  }, []);

  // Render Swagger UI once both the spec and the bundle are ready.
  useEffect(() => {
    if (!swaggerReady || !spec || !containerRef.current) return;
    const SwaggerUIBundle = (
      window as unknown as {
        SwaggerUIBundle: (opts: Record<string, unknown>) => void;
      }
    ).SwaggerUIBundle;
    if (typeof SwaggerUIBundle !== 'function') return;
    // Clear any previous render before re-init.
    containerRef.current.innerHTML = '';
    SwaggerUIBundle({
      spec,
      domNode: containerRef.current,
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    });
  }, [swaggerReady, spec]);

  if (isLoading) {
    return <InfoBlock>{t('reference.loading')}</InfoBlock>;
  }
  if (error) {
    return (
      <InfoBlock danger>
        {t('reference.loadFailed')}
      </InfoBlock>
    );
  }
  return (
    <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
      {!swaggerReady && (
        <InfoBlock>{t('reference.initializing')}</InfoBlock>
      )}
      <div ref={containerRef} />
    </div>
  );
}

// ─── Guide (inline React) ───────────────────────────────────────────

function GuidePanel() {
  const { t } = useTranslation('apiDocs');
  return (
    <div style={{ ...cardStyles.card, padding: 24, maxWidth: 900 }}>
      <Section title={t('guide.intro.title')}>
        <p>{t('guide.intro.p1')}</p>
        <p>{t('guide.intro.p2')}</p>
      </Section>

      <Section title={t('guide.auth.title')}>
        <p>{t('guide.auth.p1')}</p>
        <ol>
          <li>{t('guide.auth.step1')}</li>
          <li>{t('guide.auth.step2')}</li>
          <li>{t('guide.auth.step3')}</li>
        </ol>
        <p style={{ fontWeight: 600, color: theme.colors.warning }}>
          {t('guide.auth.warning')}
        </p>
      </Section>

      <Section title={t('guide.header.title')}>
        <CodeBlock>
{`curl -H "X-API-Key: tkm_live_ABC..." \\
  https://votre-domaine.taskmgr.com/api/v1/technicians`}
        </CodeBlock>
      </Section>

      <Section title={t('guide.scopes.title')}>
        <p>{t('guide.scopes.p1')}</p>
        <ul>
          <li>
            <strong>read-only</strong> — {t('guide.scopes.readOnly')}
          </li>
          <li>
            <strong>read-write</strong> — {t('guide.scopes.readWrite')}
          </li>
          <li>
            <strong>admin</strong> — {t('guide.scopes.admin')}
          </li>
        </ul>
      </Section>

      <Section title={t('guide.examples.title')}>
        <h4>{t('guide.examples.createWo')}</h4>
        <CodeBlock>
{`curl -X POST \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Fuite chauffe-eau",
    "type": "REPAIR",
    "priority": 3,
    "taskTypeId": "…",
    "clientId": "…",
    "clientAddressId": "…",
    "assignedToId": "…"
  }' \\
  /api/v1/work-orders`}
        </CodeBlock>

        <h4>{t('guide.examples.transitionWo')}</h4>
        <p>{t('guide.examples.transitionExplain')}</p>
        <CodeBlock>
{`# 1. Trouver les transitions possibles
curl -H "X-API-Key: $API_KEY" \\
  /api/v1/work-orders/$WO_ID/available-transitions

# 2. Appliquer la transition choisie
curl -X POST \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "targetStepId": "…", "completionNotes": "…" }' \\
  /api/v1/work-orders/$WO_ID/transition`}
        </CodeBlock>

        <h4>{t('guide.examples.uploadAttachment')}</h4>
        <CodeBlock>
{`curl -X POST \\
  -H "X-API-Key: $API_KEY" \\
  -F "file=@rapport.pdf" \\
  /api/v1/work-orders/$WO_ID/attachments`}
        </CodeBlock>
      </Section>

      <Section title={t('guide.rateLimit.title')}>
        <p>{t('guide.rateLimit.p1')}</p>
        <CodeBlock>
{`X-RateLimit-Limit-short: 30      X-RateLimit-Remaining-short: 29
X-RateLimit-Limit-medium: 300    X-RateLimit-Remaining-medium: 299
X-RateLimit-Limit-long: 3000     X-RateLimit-Remaining-long: 2999`}
        </CodeBlock>
        <p style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {t('guide.rateLimit.defaults')}
        </p>
      </Section>

      <Section title={t('guide.security.title')}>
        <ul>
          <li>{t('guide.security.storage')}</li>
          <li>{t('guide.security.revoke')}</li>
          <li>{t('guide.security.tenant')}</li>
          <li>{t('guide.security.audit')}</li>
        </ul>
      </Section>

      <Section title={t('guide.notIncluded.title')}>
        <p>{t('guide.notIncluded.p1')}</p>
        <ul>
          <li>{t('guide.notIncluded.users')}</li>
          <li>{t('guide.notIncluded.templates')}</li>
          <li>{t('guide.notIncluded.processes')}</li>
          <li>{t('guide.notIncluded.webhooks')}</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8, color: theme.colors.text }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: theme.colors.text }}>
        {children}
      </div>
    </section>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: theme.colors.surfaceAlt,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 6,
        padding: 12,
        fontSize: 12,
        overflowX: 'auto',
        fontFamily: 'monospace',
      }}
    >
      {children}
    </pre>
  );
}

function InfoBlock({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 20,
        textAlign: 'center',
        color: danger ? theme.colors.danger : theme.colors.textMuted,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
