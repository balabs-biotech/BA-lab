import { useEffect, useState, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import Demo from './Demo';
import {
  Activity,
  Box,
  Boxes,
  BadgeCheck,
  ShieldCheck,
  QrCode,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  KeyRound,
  ArrowUpRight,
  CircleAlert,
  X,
  FlaskConical,
  ClipboardCheck,
} from 'lucide-react';

const URL = 'https://axcouwiodqsauwnsiotn.supabase.co';
const KEY = 'sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992';
const PUBLIC_PASSPORT_URL = 'https://ba-labs-product-passport.pages.dev/';
const supabase = createClient(URL, KEY);
type Category = { id: string; code: string; name_fr: string };
type Product = {
  id: string;
  category_id: string;
  code: string;
  name_fr: string;
  lifecycle_status: string;
};
type Lot = {
  id: string;
  product_id: string;
  lot_code: string;
  status: string;
  manufactured_on: string | null;
  expires_on: string | null;
};
type LotEvent = {
  id: string;
  lot_id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string | null;
  details: Record<string, any>;
};
type Passport = {
  id: string;
  lot_id: string;
  status: string;
  current_version: number;
  published_at: string | null;
};
type QualityCheck = {
  id: string;
  lot_id: string;
  check_type: string;
  result: 'pending' | 'pass' | 'fail' | 'inconclusive';
  checked_by: string;
  checked_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  internal_notes: string | null;
};
type DocumentRecord = {
  id: string;
  lot_id: string | null;
  product_id: string | null;
  title: string;
  description: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  classification: 'internal' | 'quality' | 'public';
  uploaded_by: string;
  created_at: string;
  archived_at: string | null;
};
type Incident = {
  id: string;
  scope_type: 'lot' | 'product' | 'family';
  lot_id: string | null;
  product_id: string | null;
  category_id: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'corrective_action' | 'resolved' | 'closed';
  title: string;
  internal_description: string | null;
  root_cause: string | null;
  corrective_actions: string | null;
  created_at: string;
  resolved_at: string | null;
};
type AlertRecord = {
  id: string;
  incident_id: string;
  status: 'draft' | 'approved' | 'published' | 'suspended' | 'withdrawn';
  public_title: string;
  public_summary: string;
  approved_at: string | null;
  published_at: string | null;
};
type Data = {
  categories: Category[];
  products: Product[];
  lots: Lot[];
  passports: Passport[];
  quality_checks: QualityCheck[];
  documents: DocumentRecord[];
  incidents: Incident[];
  alerts: AlertRecord[];
  lot_events: LotEvent[];
  roles: string[];
};
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes('Invalid login credentials'))
    return 'Adresse e-mail ou mot de passe incorrect.';
  if (m.includes('forbidden') || m.includes('403'))
    return 'Ton rôle ne permet pas cette opération.';
  if (m.includes('unauthorized') || m.includes('401'))
    return 'La session a expiré. Reconnecte-toi.';
  if (m.includes('required_fields_missing'))
    return 'Certains champs obligatoires sont manquants.';
  if (m.includes('product_creation_failed'))
    return 'Le produit n’a pas été créé. Vérifie le code produit et les informations saisies.';
  if (m.includes('lot_creation_failed'))
    return 'Le lot n’a pas été créé. Vérifie le produit et le code du lot.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError'))
    return 'Connexion au service administratif impossible. Vérifie la connexion et réessaie.';
  if (m.startsWith('http_'))
    return `Le service administratif a répondu avec une erreur (${m.slice(5)}).`;
  return 'Opération impossible. Vérifie les champs et réessaie.';
};
async function admin<T>(body: Record<string, unknown>): Promise<T> {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const accessToken = authData.session?.access_token;
  if (!accessToken) throw new Error('unauthorized');

  const response = await fetch(`${URL}/functions/v1/passport-admin`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error) {
    throw new Error(
      typeof result?.error === 'string' ? result.error : `http_${response.status}`
    );
  }
  return result as T;
}
const date = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-FR') : '—';
const eventDescription = (event: LotEvent) => {
  const details = event.details || {};
  if (event.event_type === 'created') return `Création du lot ${details.lot_code || ''}`.trim();
  if (event.event_type === 'status_changed') {
    const transition = [details.from, details.to].filter(Boolean).join(' → ');
    return `Changement de statut${transition ? ' : ' + transition : ''}${details.reason ? ' · Motif : ' + details.reason : ''}`;
  }
  if (event.event_type === 'sampling') return `Contrôle qualité : ${details.check_type || 'contrôle'} · résultat ${details.result || 'enregistré'}`;
  if (event.event_type === 'note' && details.event === 'quality_check_reviewed') return 'Contrôle qualité revu indépendamment';
  const labels: Record<string, string> = { production_started: 'Début de production', production_updated: 'Mise à jour de production', transfer: 'Transfert', packaging: 'Conditionnement', storage: 'Mise en stockage', note: 'Note interne' };
  return labels[event.event_type] || 'Événement de traçabilité';
};

export default function App() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('?');
  const route = parts[0];
  const token = new URLSearchParams(parts[1] || '').get('token');
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState('overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(
    new URLSearchParams(window.location.search).get('mode') === 'recovery'
  );
  const [showRecoveryRequest, setShowRecoveryRequest] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  const [qualityLot, setQualityLot] = useState<Lot | null>(null);
  const [selectedLotHistory, setSelectedLotHistory] = useState<string | null>(null);
  const [qualityDraft, setQualityDraft] = useState({ check_type: '', result: 'pass', internal_notes: '' });
  const [transitionDraft, setTransitionDraft] = useState<{ lot: Lot; new_status: string; reason: string } | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docDraft, setDocDraft] = useState({ scope_type: 'lot', scope_id: '', title: '', description: '', classification: 'internal' });
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentEditing, setIncidentEditing] = useState<Incident | null>(null);
  const [incidentDraft, setIncidentDraft] = useState({ scope_type: 'lot', lot_id: '', product_id: '', category_id: '', severity: 'medium', title: '', internal_description: '' });
  const [incidentEditDraft, setIncidentEditDraft] = useState({ status: 'investigating', root_cause: '', corrective_actions: '' });
  const [alertIncident, setAlertIncident] = useState<Incident | null>(null);
  const [alertDraft, setAlertDraft] = useState({ public_title: '', public_summary: '' });
  const [qr, setQr] = useState<{
    image: string;
    url: string;
    lot: string;
  } | null>(null);
  const [publicData, setPublicData] = useState<Record<string, any> | null>(
    null
  );
  const [publicError, setPublicError] = useState('');
  const [publicBusy, setPublicBusy] = useState(false);
  const [product, setProduct] = useState({
    category_id: '',
    code: '',
    name_fr: '',
    public_description_fr: '',
    public_usage_fr: '',
    internal_description: '',
  });
  const [lot, setLot] = useState({
    product_id: '',
    lot_code: '',
    manufactured_on: '',
    expires_on: '',
    quantity: '',
    quantity_unit: '',
    internal_notes: '',
  });

  const refresh = async () => {
    const result = await admin<Data>({ action: 'dashboard' });
    setData(result);
    if (!product.category_id && result.categories[0])
      setProduct(v => ({ ...v, category_id: result.categories[0].id }));
    if (!lot.product_id && result.products[0])
      setLot(v => ({ ...v, product_id: result.products[0].id }));
  };

  useEffect(() => {
    if (route === 'demo') {
      setBoot(false);
      return;
    }
    if (route === 'p') {
      if (!token) {
        setPublicError('Ce QR code ne contient pas de jeton valide.');
        return;
      }
      setPublicBusy(true);
      fetch(
        URL + '/functions/v1/public-passport?token=' + encodeURIComponent(token)
      )
        .then(async r => {
          const body = await r.json();
          if (!r.ok) throw new Error('not_found');
          setPublicData(body.passport);
        })
        .catch(() =>
          setPublicError('Passeport introuvable, non publié ou révoqué.')
        )
        .finally(() => setPublicBusy(false));
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(async ({ data: d }) => {
      if (!alive) return;
      setSession(d.session);
      setBoot(false);
      if (d.session) {
        try {
          await refresh();
        } catch (e) {
          setError(errText(e));
        }
      }
    });
    const { data: auth } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(next);
      if (!next) setData(null);
    });
    return () => {
      alive = false;
      auth.subscription.unsubscribe();
    };
  }, []);

  if (route === 'demo') return <Demo />;

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Renseigne ton adresse e-mail et ton mot de passe.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (e) setError(errText(e));
    else {
      setPassword('');
      try {
        await refresh();
      } catch (e) {
        setError(errText(e));
      }
    }
  };
  const requestPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Saisis l’adresse e-mail du compte à récupérer.');
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}${window.location.pathname}?mode=recovery`,
      }
    );
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice('Si cette adresse correspond à un compte, un e-mail de récupération vient d’être envoyé. Vérifie aussi les courriers indésirables.');
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword.length < 12) {
      setError('Choisis un mot de passe d’au moins 12 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setRecoveryMode(false);
    window.history.replaceState({}, document.title, window.location.pathname);
    setNotice('Mot de passe modifié. La session sécurisée est ouverte.');
    try {
      await refresh();
    } catch (refreshError) {
      setError(errText(refreshError));
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const roles = data?.roles || [];
  const canCreate = roles.some(r =>
    ['principal_admin', 'administrator', 'operator'].includes(r)
  );
  const canPublish = roles.some(r =>
    ['principal_admin', 'administrator', 'approver'].includes(r)
  );
  const productName = (id: string) =>
    data?.products.find(p => p.id === id)?.name_fr || '—';
  const lotName = (id: string) =>
    data?.lots.find(l => l.id === id)?.lot_code || '—';
  const canOperate = roles.some(r => ['principal_admin', 'administrator', 'operator'].includes(r));
  const canQuality = roles.some(r => ['principal_admin', 'administrator', 'quality'].includes(r));
  const canReview = roles.some(r => ['principal_admin', 'administrator', 'quality', 'approver'].includes(r));
  const canRelease = roles.some(r => ['principal_admin', 'administrator', 'approver'].includes(r));
  const checksFor = (lotId: string) => (data?.quality_checks || []).filter(c => c.lot_id === lotId);
  const eventsFor = (lotId: string) => (data?.lot_events || []).filter(e => e.lot_id === lotId).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const transitionLot = async (item: Lot, newStatus: string) => {
    if (newStatus === 'investigation' || newStatus === 'under_surveillance') {
      setTransitionDraft({ lot: item, new_status: newStatus, reason: '' });
      return;
    }
    await act(async () => {
      await admin({ action: 'transition_lot', lot_id: item.id, new_status: newStatus, reason: null });
      await refresh();
      setNotice('Statut du lot mis à jour : ' + newStatus + '.');
    });
  };
  const saveTransition = (event: FormEvent) => {
    event.preventDefault();
    if (!transitionDraft?.reason.trim()) {
      setError('Un motif est obligatoire pour cette transition.');
      return;
    }
    void act(async () => {
      await admin({ action: 'transition_lot', lot_id: transitionDraft.lot.id, new_status: transitionDraft.new_status, reason: transitionDraft.reason.trim() });
      setTransitionDraft(null);
      await refresh();
      setNotice('Transition enregistrée avec son motif.');
    });
  };
  const recordCheck = (item: Lot) => {
    setQualityDraft({ check_type: '', result: 'pass', internal_notes: '' });
    setQualityLot(item);
  };
  const saveQualityCheck = (event: FormEvent) => {
    event.preventDefault();
    if (qualityDraft.check_type.trim().length < 2) {
      setError('Précise le type de contrôle (au moins 2 caractères).');
      return;
    }
    void act(async () => {
      await admin({ action: 'record_quality_check', lot_id: qualityLot!.id, check_type: qualityDraft.check_type.trim(), result: qualityDraft.result, internal_notes: qualityDraft.internal_notes.trim() || null });
      setQualityLot(null);
      await refresh();
      setNotice('Contrôle qualité enregistré. Une revue indépendante est requise avant libération.');
    });
  };
  const reviewCheck = async (check: QualityCheck) => {
    if (check.checked_by === session?.user.id) {
      setError('La revue doit être effectuée par une autre personne que celle qui a réalisé le contrôle.');
      return;
    }
    if (!window.confirm('Confirmer la revue indépendante de ce contrôle ?')) return;
    await act(async () => {
      await admin({ action: 'review_quality_check', check_id: check.id });
      await refresh();
      setNotice('Contrôle revu et tracé.');
    });
  };
  const releaseLot = async (item: Lot) => {
    const checks = checksFor(item.id);
    if (!checks.length || checks.some(c => c.result !== 'pass' || !c.reviewed_by)) {
      setError('Libération bloquée : chaque contrôle doit être au résultat pass et avoir été revu indépendamment.');
      return;
    }
    if (!window.confirm('Libérer le lot ' + item.lot_code + ' ? Cette opération autorise la création du passeport QR.')) return;
    await act(async () => {
      await admin({ action: 'release_lot', lot_id: item.id });
      await refresh();
      setNotice('Lot libéré. Vous pouvez maintenant créer son passeport QR.');
    });
  };

  if (route === 'p')
    return (
      <main className="public">
        <header className="public-brand">
          <b>BA</b>
          <span>
            BA LABS <small>PASSEPORT PRODUIT</small>
          </span>
        </header>
        {publicBusy && <p className="center">Vérification du passeport…</p>}
        {publicError && (
          <section className="public-card">
            <CircleAlert />
            <h1>Passeport indisponible</h1>
            <p>{publicError}</p>
          </section>
        )}
        {publicData && (
          <article className="public-card">
            <div className="verified">
              <BadgeCheck size={17} /> PASSEPORT PRODUIT VÉRIFIÉ
            </div>
            <p className="eyebrow">PRODUIT</p>
            <h1>{publicData.product?.name}</h1>
            <p className="muted">
              {publicData.product?.category} · {publicData.product?.code}
            </p>
            <div className="facts">
              <div>
                <small>LOT</small>
                <b>{publicData.lot?.code}</b>
              </div>
              <div>
                <small>FABRICATION</small>
                <b>{date(publicData.lot?.manufactured_on)}</b>
              </div>
              <div>
                <small>DATE LIMITE</small>
                <b>{date(publicData.lot?.expires_on)}</b>
              </div>
              <div>
                <small>QUALITÉ</small>
                <b>Lot libéré</b>
              </div>
            </div>
            {publicData.product?.description && (
              <section>
                <h3>Description</h3>
                <p>{publicData.product.description}</p>
              </section>
            )}
            {publicData.product?.usage && (
              <section>
                <h3>Conseils d’utilisation</h3>
                <p>{publicData.product.usage}</p>
              </section>
            )}
            {Array.isArray(publicData.alerts) && publicData.alerts.length > 0 && (
              <section>
                <h3>Informations importantes concernant ce produit</h3>
                {publicData.alerts.map((alert: { title: string; summary: string; published_at?: string }, index: number) => (
                  <div className="public-alert" key={index}>
                    <b>{alert.title}</b>
                    <p>{alert.summary}</p>
                    <small>Information publiée le {date(alert.published_at)}</small>
                  </div>
                ))}
              </section>
            )}
            <footer>BA Labs · Sétif, Algérie</footer>
          </article>
        )}
        <p className="legal">
          Informations publiques validées par BA Labs uniquement.
        </p>
      </main>
    );

  if (boot)
    return <div className="center">Initialisation de l’espace sécurisé…</div>;
  if (!session)
    return (
      <main className="login">
        <section className="login-art">
          <div className="brand">
            <b>BA</b>
            <span>
              BA LABS<small>APPLIED BIOTECHNOLOGY</small>
            </span>
          </div>
          <div className="hero">
            <p className="eyebrow">PRODUCT PASSPORT · 01</p>
            <h1>
              La traçabilité
              <br />
              <em>au bon niveau.</em>
            </h1>
            <p>
              Un passeport public vérifiable. Un espace interne maîtrisé. Une
              séparation nette entre données opérationnelles et informations
              publiées.
            </p>
            <div className="login-reference-heading">
              <span>ARCHIVES SCIENTIFIQUES</span>
              <p>Images documentaires de référence — elles ne représentent pas les produits ou lots BA Labs.</p>
            </div>
            <div className="login-reference-gallery">
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794006764/ba-labs-product-passport/pleurotus-mycelium-tobi-kellner.jpg"
                  alt="Mycélium de Pleurotus ostreatus cultivé dans une boîte de Petri sur marc de café"
                  loading="lazy"
                />
                <figcaption>
                  <i>Pleurotus ostreatus</i> · Tobi Kellner, 2012 ·{' '}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Oyster_mushroom_(Pleurotus_ostreatus)_mycelium_in_petri_dish_on_coffee_grounds.JPG"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY-SA 3.0
                  </a>
                </figcaption>
              </figure>
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794006964/ba-labs-product-passport/penicillium-culture-cdc-phil-12531.jpg"
                  alt="Culture de Penicillium multicolor sur gélose Sabouraud, photographie CDC PHIL 12531"
                  loading="lazy"
                />
                <figcaption>
                  <i>Penicillium multicolor</i> · CDC / Lucille K. Georg, 1968 ·{' '}
                  <a
                    href="https://wwwn.cdc.gov/phil/Details.aspx?pid=12531"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Domaine public
                  </a>
                </figcaption>
              </figure>
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794007021/ba-labs-product-passport/penicillium-microscopy-cdc-phil-19050.jpg"
                  alt="Photomicrographie des conidiophores de Penicillium multicolor à 970 fois, CDC PHIL 19050"
                  loading="lazy"
                />
                <figcaption>
                  <i>Penicillium multicolor</i>, 970× · CDC / Lucille K. Georg, 1972 ·{' '}
                  <a
                    href="https://wwwn.cdc.gov/phil/Details.aspx?pid=19050"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Domaine public
                  </a>
                </figcaption>
              </figure>
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794007149/ba-labs-product-passport/fungal-hyphae-spores-cdc-phil-26402.jpg"
                  alt="Photomicrographie d'un organisme fongique non identifié présentant des hyphes cloisonnées et des conidies, CDC PHIL 26402"
                  loading="lazy"
                />
                <figcaption>
                  Hyphes cloisonnées et conidies · CDC / Dr. Libero Ajello, 1979 ·{' '}
                  <a
                    href="https://wwwn.cdc.gov/phil/Details.aspx?pid=26402"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Domaine public
                  </a>
                </figcaption>
              </figure>
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794006764/ba-labs-product-passport/pleurotus-mycelium-tobi-kellner.jpg"
                  alt="Mycélium fongique en culture sur boîte de Petri"
                  loading="lazy"
                />
                <figcaption>
                  Spawn de <i>Volvariella volvacea</i> sur paille · Zenyrgarden, 2021 ·{' '}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Volvariella_volvacea_mushroom_spawn_on_straw.jpg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY-SA 4.0
                  </a>
                </figcaption>
              </figure>
              <figure className="login-reference-figure">
                <img
                  src="https://res.cloudinary.com/qkdvzksm/image/upload/v1794006964/ba-labs-product-passport/penicillium-culture-cdc-phil-12531.jpg"
                  alt="Culture fongique sur gélose en boîte de Petri"
                  loading="lazy"
                />
                <figcaption>
                  Fermentation fongique à l'état solide · Luis Fernando Flores LAB, 2019 ·{' '}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Fungal_growth_-_solid_state_fermentation.jpg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY-SA 4.0
                  </a>
                </figcaption>
              </figure>
            </div>
          </div>
          <small className="foot">
            CLIENTS : SCANNEZ LE QR CODE POUR CONSULTER LE PASSEPORT · PERSONNEL : CONNEXION CI-CONTRE · SÉTIF
          </small>
        </section>
        <section className="login-panel">
          <div className="login-form">
            <div className="key-icon">
              <KeyRound />
            </div>
            <p className="eyebrow">ESPACE D’ADMINISTRATION</p>
            <h2>Connexion</h2>
            <p className="muted">
              {recoveryMode
                ? 'Définis un nouveau mot de passe pour ton compte BA Labs.'
                : showRecoveryRequest
                  ? 'Demande un lien sécurisé envoyé à l’adresse e-mail de ton compte.'
                  : 'Espace interne réservé au personnel BA Labs. Les clients consultent leur passeport en scannant le QR code du produit.'}
            </p>
            {recoveryMode ? (
              <form onSubmit={changePassword}>
                <label>
                  Nouveau mot de passe
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                    placeholder="12 caractères minimum"
                  />
                </label>
                <label>
                  Confirmer le mot de passe
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                    placeholder="Répète le nouveau mot de passe"
                  />
                </label>
                {error && <p className="error"><CircleAlert size={15} />{error}</p>}
                <button className="primary wide" disabled={busy}>
                  {busy ? 'Modification…' : 'Enregistrer le nouveau mot de passe'}
                </button>
              </form>
            ) : showRecoveryRequest ? (
              <form onSubmit={requestPasswordReset}>
                <label>
                  Adresse e-mail du compte
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    placeholder="nom@balabs.dz"
                  />
                </label>
                {error && <p className="error"><CircleAlert size={15} />{error}</p>}
                {notice && <p className="success">{notice}</p>}
                <button className="primary wide" disabled={busy}>
                  {busy ? 'Envoi…' : 'Envoyer le lien de récupération'}
                </button>
                <button className="link-button" type="button" onClick={() => { setShowRecoveryRequest(false); setError(''); setNotice(''); }}>
                  Retour à la connexion
                </button>
              </form>
            ) : (
              <form onSubmit={signIn}>
                <label>
                  Adresse e-mail
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    placeholder="nom@balabs.dz"
                  />
                </label>
                <label>
                  Mot de passe
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                  />
                </label>
                {error && <p className="error"><CircleAlert size={15} />{error}</p>}
                {notice && <p className="success">{notice}</p>}
                <button className="primary wide" disabled={busy}>
                  {busy ? 'Connexion…' : 'Accéder à l’espace'}{' '}
                  <ArrowUpRight size={16} />
                </button>
                <button className="link-button" type="button" onClick={() => { setShowRecoveryRequest(true); setError(''); setNotice(''); }}>
                  Mot de passe oublié ?
                </button>
              </form>
            )}
            {!recoveryMode && !showRecoveryRequest && (
              <a className="demo-entry" href="#/demo">Explorer la démonstration <ArrowUpRight size={15} /></a>
            )}
            <p className="secure">
              <ShieldCheck size={15} /> Session authentifiée · Permissions
              contrôlées côté serveur
            </p>
          </div>
        </section>
      </main>
    );

  const filteredProducts = (data?.products || []).filter(p =>
    (p.code + ' ' + p.name_fr).toLowerCase().includes(search.toLowerCase())
  );
  const filteredLots = (data?.lots || []).filter(l =>
    (l.lot_code + ' ' + productName(l.product_id))
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const createProduct = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      await admin({ action: 'create_product', ...product });
      setProductOpen(false);
      await refresh();
      setNotice('Produit ajouté au catalogue.');
    });
  };
  const createLot = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      await admin({
        action: 'create_lot',
        ...lot,
        quantity: lot.quantity ? Number(lot.quantity) : null,
        manufactured_on: lot.manufactured_on || null,
        expires_on: lot.expires_on || null,
      });
      setLotOpen(false);
      await refresh();
      setNotice(
        'Lot créé. Les contrôles qualité restent nécessaires avant libération.'
      );
    });
  };
  const createQr = async (item: Lot) =>
    act(async () => {
      const result = await admin<{ qr_token: string }>({
        action: 'create_draft',
        lot_id: item.id,
      });
      const link =
        PUBLIC_PASSPORT_URL +
        '#/p?token=' +
        encodeURIComponent(result.qr_token);
      const image = await QRCode.toDataURL(link, { width: 320, margin: 2 });
      setQr({ image, url: link, lot: item.lot_code });
      await refresh();
    });
  const publish = async (item: Passport) =>
    act(async () => {
      await admin({ action: 'publish', passport_id: item.id });
      await refresh();
      setNotice(item.status === 'published'
        ? 'Nouvelle version publiée. Le QR existant affiche maintenant les informations actualisées.'
        : 'Passeport publié. Le QR est maintenant consultable.');
    });
  const revokePassport = async (item: Passport) => {
    if (!window.confirm('Révoquer le passeport de ' + lotName(item.lot_id) + ' ? Le QR actuel cessera immédiatement de fonctionner.')) return;
    await act(async () => {
      await admin({ action: 'revoke_passport', passport_id: item.id });
      await refresh();
      setNotice('Passeport révoqué. Son ancien QR ne permet plus de consulter le passeport.');
    });
  };
  const rotatePassportToken = async (item: Passport) =>
    act(async () => {
      const result = await admin<{ qr_token: string }>({ action: 'rotate_token', passport_id: item.id });
      const link = PUBLIC_PASSPORT_URL + '#/p?token=' + encodeURIComponent(result.qr_token);
      const image = await QRCode.toDataURL(link, { width: 320, margin: 2 });
      setQr({ image, url: link, lot: lotName(item.lot_id) });
      await refresh();
      setNotice('Nouveau QR généré. L’ancien jeton est invalidé ; republie le passeport pour activer le nouveau QR.');
    });
  const uploadDocument = (event: FormEvent) => {
    event.preventDefault();
    if (!docFile) { setError('Sélectionne un fichier PDF.'); return; }
    if (docFile.type !== 'application/pdf' || docFile.size < 1 || docFile.size > 3 * 1024 * 1024) {
      setError('Le fichier doit être un PDF de 3 Mo maximum.'); return;
    }
    if (!docDraft.scope_id || !docDraft.title.trim()) { setError('Renseigne le rattachement et le titre.'); return; }
    void act(async () => {
      const bytes = new Uint8Array(await docFile.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const file_base64 = btoa(binary);
      await admin({ action: 'upload_document', [docDraft.scope_type === 'lot' ? 'lot_id' : 'product_id']: docDraft.scope_id, title: docDraft.title.trim(), description: docDraft.description.trim() || null, classification: docDraft.classification, original_filename: docFile.name, file_base64 });
      setDocFile(null);
      setDocDraft(v => ({ ...v, title: '', description: '' }));
      await refresh();
      setNotice('Document ajouté au dossier privé. Aucun lien public n’a été créé.');
    });
  };
  const openDocument = async (doc: DocumentRecord) => {
    await act(async () => {
      const result = await admin<{ signed_url: string }>({ action: 'signed_document_url', document_id: doc.id });
      const a = document.createElement('a'); a.href = result.signed_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
    });
  };
  const archiveDocument = async (doc: DocumentRecord) => {
    if (!window.confirm('Archiver « ' + doc.title + ' » ? Le fichier sera masqué de la liste active.')) return;
    await act(async () => { await admin({ action: 'archive_document', document_id: doc.id }); await refresh(); setNotice('Document archivé.'); });
  };
  const createIncident = (event: FormEvent) => {
    event.preventDefault();
    const scope = incidentDraft.scope_type;
    if ((scope === 'lot' && !incidentDraft.lot_id) || (scope === 'product' && !incidentDraft.product_id) || (scope === 'family' && !incidentDraft.category_id)) {
      setError('Sélectionne le périmètre concerné par l’incident.');
      return;
    }
    void act(async () => {
      await admin({ action: 'create_incident', scope_type: scope, lot_id: scope === 'lot' ? incidentDraft.lot_id : null, product_id: scope === 'product' ? incidentDraft.product_id : null, category_id: scope === 'family' ? incidentDraft.category_id : null, severity: incidentDraft.severity, title: incidentDraft.title.trim(), internal_description: incidentDraft.internal_description.trim() || null });
      setIncidentOpen(false);
      setIncidentDraft({ scope_type: 'lot', lot_id: '', product_id: '', category_id: '', severity: 'medium', title: '', internal_description: '' });
      await refresh();
      setNotice('Incident enregistré dans le journal qualité interne.');
    });
  };
  const openIncidentEditor = (item: Incident) => {
    setIncidentEditing(item);
    setIncidentEditDraft({ status: item.status, root_cause: item.root_cause || '', corrective_actions: item.corrective_actions || '' });
  };
  const saveIncident = (event: FormEvent) => {
    event.preventDefault();
    if (!incidentEditing) return;
    void act(async () => {
      await admin({ action: 'update_incident', incident_id: incidentEditing.id, ...incidentEditDraft });
      setIncidentEditing(null);
      await refresh();
      setNotice('Dossier incident mis à jour et journalisé.');
    });
  };
  const createAlertDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!alertIncident) return;
    void act(async () => {
      await admin({ action: 'create_alert_draft', incident_id: alertIncident.id, ...alertDraft });
      setAlertIncident(null);
      setAlertDraft({ public_title: '', public_summary: '' });
      await refresh();
      setNotice('Projet d’alerte publique créé. Il doit être approuvé avant publication.');
    });
  };
  const processAlert = async (item: AlertRecord, action: 'approve_alert' | 'publish_alert') => {
    const verb = action === 'approve_alert' ? 'approuver' : 'publier';
    if (!window.confirm('Confirmer : ' + verb + ' cette alerte publique ?')) return;
    await act(async () => {
      await admin({ action, alert_id: item.id });
      await refresh();
      setNotice(action === 'approve_alert' ? 'Alerte approuvée.' : 'Alerte publiée. Elle pourra apparaître sur les passeports concernés lors de leur prochaine publication.');
    });
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <b>BA</b>
          <span>
            BA LABS<small>PRODUCT PASSPORT</small>
          </span>
        </div>
        <p className="nav-caption">ESPACE DE TRAVAIL</p>
        <nav>
          <button
            className={tab === 'overview' ? 'active' : ''}
            onClick={() => setTab('overview')}
          >
            <Activity size={17} />
            Vue d’ensemble
          </button>
          <button
            className={tab === 'products' ? 'active' : ''}
            onClick={() => setTab('products')}
          >
            <Box size={17} />
            Catalogue produits
          </button>
          <button
            className={tab === 'lots' ? 'active' : ''}
            onClick={() => setTab('lots')}
          >
            <Boxes size={17} />
            Lots de production
          </button>
          <button
            className={tab === 'incidents' ? 'active' : ''}
            onClick={() => setTab('incidents')}
          >
            <CircleAlert size={17} />
            Incidents & alertes
          </button>
          <button
            className={tab === 'passports' ? 'active' : ''}
            onClick={() => setTab('passports')}
          >
            <QrCode size={17} />
            Passeports QR
          </button>
          <button
            className={tab === 'documents' ? 'active' : ''}
            onClick={() => setTab('documents')}
          >
            <ClipboardCheck size={17} />
            Documents
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="safe">
            <ShieldCheck size={17} />
            <span>
              <b>Zone protégée</b>
              <small>Accès contrôlé par rôle</small>
            </span>
          </div>
          <button
            className="logout"
            onClick={async () => {
              await supabase.auth.signOut();
              setSession(null);
            }}
          >
            <span>{session.user.email}</span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>BA LABS / PRODUCT PASSPORT / {tab.toUpperCase()}</span>
          <div>
            <span className="online">● SYSTÈME ACTIF</span>
            <button
              className="icon-button"
              onClick={() => void act(refresh)}
              title="Actualiser"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">CONSOLE DE TRAÇABILITÉ</p>
              <h1>
                {tab === 'overview'
                  ? 'Vue d’ensemble'
                  : tab === 'products'
                    ? 'Catalogue produits'
                    : tab === 'lots'
                      ? 'Lots de production'
                      : tab === 'incidents'
                        ? 'Incidents & alertes'
                        : tab === 'documents'
                        ? 'Documents justificatifs'
                        : 'Passeports QR'}
              </h1>
              <p className="muted">
                Suivi des produits, des lots et de leurs passeports publics.
              </p>
            </div>
            <span className="role">{roles[0] || 'Personnel'}</span>
          </div>
          {notice && (
            <p className="notice">
              <BadgeCheck size={16} />
              {notice}
              <button onClick={() => setNotice('')}>
                <X size={14} />
              </button>
            </p>
          )}
          {error && (
            <p className="error">
              <CircleAlert size={16} />
              {error}
              <button onClick={() => setError('')}>
                <X size={14} />
              </button>
            </p>
          )}
          {tab === 'overview' && (
            <>
              <div className="metrics">
                <div>
                  <span>Produits</span>
                  <strong>{data?.products.length || 0}</strong>
                  <small>Références catalogue</small>
                </div>
                <div>
                  <span>Lots</span>
                  <strong>{data?.lots.length || 0}</strong>
                  <small>Lots enregistrés</small>
                </div>
                <div>
                  <span>Lots libérés</span>
                  <strong>
                    {data?.lots.filter(x => x.status === 'released').length ||
                      0}
                  </strong>
                  <small>Éligibles au passeport</small>
                </div>
                <div className="metric-accent">
                  <span>Passeports publiés</span>
                  <strong>
                    {data?.passports.filter(x => x.status === 'published')
                      .length || 0}
                  </strong>
                  <small>Consultables par QR</small>
                </div>
              </div>
              <section className="panel quick-actions">
                <div><p className="eyebrow">ACTIONS DIRECTES</p><h2>Que souhaitez-vous faire ?</h2><p className="muted">Accès immédiat aux opérations autorisées par votre rôle.</p></div>
                <div className="quick-action-buttons">
                  {canCreate && <button className="primary" onClick={() => setProductOpen(true)}><Plus size={15} />Créer un produit</button>}
                  {canCreate && <button className="secondary" disabled={!data?.products.length} onClick={() => setLotOpen(true)}><Plus size={15} />Créer un lot</button>}
                  {(canQuality || canRelease || canOperate) && <button className="secondary" onClick={() => setTab('lots')}>Traiter les lots <ArrowUpRight size={15} /></button>}
                  {(canCreate || canPublish) && <button className="secondary" onClick={() => setTab('passports')}>Gérer les passeports <QrCode size={15} /></button>}
                </div>
              </section>
              <div className="panels">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <p className="eyebrow">RÉFÉRENTIEL</p>
                      <h2>Produits récents</h2>
                    </div>
                    <button className="link" onClick={() => setTab('products')}>
                      Voir le catalogue <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {(data?.products || []).slice(0, 6).map(p => (
                    <div className="row" key={p.id}>
                      <span className="row-icon">
                        <FlaskConical size={17} />
                      </span>
                      <span>
                        <b>{p.name_fr}</b>
                        <small>
                          {p.code} ·{' '}
                          {
                            data?.categories.find(c => c.id === p.category_id)
                              ?.name_fr
                          }
                        </small>
                      </span>
                      <em>{p.lifecycle_status}</em>
                    </div>
                  ))}
                  {!data?.products.length && (
                    <p className="empty">Aucun produit enregistré.</p>
                  )}
                </section>
                <section className="panel">
                  <p className="eyebrow">PROCESSUS</p>
                  <h2>Cycle de publication</h2>
                  {[
                    { label: 'Créer une référence produit', action: () => setProductOpen(true), disabled: !canCreate },
                    { label: 'Enregistrer un lot', action: () => setLotOpen(true), disabled: !canCreate || !data?.products.length },
                    { label: 'Contrôler et libérer un lot', action: () => setTab('lots'), disabled: !canQuality && !canRelease },
                    { label: 'Générer et publier le passeport QR', action: () => setTab('passports'), disabled: !canCreate && !canPublish },
                  ].map((step, i) => (
                    <button className="step step-button" key={step.label} disabled={step.disabled} onClick={step.action}>
                      <b>0{i + 1}</b>
                      <span>{step.label}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </section>
              </div>
            </>
          )}
          {tab === 'products' && (
            <section className="panel">
              <div className="panel-title">
                <h2>Catalogue produits</h2>
                {canCreate && (
                  <button
                    className="primary"
                    onClick={() => setProductOpen(true)}
                  >
                    <Plus size={16} />
                    Nouveau produit
                  </button>
                )}
              </div>
              <div className="search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un code ou un nom"
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Code</th>
                      <th>Catégorie</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td>
                          <b>{p.name_fr}</b>
                        </td>
                        <td>{p.code}</td>
                        <td>
                          {data?.categories.find(c => c.id === p.category_id)
                            ?.name_fr || '—'}
                        </td>
                        <td>{p.lifecycle_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredProducts.length && (
                <p className="empty">Aucun produit trouvé.</p>
              )}
            </section>
          )}
          {tab === 'lots' && (
            <section className="panel">
              <div className="panel-title">
                <h2>Lots de production</h2>
                {canCreate && (
                  <button
                    className="primary"
                    onClick={() => setLotOpen(true)}
                    disabled={!data?.products.length}
                  >
                    <Plus size={16} />
                    Nouveau lot
                  </button>
                )}
              </div>
              <div className="search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un lot ou un produit"
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Produit</th>
                      <th>Fabrication</th>
                      <th>Expiration</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLots.map(l => (
                      <tr key={l.id}>
                        <td>{l.lot_code}</td>
                        <td>{productName(l.product_id)}</td>
                        <td>{date(l.manufactured_on)}</td>
                        <td>{date(l.expires_on)}</td>
                        <td>
                          <span
                            className={l.status === 'released' ? 'good' : ''}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="lot-actions">
                          <button className="small" disabled={busy} onClick={() => setSelectedLotHistory(selectedLotHistory === l.id ? null : l.id)}>
                            {selectedLotHistory === l.id ? 'Masquer l’historique' : `Historique (${eventsFor(l.id).length})`}
                          </button>
                          {l.status === 'draft' && canOperate && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'in_production')}>Démarrer</button>
                          )}
                          {l.status === 'in_production' && canOperate && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'awaiting_checks')}>Envoyer au contrôle</button>
                          )}
                          {(l.status === 'awaiting_checks' || l.status === 'under_surveillance') && canQuality && (
                            <button className="small" disabled={busy} onClick={() => void recordCheck(l)}>+ Contrôle qualité</button>
                          )}
                          {l.status === 'awaiting_checks' && canQuality && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'investigation')}>Ouvrir enquête</button>
                          )}
                          {l.status === 'investigation' && canReview && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'awaiting_checks')}>Retour aux contrôles</button>
                          )}
                          {l.status === 'under_surveillance' && canReview && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'awaiting_checks')}>Recontrôler</button>
                          )}
                          {l.status === 'released' && canReview && (
                            <button className="small" disabled={busy} onClick={() => void transitionLot(l, 'under_surveillance')}>Surveillance</button>
                          )}
                          {l.status === 'awaiting_checks' && canRelease && (
                            <button className="small" disabled={busy} onClick={() => void releaseLot(l)}>Libérer</button>
                          )}
                          {l.status === 'released' && canCreate && (
                            <button className="small" disabled={busy} onClick={() => void createQr(l)}><QrCode size={14} />Créer QR</button>
                          )}
                          {checksFor(l.id).length > 0 && (
                            <div className="quality-list">
                              <b>Contrôles ({checksFor(l.id).length})</b>
                              {checksFor(l.id).map(c => (
                                <div className="quality-item" key={c.id}>
                                  <span><strong>{c.check_type}</strong> · {c.result} · {date(c.checked_at)}<small>{c.reviewed_by ? 'Revu indépendamment' : 'En attente de revue'}{c.internal_notes ? ' · ' + c.internal_notes : ''}</small></span>
                                  {!c.reviewed_by && canReview && c.checked_by !== session.user.id && (
                                    <button className="small" disabled={busy} onClick={() => void reviewCheck(c)}>Revoir</button>
                                  )}
                                  {!c.reviewed_by && c.checked_by === session.user.id && <small>Revue par un autre membre requise</small>}
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedLotHistory === l.id && (
                            <div className="lot-history">
                              <div className="lot-history-heading">
                                <b>Chronologie du lot</b>
                                <small>{eventsFor(l.id).length} événement(s) tracé(s)</small>
                              </div>
                              {eventsFor(l.id).length ? eventsFor(l.id).map(event => (
                                <div className="lot-history-event" key={event.id}>
                                  <span className="lot-history-dot" />
                                  <div>
                                    <b>{eventDescription(event)}</b>
                                    <small>{new Date(event.occurred_at).toLocaleString('fr-FR')}</small>
                                  </div>
                                </div>
                              )) : <p className="empty">Aucun événement enregistré pour ce lot.</p>}
                              <p className="lot-history-note">Historique interne BA Labs · non visible dans le passeport client.</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredLots.length && (
                <p className="empty">Aucun lot enregistré.</p>
              )}
            </section>
          )}
          {tab === 'incidents' && (
            <div className="panels">
              <section className="panel">
                <div className="panel-title">
                  <div><p className="eyebrow">QUALITÉ & GESTION DES RISQUES</p><h2>Journal des incidents</h2><p className="muted">Les descriptions, causes et actions correctives restent internes.</p></div>
                  {canOperate && <button className="primary" onClick={() => setIncidentOpen(true)}><Plus size={15}/>Déclarer un incident</button>}
                </div>
                {(data?.incidents || []).map(item => (
                  <div className="incident-card" key={item.id}>
                    <div className="incident-card-head">
                      <div><b>{item.title}</b><small>{item.scope_type === 'lot' ? 'Lot · ' + lotName(item.lot_id || '') : item.scope_type === 'product' ? 'Produit · ' + productName(item.product_id || '') : 'Famille · ' + (data?.categories.find(c => c.id === item.category_id)?.name_fr || '—')}</small></div>
                      <span className={'incident-severity ' + item.severity}>{item.severity.toUpperCase()}</span>
                    </div>
                    <p>{item.internal_description || 'Aucune description complémentaire.'}</p>
                    <div className="incident-meta"><span>État : <b>{item.status.replace('_', ' ')}</b></span><span>Ouvert le {date(item.created_at)}</span></div>
                    <div className="incident-actions">
                      {canReview && <button className="small" disabled={busy} onClick={() => openIncidentEditor(item)}>Mettre à jour le dossier</button>}
                      {canPublish && item.status !== 'closed' && !(data?.alerts || []).some(a => a.incident_id === item.id && !['withdrawn','suspended'].includes(a.status)) && <button className="small" disabled={busy} onClick={() => {setAlertIncident(item);setAlertDraft({public_title:item.title,public_summary:''});}}>Préparer une alerte publique</button>}
                    </div>
                    {(item.root_cause || item.corrective_actions) && <div className="incident-resolution"><b>Analyse et actions correctives</b>{item.root_cause && <p><strong>Cause :</strong> {item.root_cause}</p>}{item.corrective_actions && <p><strong>Actions :</strong> {item.corrective_actions}</p>}</div>}
                  </div>
                ))}
                {!(data?.incidents || []).length && <p className="empty">Aucun incident enregistré.</p>}
              </section>
              <section className="panel">
                <div className="panel-title"><div><p className="eyebrow">COMMUNICATION CLIENT</p><h2>Alertes publiques</h2><p className="muted">Une alerte n’est visible qu’après approbation et publication.</p></div></div>
                {(data?.alerts || []).map(item => (
                  <div className="alert-card" key={item.id}>
                    <div><b>{item.public_title}</b><small>{item.status.toUpperCase()} · {date(item.created_at)}</small></div>
                    <p>{item.public_summary}</p>
                    <div className="incident-actions">
                      {item.status === 'draft' && canPublish && <button className="small" disabled={busy} onClick={() => void processAlert(item,'approve_alert')}>Approuver</button>}
                      {item.status === 'approved' && canPublish && <button className="small" disabled={busy} onClick={() => void processAlert(item,'publish_alert')}>Publier</button>}
                    </div>
                  </div>
                ))}
                {!(data?.alerts || []).length && <p className="empty">Aucune alerte préparée.</p>}
              </section>
            </div>
          )}
          {tab === 'documents' && (
            <section className="panel">
              <div className="panel-title">
                <div><h2>Documents internes</h2><p className="muted">PDF privés associés aux produits et aux lots.</p></div>
              </div>
              {(canCreate || canQuality) && (
                <form className="document-form" onSubmit={uploadDocument}>
                  <div className="two">
                    <label>Rattacher à
                      <select value={docDraft.scope_type} onChange={e => setDocDraft(v => ({ ...v, scope_type: e.target.value, scope_id: '' }))}>
                        <option value="lot">Un lot</option><option value="product">Un produit</option>
                      </select>
                    </label>
                    <label>{docDraft.scope_type === 'lot' ? 'Lot' : 'Produit'}
                      <select required value={docDraft.scope_id} onChange={e => setDocDraft(v => ({ ...v, scope_id: e.target.value }))}>
                        <option value="">Sélectionner</option>
                        {docDraft.scope_type === 'lot' ? (data?.lots || []).map(l => <option key={l.id} value={l.id}>{l.lot_code} · {productName(l.product_id)}</option>) : (data?.products || []).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name_fr}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="two">
                    <label>Titre du document<input required maxLength={160} value={docDraft.title} onChange={e => setDocDraft(v => ({ ...v, title: e.target.value }))} placeholder="Rapport de contrôle, fiche technique…" /></label>
                    <label>Classification<select value={docDraft.classification} onChange={e => setDocDraft(v => ({ ...v, classification: e.target.value }))}><option value="internal">Interne</option><option value="quality">Qualité</option></select></label>
                  </div>
                  <label>Description (facultative)<textarea maxLength={1200} value={docDraft.description} onChange={e => setDocDraft(v => ({ ...v, description: e.target.value }))} /></label>
                  <label>Fichier PDF · 3 Mo maximum<input type="file" accept="application/pdf,.pdf" required onChange={e => setDocFile(e.target.files?.[0] || null)} /></label>
                  <button className="primary" disabled={busy || !docFile}><Plus size={15} />Ajouter au dossier privé</button>
                </form>
              )}
              <div className="table-scroll">
                <table><thead><tr><th>Document</th><th>Rattachement</th><th>Classification</th><th>Taille</th><th>Date</th><th></th></tr></thead>
                  <tbody>{(data?.documents || []).filter(d => !d.archived_at).map(d => (
                    <tr key={d.id}>
                      <td><b>{d.title}</b><small className="doc-filename">{d.original_filename}</small></td>
                      <td>{d.lot_id ? 'Lot · ' + lotName(d.lot_id) : 'Produit · ' + productName(d.product_id || '')}</td>
                      <td>{d.classification === 'quality' ? 'Qualité' : 'Interne'}</td>
                      <td>{(d.byte_size / 1024).toFixed(0)} Ko</td>
                      <td>{date(d.created_at)}</td>
                      <td><button className="small" disabled={busy} onClick={() => void openDocument(d)}>Ouvrir</button>{roles.some(r => ['principal_admin','administrator'].includes(r)) && <button className="small danger" disabled={busy} onClick={() => void archiveDocument(d)}>Archiver</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {!(data?.documents || []).some(d => !d.archived_at) && <p className="empty">Aucun document actif.</p>}
              <p className="document-note"><ShieldCheck size={15} />Stockage privé. Les liens de consultation expirent après 60 secondes. Les documents publics ne sont pas encore intégrés au QR.</p>
            </section>
          )}
          {tab === 'passports' && (
            <section className="panel">
              <div className="panel-title">
                <h2>Passeports produits</h2>
                <button
                  className="icon-button"
                  onClick={() => void act(refresh)}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Version</th>
                      <th>Statut</th>
                      <th>Publication</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.passports || []).map(p => (
                      <tr key={p.id}>
                        <td>{lotName(p.lot_id)}</td>
                        <td>v{p.current_version}</td>
                        <td>{p.status}</td>
                        <td>{date(p.published_at)}</td>
                        <td className="passport-actions">
                          {p.status === 'draft' && canPublish && (
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() => void publish(p)}
                            >
                              <ClipboardCheck size={14} />
                              Publier
                            </button>
                          )}
                          {p.status === 'published' && canPublish && (
                            <>
                              <button className="small" disabled={busy} onClick={() => void publish(p)}>
                                <RefreshCw size={14} /> Actualiser le passeport
                              </button>
                              <button className="small danger" disabled={busy} onClick={() => void revokePassport(p)}>
                                <X size={14} /> Révoquer
                              </button>
                            </>
                          )}
                          {p.status === 'revoked' && canCreate && (
                            <button className="small" disabled={busy} onClick={() => void rotatePassportToken(p)}>
                              <RefreshCw size={14} /> Renouveler le QR
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data?.passports.length && (
                <p className="empty">
                  Aucun passeport. Un QR est créé à partir d’un lot libéré.
                </p>
              )}
            </section>
          )}
        </div>
      </main>
      {incidentOpen && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title"><div><p className="eyebrow">NOUVELLE DÉCLARATION</p><h2>Déclarer un incident</h2></div><button className="icon-button" type="button" onClick={() => setIncidentOpen(false)}><X size={17}/></button></div>
            <form className="form" onSubmit={createIncident}>
              <label>Périmètre<select value={incidentDraft.scope_type} onChange={e => setIncidentDraft(v => ({...v,scope_type:e.target.value,lot_id:'',product_id:'',category_id:''}))}><option value="lot">Lot de production</option><option value="product">Produit</option><option value="family">Famille de produits</option></select></label>
              {incidentDraft.scope_type === 'lot' && <label>Lot<select required value={incidentDraft.lot_id} onChange={e => setIncidentDraft(v => ({...v,lot_id:e.target.value}))}><option value="">Sélectionner un lot</option>{(data?.lots || []).map(l => <option key={l.id} value={l.id}>{l.lot_code} · {productName(l.product_id)}</option>)}</select></label>}
              {incidentDraft.scope_type === 'product' && <label>Produit<select required value={incidentDraft.product_id} onChange={e => setIncidentDraft(v => ({...v,product_id:e.target.value}))}><option value="">Sélectionner un produit</option>{(data?.products || []).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name_fr}</option>)}</select></label>}
              {incidentDraft.scope_type === 'family' && <label>Famille<select required value={incidentDraft.category_id} onChange={e => setIncidentDraft(v => ({...v,category_id:e.target.value}))}><option value="">Sélectionner une famille</option>{(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name_fr}</option>)}</select></label>}
              <label>Gravité<select value={incidentDraft.severity} onChange={e => setIncidentDraft(v => ({...v,severity:e.target.value}))}><option value="low">Faible</option><option value="medium">Modérée</option><option value="high">Élevée</option><option value="critical">Critique</option></select></label>
              <label>Titre<input required minLength={2} maxLength={160} value={incidentDraft.title} onChange={e => setIncidentDraft(v => ({...v,title:e.target.value}))} placeholder="Décrire brièvement le problème"/></label>
              <label>Description interne<textarea maxLength={5000} value={incidentDraft.internal_description} onChange={e => setIncidentDraft(v => ({...v,internal_description:e.target.value}))} placeholder="Contexte, observations, lots concernés…"/></label>
              <button className="primary wide" disabled={busy}>Enregistrer l’incident</button>
            </form>
          </section>
        </div>
      )}
      {incidentEditing && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title"><div><p className="eyebrow">DOSSIER INCIDENT</p><h2>{incidentEditing.title}</h2></div><button className="icon-button" type="button" onClick={() => setIncidentEditing(null)}><X size={17}/></button></div>
            <form className="form" onSubmit={saveIncident}>
              <label>État du dossier<select value={incidentEditDraft.status} onChange={e => setIncidentEditDraft(v => ({...v,status:e.target.value}))}><option value="open">Ouvert</option><option value="investigating">En investigation</option><option value="corrective_action">Actions correctives</option><option value="resolved">Résolu</option><option value="closed">Clôturé</option></select></label>
              <label>Cause racine<textarea maxLength={5000} value={incidentEditDraft.root_cause} onChange={e => setIncidentEditDraft(v => ({...v,root_cause:e.target.value}))}/></label>
              <label>Actions correctives<textarea maxLength={5000} value={incidentEditDraft.corrective_actions} onChange={e => setIncidentEditDraft(v => ({...v,corrective_actions:e.target.value}))}/></label>
              <button className="primary wide" disabled={busy}>Enregistrer les changements</button>
            </form>
          </section>
        </div>
      )}
      {alertIncident && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title"><div><p className="eyebrow">COMMUNICATION EXTERNE</p><h2>Préparer une alerte publique</h2></div><button className="icon-button" type="button" onClick={() => setAlertIncident(null)}><X size={17}/></button></div>
            <form className="form" onSubmit={createAlertDraft}>
              <p className="document-note"><ShieldCheck size={15}/>Seuls le titre et le résumé saisis ici pourront être communiqués au public. Les notes internes et causes racines ne sont jamais copiées automatiquement.</p>
              <label>Titre public<input required minLength={2} maxLength={160} value={alertDraft.public_title} onChange={e => setAlertDraft(v => ({...v,public_title:e.target.value}))}/></label>
              <label>Résumé public<textarea required minLength={2} maxLength={1200} value={alertDraft.public_summary} onChange={e => setAlertDraft(v => ({...v,public_summary:e.target.value}))} placeholder="Rédiger une information destinée aux clients…"/></label>
              <button className="primary wide" disabled={busy}>Créer le brouillon d’alerte</button>
            </form>
          </section>
        </div>
      )}
      {(productOpen || lotOpen) && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title">
              <h2>{productOpen ? 'Nouvelle référence' : 'Nouveau lot'}</h2>
              <button
                className="icon-button"
                onClick={() => {
                  setProductOpen(false);
                  setLotOpen(false);
                }}
              >
                <X size={17} />
              </button>
            </div>
            {productOpen && (
              <form onSubmit={createProduct} className="form">
                <label>
                  Catégorie
                  <select
                    required
                    value={product.category_id}
                    onChange={e =>
                      setProduct({ ...product, category_id: e.target.value })
                    }
                  >
                    <option value="">Choisir</option>
                    {data?.categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name_fr}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two">
                  <label>
                    Code
                    <input
                      required
                      value={product.code}
                      onChange={e =>
                        setProduct({
                          ...product,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="BA-WA-001"
                    />
                  </label>
                  <label>
                    Nom français
                    <input
                      required
                      value={product.name_fr}
                      onChange={e =>
                        setProduct({ ...product, name_fr: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Description interne
                  <textarea
                    value={product.internal_description}
                    onChange={e =>
                      setProduct({
                        ...product,
                        internal_description: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="public-box">
                  <b>
                    <ShieldCheck size={15} /> Informations publiques du
                    passeport
                  </b>
                  <label>
                    Description publique
                    <textarea
                      maxLength={1500}
                      value={product.public_description_fr}
                      onChange={e =>
                        setProduct({
                          ...product,
                          public_description_fr: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Conseils d’utilisation
                    <textarea
                      maxLength={2500}
                      value={product.public_usage_fr}
                      onChange={e =>
                        setProduct({
                          ...product,
                          public_usage_fr: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <button className="primary wide" disabled={busy}>
                  Créer la référence
                </button>
              </form>
            )}
            {lotOpen && (
              <form onSubmit={createLot} className="form">
                <label>
                  Produit
                  <select
                    required
                    value={lot.product_id}
                    onChange={e =>
                      setLot({ ...lot, product_id: e.target.value })
                    }
                  >
                    <option value="">Choisir</option>
                    {data?.products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name_fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Code du lot
                  <input
                    required
                    value={lot.lot_code}
                    onChange={e =>
                      setLot({ ...lot, lot_code: e.target.value.toUpperCase() })
                    }
                    placeholder="LOT-2026-001"
                  />
                </label>
                <div className="two">
                  <label>
                    Fabrication
                    <input
                      type="date"
                      value={lot.manufactured_on}
                      onChange={e =>
                        setLot({ ...lot, manufactured_on: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Expiration
                    <input
                      type="date"
                      value={lot.expires_on}
                      onChange={e =>
                        setLot({ ...lot, expires_on: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="two">
                  <label>
                    Quantité
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={lot.quantity}
                      onChange={e =>
                        setLot({ ...lot, quantity: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Unité
                    <input
                      value={lot.quantity_unit}
                      onChange={e =>
                        setLot({ ...lot, quantity_unit: e.target.value })
                      }
                      placeholder="pièces, kg, L"
                    />
                  </label>
                </div>
                <label>
                  Note interne
                  <textarea
                    value={lot.internal_notes}
                    onChange={e =>
                      setLot({ ...lot, internal_notes: e.target.value })
                    }
                  />
                </label>
                <button className="primary wide" disabled={busy}>
                  Créer le lot
                </button>
              </form>
            )}
          </section>
        </div>
      )}
      {qualityLot && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title"><div><p className="eyebrow">CONTRÔLE QUALITÉ</p><h2>{qualityLot.lot_code}</h2></div><button className="icon-button" type="button" onClick={() => setQualityLot(null)}><X size={17} /></button></div>
            <form className="form" onSubmit={saveQualityCheck}>
              <label>Type de contrôle<input required minLength={2} maxLength={120} value={qualityDraft.check_type} onChange={e => setQualityDraft(v => ({ ...v, check_type: e.target.value }))} placeholder="Identité, aspect, pH, humidité…" /></label>
              <label>Résultat<select value={qualityDraft.result} onChange={e => setQualityDraft(v => ({ ...v, result: e.target.value }))}><option value="pass">Conforme — pass</option><option value="fail">Non conforme — fail</option><option value="pending">En attente — pending</option><option value="inconclusive">Non concluant — inconclusive</option></select></label>
              <label>Note interne (facultative)<textarea maxLength={1200} value={qualityDraft.internal_notes} onChange={e => setQualityDraft(v => ({ ...v, internal_notes: e.target.value }))} placeholder="Observations, valeur mesurée, méthode…" /></label>
              <p className="document-note"><ShieldCheck size={15} />La revue doit être réalisée par une autre personne. Un résultat non conforme ou non revu bloque la libération.</p>
              <button className="primary wide" disabled={busy}>Enregistrer le contrôle</button>
            </form>
          </section>
        </div>
      )}
      {transitionDraft && (
        <div className="overlay">
          <section className="modal">
            <div className="panel-title"><div><p className="eyebrow">JUSTIFICATION OBLIGATOIRE</p><h2>{transitionDraft.new_status === 'investigation' ? 'Ouvrir une enquête' : 'Placer sous surveillance'}</h2></div><button className="icon-button" type="button" onClick={() => setTransitionDraft(null)}><X size={17} /></button></div>
            <form className="form" onSubmit={saveTransition}>
              <p className="muted">Lot : {transitionDraft.lot.lot_code}. Le motif sera conservé dans la traçabilité interne.</p>
              <label>Motif<textarea required minLength={3} maxLength={1200} value={transitionDraft.reason} onChange={e => setTransitionDraft(v => v ? ({ ...v, reason: e.target.value }) : v)} placeholder="Décrire le motif de cette transition…" /></label>
              <button className="primary wide" disabled={busy || transitionDraft.reason.trim().length < 3}>Confirmer la transition</button>
            </form>
          </section>
        </div>
      )}
      {qr && (
        <div className="overlay">
          <section className="modal qr-modal">
            <div className="panel-title">
              <h2>QR · {qr.lot}</h2>
              <button className="icon-button" onClick={() => setQr(null)}>
                <X size={17} />
              </button>
            </div>
            <img src={qr.image} alt="QR code du passeport" />
            <p>
              Le jeton brut ne sera plus affiché après fermeture. Enregistre ce
              QR maintenant.
            </p>
            <button
              className="primary wide"
              onClick={() => {
                const a = document.createElement('a');
                a.href = qr.image;
                a.download = 'BA-Labs-QR-' + qr.lot + '.png';
                a.click();
              }}
            >
              Télécharger le QR
            </button>
            <button
              className="secondary wide"
              onClick={() => void navigator.clipboard.writeText(qr.url)}
            >
              Copier le lien
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
