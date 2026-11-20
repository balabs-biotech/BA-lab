import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expectedLanguages = ['fr', 'ar', 'en', 'pt'];
const expectedDomainIds = ['myco', 'bio', 'soil', 'iot', 'lab', 'products', 'work', 'evidence'];

for (const language of expectedLanguages) {
  const path = new URL('../ecosystem/notion-tree.' + language + '.json', import.meta.url);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(manifest.version, 5, language + ': unsupported manifest version');
  assert.equal(manifest.relationModel, 'notion-crosslinks-and-documented-topics-v1', language + ': relation model marker missing');
  assert.equal(manifest.language, language, language + ': language marker mismatch');
  assert.ok(Array.isArray(manifest.domains), language + ': domains must be an array');
  assert.deepEqual(
    [...manifest.domains.map((domain) => domain.id)].sort(),
    [...expectedDomainIds].sort(),
    language + ': public domain roots must remain aligned across languages',
  );

  const ids = new Set();
  const urls = new Set();
  const references = [];
  let nodeCount = 0;
  const visit = (node, parentPath = language) => {
    nodeCount += 1;
    const trail = parentPath + ' > ' + (node.title || node.id || '(untitled)');
    assert.ok(typeof node.id === 'string' && node.id.trim(), trail + ': missing stable id');
    assert.ok(!ids.has(node.id), trail + ': duplicate node id ' + node.id);
    ids.add(node.id);
    assert.ok(typeof node.title === 'string' && node.title.trim(), trail + ': missing localized title');
    if (node.kind === 'section') {
      assert.ok(!node.url && !node.notionId, trail + ': a heading-derived section must not invent a Notion page destination');
      assert.ok((node.children || []).length > 0, trail + ': a heading-derived section must contain verified Notion pages');
    } else if (node.kind === 'label') {
      assert.ok(!node.url && !node.notionId && !(node.children || []).length, trail + ': a non-navigable topic label must not invent a Notion page destination');
    } else if (node.kind === 'reference') {
      assert.match(node.url || '', /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/, trail + ': invalid cross-universe Notion reference URL');
      assert.equal(node.url, 'https://app.notion.com/p/' + node.notionId, trail + ': reference URL and page ID must match');
      references.push({ url: node.url, trail });
    } else {
      assert.match(node.url || '', /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/, trail + ': invalid public Notion URL');
      assert.equal(node.url, 'https://app.notion.com/p/' + node.notionId, trail + ': Notion URL and page ID must match');
      assert.ok(!urls.has(node.url), trail + ': duplicate Notion URL ' + node.url);
      urls.add(node.url);
    }
    const children = node.children ?? [];
    assert.ok(Array.isArray(children), trail + ': children must be an array when present');
    for (const child of children) visit(child, trail);
  };

  const rootIds = new Set(manifest.domains.map((domain) => domain.id));
  let relationCount = 0;
  let contentRelationCount = 0;
  for (const root of manifest.domains) {
    assert.ok(Array.isArray(root.relations), language + ': every universe root must expose its verified relation list');
    for (const relation of root.relations) {
      assert.ok(rootIds.has(relation.target), language + ': relation target must be a real universe root');
      assert.ok(typeof relation.label === 'string' && relation.label.trim(), language + ': relation label is required');
      assert.ok(typeof relation.evidence === 'string' && relation.evidence.trim(), language + ': relation evidence is required');
      assert.ok(['notion-link', 'page-content'].includes(relation.basis), language + ': relation basis must distinguish explicit Notion links from documented topics');
      relationCount += 1;
      if (relation.basis === 'page-content') contentRelationCount += 1;
    }
  }
  assert.ok(relationCount >= 10, language + ': too few documented cross-universe relationships');
  assert.ok(contentRelationCount >= 4, language + ': Batch Tracker and Technosoil content links must be represented');
  assert.ok(manifest.domains.find((domain) => domain.id === 'soil').relations.some((relation) => relation.target === 'lab' && relation.label.toLowerCase().includes('technosoil')), language + ': Technosoil must connect agrotechnology to plant experimentation');

  const evidence = manifest.domains.find((domain) => domain.id === 'evidence');
  assert.ok(evidence?.notionId && evidence.url === 'https://app.notion.com/p/' + evidence.notionId, language + ': evidence universe must link to its real Notion page');
  for (const domain of manifest.domains) visit(domain);
  for (const reference of references) assert.ok(urls.has(reference.url), reference.trail + ': cross-universe reference must point to a canonical mapped page');
  assert.ok(nodeCount >= 100, language + ': the manifest must retain the complete mapped Notion hierarchy');
  const productSections = manifest.domains.find((domain) => domain.id === 'products').children.filter((node) => node.kind === 'section');
  assert.equal(productSections.length, 4, language + ': product-page headings must remain represented as four non-clickable grouping sections');
  console.log(language + ': ' + manifest.domains.length + ' public roots, ' + nodeCount + ' mapped nodes — valid');
}
