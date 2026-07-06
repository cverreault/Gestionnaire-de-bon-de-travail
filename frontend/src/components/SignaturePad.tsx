import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { theme, buttonStyles } from '../theme';
import { toast } from '../context/toast.store';
import { saveSignatures } from '../services/signatures.service';

/**
 * B12 — Two-pen signature capture at WO completion.
 *
 * Renders two labelled canvas pads (technician + client) with clear /
 * save actions. Signatures are submitted as PNG data-URLs to
 * POST /work-orders/:id/signatures.
 *
 * `initial*` seed the pads when reopening an already-signed WO — the
 * user sees the previous signature (read-only preview) and can Clear
 * to re-sign.
 */
export default function SignaturePad({
  workOrderId,
  initialTechnician,
  initialClient,
  onSaved,
}: {
  workOrderId: string;
  initialTechnician: string | null;
  initialClient: string | null;
  onSaved?: () => void;
}) {
  const techRef = useRef<SignatureCanvas | null>(null);
  const clientRef = useRef<SignatureCanvas | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasTechInitial] = useState<boolean>(!!initialTechnician);
  const [hasClientInitial] = useState<boolean>(!!initialClient);
  const [replacingTech, setReplacingTech] = useState(!hasTechInitial);
  const [replacingClient, setReplacingClient] = useState(!hasClientInitial);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: {
        signatureTechnician?: string | null;
        signatureClient?: string | null;
      } = {};
      if (replacingTech) {
        const t = techRef.current;
        if (t && !t.isEmpty()) {
          payload.signatureTechnician = t.getCanvas().toDataURL('image/png');
        }
      }
      if (replacingClient) {
        const c = clientRef.current;
        if (c && !c.isEmpty()) {
          payload.signatureClient = c.getCanvas().toDataURL('image/png');
        }
      }
      if (Object.keys(payload).length === 0) {
        toast.info('Rien à enregistrer — signez au moins une case.');
        return;
      }
      await saveSignatures(workOrderId, payload);
      toast.success('Signatures enregistrées');
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}
    >
      <SignatureCell
        label="Signature technicien"
        canvasRef={techRef}
        initial={initialTechnician}
        replacing={replacingTech}
        onStartReplace={() => setReplacingTech(true)}
        onClear={() => techRef.current?.clear()}
      />
      <SignatureCell
        label="Signature client"
        canvasRef={clientRef}
        initial={initialClient}
        replacing={replacingClient}
        onStartReplace={() => setReplacingClient(true)}
        onClear={() => clientRef.current?.clear()}
      />
      <div style={{ gridColumn: '1 / -1' }}>
        <button style={buttonStyles.primary} onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer les signatures'}
        </button>
      </div>
    </div>
  );
}

function SignatureCell({
  label,
  canvasRef,
  initial,
  replacing,
  onStartReplace,
  onClear,
}: {
  label: string;
  canvasRef: React.MutableRefObject<SignatureCanvas | null>;
  initial: string | null;
  replacing: boolean;
  onStartReplace: () => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 6,
        padding: 10,
        background: '#fff',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: theme.colors.textMuted,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {!replacing && initial ? (
        <div>
          <img
            src={initial}
            alt={label}
            style={{
              maxWidth: '100%',
              maxHeight: 120,
              display: 'block',
              margin: '4px auto',
            }}
          />
          <button
            style={{ ...buttonStyles.secondary, marginTop: 8 }}
            onClick={onStartReplace}
          >
            ↻ Re-signer
          </button>
        </div>
      ) : (
        <>
          {/* B20 — bitmap 600px large (net sur écrans haute densité) affiché
              fluide via CSS width:100% ; react-signature-canvas mappe les
              coordonnées tactiles correctement quelle que soit l'échelle. */}
          <SignatureCanvas
            ref={(r) => {
              canvasRef.current = r;
            }}
            canvasProps={{
              width: 600,
              height: 200,
              style: {
                width: '100%',
                maxWidth: '100%',
                height: 'auto',
                aspectRatio: '3 / 1',
                border: `1px dashed ${theme.colors.border}`,
                borderRadius: 4,
                background: '#fafafa',
                touchAction: 'none',
                display: 'block',
              },
            }}
            penColor="#0f172a"
          />
          <button
            style={{ ...buttonStyles.secondary, marginTop: 8 }}
            onClick={onClear}
          >
            🗑 Effacer
          </button>
        </>
      )}
    </div>
  );
}
