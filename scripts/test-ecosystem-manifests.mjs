import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const languages = ['fr', 'en', 'ar', 'pt'];
const universeIds = ['microbiology', 'plants', 'ecology', 'bioprocesses', 'biomaterials', 'instrumentation', 'digital', 'physical'];
const expectedRoots = {
  fr: ['41f73152f171818ea68cf2ed99aa3706','41f73152f1718161af13d1fbe52250de','41f73152f171819f9b7acbd64ccf4a3e','41f73152f1718108ac67e06204a60c7f','41f73152f1718117a38df4afe2d4fb9d','41f73152f1718170ba14e91650b0c806','41f73152f171816e8f0ed9e629fb70fe','41f73152f1718142aaf0d01bba51ecfb'],
  en: ['41f73152f17181129686ced284bc5de8','41f73152f17181d99104ca04dd66d0b5','41f73152f17181edaa7fe423fe6efa68','41f73152f1718104a3d5e5863fd10a58','41f73152f1718122992cc99b0609aab3','41f73152f17181b1a27ce32ef73cb66b','41f73152f1718127a894c85bc7af01af','41f73152f17181358e32ce72c1846326'],
  ar: ['41f73152f1718186b79bdea4ce892562','41f73152f171815fa5a1f577763e545d','41f73152f171819bb147da5152914bf2','41f73152f171815db156c978c9e23179','41f73152f1718192b9aedbaa5e027402','41f73152f17181dd81c9cfe38d9845d6','41f73152f17181418684e3445718a489','41f73152f171812aad13dc593fa7ba60'],
  pt: ['41f73152f17181edb2cee71226bc9b95','41f73152f1718151b56bf6ad98617c22','41f73152f17181658b77c14bcbff5940','41f73152f17181488f9eff06d48d9379','41f73152f17181babafbd221031866b4','41f73152f17181049050c327f2b0df92','41f73152f17181a1aba9d5b91d32a153','41f73152f1718146a959f08cd87ea17b'],
};

for (const language of languages) {
  const manifest = JSON.parse(await readFile(new URL('../ecosystem/notion-tree.' + language + '.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, 2, language + ': unsupported public-universe manifest version');
  assert.equal(manifest.language, language, language + ': language marker mismatch');
  assert.equal(manifest.universeModel, 'eight-scientific-domains', language + ': universe model marker missing');
  assert.deepEqual(manifest.domains.map(domain => domain.id), universeIds, language + ': universe roots/order mismatch');
  assert.deepEqual(manifest.domains.map(domain => domain.notionId), expectedRoots[language], language + ': roots must match the public Notion portal IDs');

  const nodes = [];
  const visit = list => (list || []).forEach(node => { nodes.push(node); visit(node.children); });
  visit(manifest.domains);
  assert.ok(nodes.length >= 100, language + ': mapped hierarchy is unexpectedly shallow');

  const ids = new Set();
  const canonical = new Set();
  for (const node of nodes) {
    assert.ok(node.id && !ids.has(node.id), language + ': missing or duplicate node id ' + node.id);
    ids.add(node.id);
    assert.ok(typeof node.title === 'string' && node.title.trim(), language + ': missing localized title');
    if (node.kind === 'label') {
      assert.ok(!node.url && !node.notionId && !(node.children || []).length, language + ': labels must not invent Notion destinations');
      continue;
    }
    assert.match(node.url || '', /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/, language + ': invalid Notion destination at ' + node.id);
    assert.equal(node.url, 'https://app.notion.com/p/' + node.notionId, language + ': URL/Notion ID mismatch at ' + node.id);
    if (node.kind !== 'reference') {
      assert.ok(!canonical.has(node.notionId), language + ': duplicate canonical Notion page ' + node.notionId);
      canonical.add(node.notionId);
    }
  }
  const rootIds = new Set(universeIds);
  const relations = manifest.domains.flatMap(domain => domain.relations || []);
  assert.ok(relations.length >= 8, language + ': too few evidence-backed inter-universe relations');
  for (const domain of manifest.domains) {
    assert.ok((domain.children || []).length > 0, language + ': empty universe ' + domain.id);
    for (const relation of domain.relations || []) {
      assert.ok(rootIds.has(relation.target), language + ': relation target is not a universe');
      assert.ok(relation.label && relation.evidence && relation.basis === 'notion-link', language + ': relation lacks Notion evidence');
    }
  }
  for (const node of nodes.filter(node => node.kind === 'reference')) {
    assert.ok(canonical.has(node.notionId), language + ': reference has no canonical page ' + node.notionId);
  }
  console.log(language + ': ' + manifest.domains.length + ' universes, ' + nodes.length + ' nodes, ' + canonical.size + ' canonical Notion pages — valid');
}
