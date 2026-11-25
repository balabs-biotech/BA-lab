import { useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpRight, BadgeCheck, Beaker, Box, Boxes,
  CalendarDays, Check, ChevronRight, CircleAlert, ClipboardCheck,
  FileText, FlaskConical, LockKeyhole, PackageCheck, QrCode, Search,
  ShieldCheck, Sparkles, X
} from 'lucide-react';
import './demo.css';

type View = 'overview' | 'products' | 'lots' | 'incidents' | 'passport';

const products = [
  { code: 'BA-MY-001', name: 'Pleurotus ostreatus — blanc', category: 'Mycologie', status: 'Actif', detail: 'Souche de référence · culture sur substrat lignocellulosique', lots: 3 },
  { code: 'BA-BS-002', name: 'Trichoderma — consortium', category: 'Biostimulation', status: 'Actif', detail: 'Consortium fongique · formulation expérimentale', lots: 2 },
  { code: 'BA-LB-003', name: 'Gélose nutritive BA', category: 'Laboratoire', status: 'Brouillon', detail: 'Milieu de culture préparé en interne', lots: 1 },
];

const lots = [
  { code: 'LOT-2026-014', product: 'Pleurotus ostreatus — blanc', date: '12.11.2026', state: 'Libéré', quality: '3/3 contrôles revus', tone: 'good' },
  { code: 'LOT-2026-015', product: 'Trichoderma — consortium', date: '14.11.2026', state: 'Contrôle qualité', quality: '2/3 contrôles réalisés', tone: 'warn' },
  { code: 'LOT-2026-016', product: 'Gélose nutritive BA', date: '16.11.2026', state: 'En production', quality: 'Contrôles non démarrés', tone: 'neutral' },
];

const nav = [
  { id: 'overview' as const, label: 'Vue d’ensemble', icon: Activity },
  { id: 'products' as const, label: 'Références produits', icon: Box },
  { id: 'lots' as const, label: 'Lots & qualité', icon: Boxes },
  { id: 'incidents' as const, label: 'Incidents & alertes', icon: CircleAlert },
];

export default function Demo() {
  const [view, setView] = useState<View>('overview');
  const [selectedProduct, setSelectedProduct] = useState(products[0]);
  const [selectedLot, setSelectedLot] = useState(lots[0]);
  const [query, setQuery] = useState('');

  if (view === 'passport') {
    return (
      <main className="pp-demo public-demo">
        <div className="pp-demo-ribbon"><Sparkles size={14} /> APERÇU CLIENT · DONNÉES FICTIVES</div>
        <header className="pp-public-head"><div className="pp-mark">BA</div><div><b>BA LABS</b><small>PASSEPORT PRODUIT</small></div><span className="pp-verified"><BadgeCheck size={15}/> VÉRIFIÉ</span></header>
        <article className="pp-public-card">
          <div className="pp-public-kicker">PASSEPORT PRODUIT · EXEMPLE</div>
          <div className="pp-public-icon"><PackageCheck size={25}/></div>
          <p className="pp-label">PRODUIT</p>
          <h1>Pleurotus ostreatus — blanc</h1>
          <p className="pp-subtitle">BA-MY-001 · Mycologie</p>
          <div className="pp-public-grid">
            <div><small>LOT</small><b>LOT-2026-014</b></div>
            <div><small>FABRICATION</small><b>12.11.2026</b></div>
            <div><small>STATUT</small><b className="pp-good-text">Lot libéré</b></div>
            <div><small>VERSION</small><b>01</b></div>
          </div>
          <section><h3>Description</h3><p>Souche de Pleurotus ostreatus destinée à la culture sur substrat lignocellulosique. Cette fiche illustre les informations publiques validées par BA Labs.</p></section>
          <section><h3>Conseils d’utilisation</h3><p>Respecter les conditions de conservation et les recommandations techniques fournies avec le produit.</p></section>
          <div className="pp-public-proof"><ShieldCheck size={17}/><span><b>Informations publiques contrôlées</b><small>Les données internes et documents qualité restent confidentiels.</small></span></div>
          <footer>BA Labs · Sétif, Algérie</footer>
        </article>
        <button className="pp-back" onClick={() => setView('overview')}><ArrowLeft size={16}/> Retour à la démonstration</button>
        <p className="pp-demo-foot">Exemple fictif — aucun lot réel ni aucune donnée client ne sont exposés.</p>
      </main>
    );
  }

  const filtered = products.filter(p => (p.code + ' ' + p.name + ' ' + p.category).toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="pp-demo">
      <div className="pp-demo-ribbon"><Sparkles size={14}/> MODE DÉMONSTRATION · DONNÉES FICTIVES · AUCUNE ÉCRITURE EN BASE</div>
      <div className="pp-layout">
        <aside className="pp-sidebar">
          <div className="pp-brand"><div className="pp-mark">BA</div><span><b>BA LABS</b><small>PRODUCT PASSPORT</small></span></div>
          <div className="pp-side-caption">ESPACE DE TRAVAIL</div>
          <nav>{nav.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><Icon size={17}/>{item.label}<ChevronRight size={14}/></button>;
          })}</nav>
          <div className="pp-side-bottom"><div className="pp-safe"><ShieldCheck size={17}/><span><b>Architecture cloisonnée</b><small>Démo isolée des données réelles</small></span></div><div className="pp-demo-user"><div className="pp-avatar">BA</div><span><b>Visiteur</b><small>Accès découverte · lecture seule</small></span></div></div>
        </aside>
        <section className="pp-main">
          <header className="pp-topbar"><span>BA LABS <i>/</i> PRODUCT PASSPORT <i>/</i> DÉMONSTRATION</span><span className="pp-online"><span/> ENVIRONNEMENT DE PRÉSENTATION</span></header>
          <div className="pp-content">
            <div className="pp-heading"><div><p className="pp-eyebrow">CONSOLE DE TRAÇABILITÉ</p><h1>{view === 'overview' ? 'Vue d’ensemble' : view === 'products' ? 'Références produits' : view === 'incidents' ? 'Incidents & alertes' : 'Lots & qualité'}</h1><p>Parcours de démonstration du cycle de vie d’un produit BA Labs.</p></div><span className="pp-readonly"><LockKeyhole size={14}/> LECTURE SEULE</span></div>
            {view === 'overview' && <>
              <div className="pp-metrics">
                <div><span>Références</span><strong>03</strong><small>Produits enregistrés</small><Box size={18}/></div>
                <div><span>Lots suivis</span><strong>06</strong><small>Exemple de traçabilité</small><Boxes size={18}/></div>
                <div><span>Lots libérés</span><strong>02</strong><small>Contrôles validés</small><BadgeCheck size={18}/></div>
                <div className="accent"><span>Passeports QR</span><strong>01</strong><small>Exemple publié</small><QrCode size={18}/></div>
              </div>
              <div className="pp-section-grid">
                <section className="pp-panel pp-flow"><div className="pp-panel-head"><div><p className="pp-eyebrow">CYCLE DE VIE</p><h2>Du produit au passeport</h2></div><span className="pp-chip">PROCESSUS</span></div>
                  <div className="pp-steps">
                    <div className="done"><span><Check size={15}/></span><div><b>Référence produit</b><small>Identité, catégorie et informations publiques</small></div><em>01</em></div>
                    <div className="done"><span><Check size={15}/></span><div><b>Enregistrement du lot</b><small>Code, fabrication, quantité et historique</small></div><em>02</em></div>
                    <div className="done"><span><Check size={15}/></span><div><b>Contrôles qualité</b><small>Résultats documentés et revue indépendante</small></div><em>03</em></div>
                    <div className="current"><span><ClipboardCheck size={15}/></span><div><b>Libération qualité</b><small>Décision contrôlée avant publication</small></div><em>04</em></div>
                    <div><span><QrCode size={15}/></span><div><b>Passeport QR public</b><small>Instantané validé, révocable et consultable</small></div><em>05</em></div>
                  </div>
                </section>
                <section className="pp-panel"><div className="pp-panel-head"><div><p className="pp-eyebrow">À EXPLORER</p><h2>Accès rapide</h2></div><Sparkles size={18}/></div>
                  <button className="pp-action-row" onClick={() => setView('products')}><span className="pp-action-icon"><Box size={18}/></span><span><b>Catalogue de références</b><small>Identité et fiche publique de chaque produit</small></span><ArrowUpRight size={16}/></button>
                  <button className="pp-action-row" onClick={() => setView('lots')}><span className="pp-action-icon"><FlaskConical size={18}/></span><span><b>Suivi des lots</b><small>États de production et contrôles qualité</small></span><ArrowUpRight size={16}/></button>
                  <button className="pp-action-row" onClick={() => setView('passport')}><span className="pp-action-icon"><QrCode size={18}/></span><span><b>Voir le passeport client</b><small>Ce que le client découvre après scan QR</small></span><ArrowUpRight size={16}/></button>
                </section>
              </div>
              <section className="pp-panel pp-recent"><div className="pp-panel-head"><div><p className="pp-eyebrow">SUIVI OPÉRATIONNEL</p><h2>Derniers lots</h2></div><button className="pp-text-btn" onClick={() => setView('lots')}>Voir les lots <ArrowUpRight size={14}/></button></div><LotRows onSelect={lot => {setSelectedLot(lot); setView('lots');}}/></section>
            </>}
            {view === 'products' && <section className="pp-panel"><div className="pp-panel-head"><div><p className="pp-eyebrow">RÉFÉRENTIEL INTERNE</p><h2>Catalogue produits</h2><p>Les données ci-dessous sont fictives et servent uniquement à illustrer l’interface.</p></div><span className="pp-chip">03 RÉFÉRENCES</span></div><div className="pp-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une référence ou un produit…"/></div><div className="pp-product-list">{filtered.map(p => <button key={p.code} className={'pp-product-card ' + (selectedProduct.code === p.code ? 'selected' : '')} onClick={() => setSelectedProduct(p)}><span className="pp-product-icon"><Beaker size={19}/></span><span className="pp-product-info"><small>{p.code} · {p.category}</small><b>{p.name}</b><em>{p.detail}</em></span><span className="pp-product-count">{p.lots} lots</span><ChevronRight size={16}/></button>)}</div><div className="pp-selected"><div><p className="pp-eyebrow">FICHE RÉFÉRENCE SÉLECTIONNÉE</p><h3>{selectedProduct.name}</h3><p>{selectedProduct.detail}</p></div><span className="pp-status good">{selectedProduct.status}</span></div></section>}
            {view === 'lots' && <section className="pp-panel"><div className="pp-panel-head"><div><p className="pp-eyebrow">TRAÇABILITÉ DE PRODUCTION</p><h2>Lots et contrôles qualité</h2><p>Les statuts illustrent les étapes possibles du cycle qualité.</p></div><span className="pp-chip">03 EXEMPLES</span></div><LotRows onSelect={lot => setSelectedLot(lot)}/><div className="pp-lot-detail"><div><p className="pp-eyebrow">LOT SÉLECTIONNÉ</p><h3>{selectedLot.code}</h3><p>{selectedLot.product}</p></div><span className={'pp-status ' + selectedLot.tone}>{selectedLot.state}</span><div className="pp-quality-note"><ClipboardCheck size={17}/><span><b>{selectedLot.quality}</b><small>La libération exige des contrôles conformes et une revue indépendante.</small></span></div></div></section>}
            {view === 'incidents' && <div className="pp-section-grid">
              <section className="pp-panel">
                <div className="pp-panel-head"><div><p className="pp-eyebrow">JOURNAL QUALITÉ · EXEMPLE</p><h2>Incident enregistré</h2></div><span className="pp-status warn">ÉLEVÉ</span></div>
                <div className="pp-incident-demo">
                  <p className="pp-eyebrow">INC-2026-004 · LOT-2026-015</p>
                  <h3>Écart de contrôle sur le lot Trichoderma</h3>
                  <p>Exemple fictif d’un résultat de contrôle nécessitant une investigation avant toute libération.</p>
                  <div className="pp-incident-state"><span className="pp-status warn">En investigation</span><span className="pp-status neutral">Interne uniquement</span></div>
                  <div className="pp-quality-note"><ShieldCheck size={17}/><span><b>Analyse de cause racine</b><small>Conservée dans le dossier interne et jamais exposée au client.</small></span></div>
                </div>
              </section>
              <section className="pp-panel">
                <div className="pp-panel-head"><div><p className="pp-eyebrow">COMMUNICATION CLIENT</p><h2>Alerte publique</h2></div><span className="pp-status good">PUBLIÉE</span></div>
                <div className="pp-incident-demo">
                  <p className="pp-eyebrow">ALERTE · VERSION PUBLIQUE</p>
                  <h3>Information importante sur un lot</h3>
                  <p>BA Labs informe ses clients qu’une vérification complémentaire est en cours sur un lot identifié. Les clients concernés doivent suivre les instructions communiquées avec leur produit.</p>
                  <div className="pp-public-proof"><ShieldCheck size={17}/><span><b>Contenu approuvé</b><small>Seuls le titre et le résumé validés sont transmis au passeport public.</small></span></div>
                </div>
              </section>
              <section className="pp-panel pp-flow">
                <div className="pp-panel-head"><div><p className="pp-eyebrow">CIRCUIT DE VALIDATION</p><h2>De l'incident à l'information client</h2></div><span className="pp-chip">PROCESSUS</span></div>
                <div className="pp-steps">
                  <div className="done"><span><Check size={15}/></span><div><b>Déclaration interne</b><small>Lot, produit ou famille concernés</small></div><em>01</em></div>
                  <div className="done"><span><Check size={15}/></span><div><b>Investigation</b><small>Cause racine et actions correctives</small></div><em>02</em></div>
                  <div className="current"><span><ClipboardCheck size={15}/></span><div><b>Approbation de l'alerte</b><small>Relecture avant diffusion</small></div><em>03</em></div>
                  <div><span><QrCode size={15}/></span><div><b>Mise à jour du passeport</b><small>Nouvelle version du même QR</small></div><em>04</em></div>
                </div>
              </section>
            </div>}
            <div className="pp-footer-note"><ShieldCheck size={16}/><span><b>Démo isolée.</b> Aucun accès à la base de production, au catalogue réel ou aux dossiers clients. Les créations et modifications sont désactivées.</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LotRows({ onSelect }: { onSelect: (lot: typeof lots[number]) => void }) {
  return <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>LOT</th><th>PRODUIT</th><th>FABRICATION</th><th>ÉTAT</th><th></th></tr></thead><tbody>{lots.map(lot => <tr key={lot.code} onClick={() => onSelect(lot)}><td><b>{lot.code}</b></td><td>{lot.product}</td><td>{lot.date}</td><td><span className={'pp-status ' + lot.tone}>{lot.state}</span></td><td><ChevronRight size={15}/></td></tr>)}</tbody></table></div>;
}
