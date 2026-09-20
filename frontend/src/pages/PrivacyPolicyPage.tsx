import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme, cardStyles, buttonStyles } from '../theme';

/**
 * B24 — public privacy policy (Loi 25 / PIPEDA). Long legal copy lives
 * inline in two locale blocks rather than i18n JSON — it's a document,
 * not UI strings. Update LAST_UPDATED whenever the content changes.
 */

const LAST_UPDATED = '2026-09-21';
const COMPANY = 'Télécommunication Carl Verreault inc.';
const CONTACT = 'info@dispatch2go.com';

const h2: React.CSSProperties = {
  fontSize: theme.font.sizeLg,
  color: theme.colors.text,
  margin: '1.75rem 0 0.5rem',
};
const p: React.CSSProperties = {
  fontSize: theme.font.sizeSm,
  color: theme.colors.textSecondary,
  lineHeight: 1.65,
  margin: '0 0 0.75rem',
};
const li = p;

function FrenchPolicy() {
  return (
    <>
      <h1 style={{ fontSize: theme.font.size2xl, color: theme.colors.text, margin: '0 0 0.25rem' }}>
        Politique de confidentialité
      </h1>
      <p style={{ ...p, color: theme.colors.textMuted }}>
        {COMPANY} — plateforme Dispatch2Go. Dernière mise à jour : {LAST_UPDATED}.
      </p>

      <h2 style={h2}>1. Responsable de la protection des renseignements personnels</h2>
      <p style={p}>
        {COMPANY} est responsable des renseignements personnels recueillis par la plateforme
        Dispatch2Go, conformément à la Loi 25 (Québec) et à la LPRPDE (Canada). Pour toute
        question ou demande relative à vos renseignements :{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: theme.colors.primary }}>{CONTACT}</a>.
      </p>

      <h2 style={h2}>2. Renseignements recueillis</h2>
      <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
        <li style={li}><strong>Comptes utilisateurs</strong> (employés et clients invités au portail) : nom, courriel, téléphone, mot de passe (haché), préférences d'interface.</li>
        <li style={li}><strong>Dossiers clients</strong> : coordonnées, adresses d'intervention, historique des bons de travail.</li>
        <li style={li}><strong>Contenu opérationnel</strong> : descriptions de travaux, notes, photos et pièces jointes, signatures électroniques (client et technicien).</li>
        <li style={li}><strong>Géolocalisation des techniciens</strong> : uniquement avec consentement explicite (activation dans le profil), conservée <strong>7 jours</strong> puis supprimée automatiquement. Dans l'application mobile, la position n'est recueillie que pendant qu'un bon de travail est « en route » ou « en cours », y compris en arrière-plan si la permission « Toujours » a été accordée ; aucune collecte en dehors de ces périodes. Chaque action faite dans l'application (changement de statut, note, photo, signature, pièce) est en outre horodatée et associée à la position du téléphone à ce moment, lorsque la permission de localisation est accordée ; cette position est conservée avec l'historique du bon de travail.</li>
        <li style={li}><strong>Application mobile</strong> : identifiant d'installation (généré aléatoirement sur le téléphone, non publicitaire), modèle et version du système, version de l'application, jeton de notification — utilisés pour sécuriser les sessions par appareil, forcer les mises à jour critiques et acheminer les notifications. Chaque appareil peut être révoqué depuis le profil.</li>
        <li style={li}><strong>Journaux d'audit et techniques</strong> : actions effectuées dans l'application, conservés 365 jours par défaut.</li>
      </ul>

      <h2 style={h2}>3. Finalités</h2>
      <p style={p}>
        Ces renseignements servent exclusivement à la gestion des interventions terrain :
        création et répartition des bons de travail, suivi et complétion des interventions,
        production des rapports, notifications (courriel, SMS, push), facturation et
        administration des comptes. Aucun renseignement n'est vendu ni utilisé à des fins
        publicitaires.
      </p>

      <h2 style={h2}>4. Communication à des tiers (sous-traitants)</h2>
      <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
        <li style={li}><strong>Hébergement</strong> : la plateforme est auto-hébergée sur des serveurs sous le contrôle de {COMPANY}.</li>
        <li style={li}><strong>Twilio</strong> : envoi de messages texte (numéro de téléphone et contenu du message), lorsque les notifications SMS sont activées.</li>
        <li style={li}><strong>Stripe</strong> : traitement des paiements en ligne (les données bancaires sont recueillies directement par Stripe ; nous n'y avons jamais accès).</li>
        <li style={li}><strong>Fournisseur de courriel (SMTP)</strong> : acheminement des notifications par courriel.</li>
        <li style={li}><strong>Expo Push Service, Apple (APNs) et Google (FCM)</strong> : relais des notifications de l'application mobile. Seuls le titre, le texte de la notification et l'identifiant du bon de travail transitent ; aucune donnée client ni position GPS.</li>
      </ul>

      <h2 style={h2}>5. Sécurité</h2>
      <p style={p}>
        Transport chiffré (HTTPS), mots de passe hachés (bcrypt), secrets et clés chiffrés au
        repos (AES-256-GCM), authentification à deux facteurs offerte, cloisonnement des
        données par organisation, journalisation des accès.
      </p>

      <h2 style={h2}>6. Conservation</h2>
      <p style={p}>
        Les données sont conservées pendant la durée de la relation d'affaires. Positions GPS :
        7 jours. Journaux d'audit : 365 jours. Sur demande, un dossier client peut être exporté
        puis anonymisé de façon irréversible.
      </p>

      <h2 style={h2}>7. Vos droits</h2>
      <p style={p}>
        Vous pouvez demander l'accès à vos renseignements, leur rectification, leur portabilité
        (export structuré) ou leur suppression/anonymisation, et retirer votre consentement à la
        géolocalisation à tout moment. Adressez votre demande à{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: theme.colors.primary }}>{CONTACT}</a> —
        réponse dans un délai maximal de 30 jours.
      </p>

      <h2 style={h2}>8. Témoins et stockage local</h2>
      <p style={p}>
        L'application utilise uniquement le stockage local du navigateur pour maintenir votre
        session et vos préférences (langue, thème). Aucun témoin publicitaire ou de suivi n'est
        utilisé.
      </p>
      <p style={p}>
        L'application mobile conserve sur le téléphone une copie chiffrée par le système de vos
        bons de travail assignés, des notes, photos et signatures en attente d'envoi, ainsi que des
        positions GPS non encore transmises, afin de fonctionner hors ligne. Ces données sont
        effacées à la déconnexion d'un autre utilisateur sur le même appareil et à la
        désinstallation. La caméra n'est utilisée que pour les photos de pièces jointes et la
        lecture de codes-barres de pièces ; aucune image n'est analysée à d'autres fins.
      </p>
    </>
  );
}

function EnglishPolicy() {
  return (
    <>
      <h1 style={{ fontSize: theme.font.size2xl, color: theme.colors.text, margin: '0 0 0.25rem' }}>
        Privacy Policy
      </h1>
      <p style={{ ...p, color: theme.colors.textMuted }}>
        {COMPANY} — Dispatch2Go platform. Last updated: {LAST_UPDATED}.
      </p>

      <h2 style={h2}>1. Privacy officer</h2>
      <p style={p}>
        {COMPANY} is responsible for the personal information collected by the Dispatch2Go
        platform, in accordance with Québec's Law 25 and Canada's PIPEDA. For any question or
        request regarding your information:{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: theme.colors.primary }}>{CONTACT}</a>.
      </p>

      <h2 style={h2}>2. Information we collect</h2>
      <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
        <li style={li}><strong>User accounts</strong> (employees and portal-invited clients): name, email, phone, password (hashed), interface preferences.</li>
        <li style={li}><strong>Client records</strong>: contact details, service addresses, work-order history.</li>
        <li style={li}><strong>Operational content</strong>: work descriptions, notes, photos and attachments, electronic signatures (client and technician).</li>
        <li style={li}><strong>Technician geolocation</strong>: only with explicit consent (enabled from the profile), kept for <strong>7 days</strong> then automatically deleted. In the mobile app, location is collected only while a work order is "en route" or "in progress", including in the background when the "Always" permission was granted; nothing is collected outside those periods. Every action performed in the app (status change, note, photo, signature, part) is also timestamped and tied to the phone's position at that moment, when the location permission is granted; that position is kept with the work-order history.</li>
        <li style={li}><strong>Mobile app</strong>: installation identifier (randomly generated on the phone, not an advertising id), device model and OS version, app version, notification token — used to secure per-device sessions, enforce critical updates and route notifications. Each device can be revoked from the profile.</li>
        <li style={li}><strong>Audit and technical logs</strong>: actions performed in the application, kept 365 days by default.</li>
      </ul>

      <h2 style={h2}>3. Purposes</h2>
      <p style={p}>
        This information is used exclusively for field-service management: creating and
        dispatching work orders, tracking and completing interventions, producing reports,
        notifications (email, SMS, push), billing and account administration. No information is
        sold or used for advertising.
      </p>

      <h2 style={h2}>4. Third parties (processors)</h2>
      <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
        <li style={li}><strong>Hosting</strong>: the platform is self-hosted on servers under {COMPANY}'s control.</li>
        <li style={li}><strong>Twilio</strong>: text-message delivery (phone number and message content), when SMS notifications are enabled.</li>
        <li style={li}><strong>Stripe</strong>: online payment processing (banking details are collected directly by Stripe; we never access them).</li>
        <li style={li}><strong>Email provider (SMTP)</strong>: delivery of email notifications.</li>
        <li style={li}><strong>Expo Push Service, Apple (APNs) and Google (FCM)</strong>: relay of mobile app notifications. Only the title, the notification text and the work-order identifier transit; no client data and no GPS position.</li>
      </ul>

      <h2 style={h2}>5. Security</h2>
      <p style={p}>
        Encrypted transport (HTTPS), hashed passwords (bcrypt), secrets and keys encrypted at
        rest (AES-256-GCM), optional two-factor authentication, per-organization data isolation,
        access logging.
      </p>

      <h2 style={h2}>6. Retention</h2>
      <p style={p}>
        Data is kept for the duration of the business relationship. GPS positions: 7 days. Audit
        logs: 365 days. Upon request, a client record can be exported and then irreversibly
        anonymized.
      </p>

      <h2 style={h2}>7. Your rights</h2>
      <p style={p}>
        You may request access to your information, its rectification, its portability
        (structured export) or its deletion/anonymization, and withdraw geolocation consent at
        any time. Send your request to{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: theme.colors.primary }}>{CONTACT}</a> —
        we respond within 30 days.
      </p>

      <h2 style={h2}>8. Cookies and local storage</h2>
      <p style={p}>
        The application only uses the browser's local storage to maintain your session and
        preferences (language, theme). No advertising or tracking cookies are used.
      </p>
      <p style={p}>
        The mobile app keeps on the phone a system-encrypted copy of your assigned work orders,
        of notes, photos and signatures waiting to be sent, and of GPS positions not yet
        transmitted, so that it works offline. This data is erased when another user signs in on
        the same device and when the app is uninstalled. The camera is used only for attachment
        photos and part barcodes; images are not analysed for any other purpose.
      </p>
    </>
  );
}

export default function PrivacyPolicyPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';

  return (
    <div style={{ minHeight: '100dvh', background: theme.colors.background, padding: '1.5rem 1rem' }}>
      <div style={{ ...cardStyles.card, maxWidth: 780, margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <Link to="/login" style={{ color: theme.colors.textMuted, textDecoration: 'none', fontSize: theme.font.sizeSm }}>
            ← Dispatch2Go
          </Link>
          <button
            onClick={() => i18n.changeLanguage(locale === 'fr' ? 'en' : 'fr')}
            style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
          >
            {locale === 'fr' ? 'English' : 'Français'}
          </button>
        </div>
        {locale === 'fr' ? <FrenchPolicy /> : <EnglishPolicy />}
      </div>
    </div>
  );
}
