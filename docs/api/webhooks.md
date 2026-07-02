# Webhooks — Guide intégrateur

TaskMgr peut pousser les événements de votre tenant (bon de travail créé,
statut modifié, client mis à jour…) vers une URL de votre choix, plutôt
que de vous forcer à poller l'API publique.

Chaque livraison est signée en HMAC-SHA256 selon la même convention que
Stripe / GitHub — si vous avez déjà écrit un receveur pour l'un d'eux, la
logique est identique.

---

## 1. Créer un webhook

Depuis le portail admin d'un tenant → `⚙️ Paramètres` → `🔔 Webhooks` →
`➕ Nouveau webhook`. Renseignez :

- **Nom** — un libellé humain (`Intégration Zapier`, `Sync CRM`).
- **URL** — destination `https://…`. En dev, `http://` est autorisé ; en
  production, l'API refuse tout non-HTTPS.
- **Événements** — un ou plusieurs :
  - noms exacts : `workOrders.workOrder.created`, `clients.client.updated`
  - wildcard : `workOrders.*`, `clients.*`, `*`

À la création, le secret de signature (`whsec_…`) est affiché **une seule
fois**. Copiez-le immédiatement dans votre coffre.

Vous pouvez aussi passer par l'API publique (nécessite une clé API `admin`) :

```bash
curl -X POST https://votre-tenant.taskmgr.com/api/v1/webhooks \
  -H "X-API-Key: tkm_live_…" -H "Content-Type: application/json" \
  -d '{
    "name": "Zapier",
    "url": "https://hooks.zapier.com/hooks/catch/…",
    "subscribedEvents": ["workOrders.*"]
  }'
```

## 2. Format du payload

Chaque livraison POST porte un corps JSON de la forme :

```json
{
  "id": "d1c7…",
  "type": "workOrders.workOrder.statusChanged",
  "createdAt": "2026-07-02T14:32:07.412Z",
  "tenantId": "…",
  "data": { … },
  "changes": { "status": { "from": "…", "to": "…" } }
}
```

`data` a la même forme que la réponse de `GET /api/v1/<ressource>/:id`.
`changes` n'apparaît que pour les événements qui portent une notion de
"qu'est-ce qui a changé".

`id` est stable à travers les retries — utilisez-le pour rendre votre
receveur idempotent : « j'ai déjà traité cet id → 200 sans re-traiter ».

## 3. Vérifier la signature

Le header `X-TaskMgr-Signature` contient `t=<unix-seconds>,v1=<hex>` où
`v1 = HMAC_SHA256(secret, "<t>.<rawBody>")`.

⚠️ **Utilisez le corps BRUT** (bytes reçus), pas une re-sérialisation.

### Node / Express

```js
import crypto from 'node:crypto';

app.post('/hook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.header('X-TaskMgr-Signature') ?? '';
  const [tPart, v1Part] = sig.split(',');
  const t = Number(tPart?.split('=')[1]);
  const v1 = v1Part?.split('=')[1];
  if (!t || !v1) return res.sendStatus(400);

  // Fenêtre anti-replay ±5 minutes
  if (Math.abs(Date.now() / 1000 - t) > 300) return res.sendStatus(400);

  const expected = crypto
    .createHmac('sha256', process.env.TASKMGR_WEBHOOK_SECRET)
    .update(`${t}.${req.body.toString('utf8')}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
    return res.sendStatus(400);
  }

  const event = JSON.parse(req.body.toString('utf8'));
  // …
  res.sendStatus(200);
});
```

### Python / Flask

```python
import hmac, hashlib, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["TASKMGR_WEBHOOK_SECRET"].encode()

@app.post("/hook")
def hook():
    sig = request.headers.get("X-TaskMgr-Signature", "")
    parts = dict(p.split("=", 1) for p in sig.split(","))
    try:
        t = int(parts["t"])
        v1 = parts["v1"]
    except (KeyError, ValueError):
        abort(400)
    if abs(time.time() - t) > 300:
        abort(400)
    expected = hmac.new(SECRET, f"{t}.{request.data.decode()}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        abort(400)
    event = request.get_json(force=True)
    # …
    return "", 200
```

### PHP

```php
$sig  = $_SERVER['HTTP_X_TASKMGR_SIGNATURE'] ?? '';
$body = file_get_contents('php://input');
$parts = [];
foreach (explode(',', $sig) as $p) {
    [$k, $v] = explode('=', $p, 2) + [null, null];
    $parts[$k] = $v;
}
$t = (int)($parts['t'] ?? 0);
$v1 = $parts['v1'] ?? '';
if (!$t || abs(time() - $t) > 300) { http_response_code(400); exit; }
$expected = hash_hmac('sha256', "$t.$body", getenv('TASKMGR_WEBHOOK_SECRET'));
if (!hash_equals($expected, $v1)) { http_response_code(400); exit; }
$event = json_decode($body, true);
// …
```

## 4. Retries + succès

- Un HTTP `2xx` = succès. Toute autre réponse (ou un timeout de 10 s, un
  DNS échoué, un TLS refusé) = échec.
- Réessais : **30 s** → **2 min** → **10 min** → **1 h** → **6 h**. Après 6
  tentatives, la livraison est `abandoned`.
- Après **15 échecs consécutifs** sur un endpoint (tous événements
  confondus), TaskMgr auto-désactive le webhook. L'admin doit le
  réactiver depuis l'UI (ce qui reset le compteur).

Rendez votre receveur idempotent : le même événement peut arriver plus
d'une fois. Utilisez `payload.id` comme clé.

## 5. Événements publiables (v1)

| Nom | Quand |
|---|---|
| `workOrders.workOrder.created` | Nouveau BT |
| `workOrders.workOrder.assigned` | BT assigné à un technicien |
| `workOrders.workOrder.dispatched` | BT confirmé "en route" |
| `workOrders.workOrder.statusChanged` | Toute transition de statut |
| `workOrders.workOrder.completed` | BT terminé (positif ou négatif) |
| `workOrders.workOrder.slaBreached` | SLA dépassé |
| `clients.client.created` | Nouveau client |
| `clients.client.updated` | Client modifié |
| `clients.client.deleted` | Client désactivé |
| `apiIntegration.key.created` | Clé API créée |
| `apiIntegration.key.revoked` | Clé API révoquée |

Pour recevoir tout ce qui touche aux BT : souscrivez à `workOrders.*`.

## 6. Log + test

Depuis la page `🔔 Webhooks` :

- **🧪 Test** — envoie un événement `webhook.test` sur votre URL. Utile
  après la création pour valider le pipeline complet (signature, réseau,
  parsing) sans attendre qu'un vrai événement se produise.
- **📜 Log** — les 50 dernières tentatives (rafraîchi toutes les 5 s).
  Chaque ligne montre le statut HTTP, le corps de réponse (512 premiers
  caractères), et un bouton **🔁 Réessayer maintenant** pour les
  livraisons échouées ou abandonnées.

## 7. Régénérer un secret

Bouton **🔄 Nouveau secret** sur la ligne du webhook. L'ancien secret
cesse immédiatement de valider les signatures — coordonnez avec votre
receveur avant de cliquer.

## 8. Hors périmètre v1

Non disponibles aujourd'hui (voir ADR-012) :
- filtrage par contenu du payload (ex. « seulement si priority=HIGH »)
- webhooks chaînés
- headers custom / mTLS
- délai de retry configurable par endpoint
- export dead-letter

Si l'un de ces manque bloque votre intégration, ouvrez une issue.
