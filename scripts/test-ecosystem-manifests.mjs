import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expectedLanguages = ['fr', 'ar', 'en', 'pt'];
const expectedDomainIds = ['myco', 'bio', 'soil', 'iot', 'lab', 'products', 'work', 'learn'];

for (const language of expectedLanguages) {
  const path = new URL('../ecosystem/notion-tree.' + language + '.json', import.meta.url);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(manifest.version, 1, language + ': unsupported manifest version');
  assert.equal(manifest.language, language, language + ': language marker mismatch');
  assert.ok(Array.isArray(manifest.domains), language + ': domains must be an array');
  assert.deepEqual(
    [...manifest.domains.map((domain) => domain.id)].sort(),
    [...expectedDomainIds].sort(),
    language + ': public domain roots must remain aligned across languages',
  );

  const ids = new Set();
  const urls = new Set();
  let nodeCount = 0;
  const visit = (node, parentPath = language) => {
    nodeCount += 1;
    const trail = parentPath + ' > ' + (node.title || node.id || '(untitled)');
    assert.ok(typeof node.id === 'string' && node.id.trim(), trail + ': missing stable id');
    assert.ok(!ids.has(node.id), trail + ': duplicate node id ' + node.id);
    ids.add(node.id);
    assert.ok(typeof node.title === 'string' && node.title.trim(), trail + ': missing localized title');
    if (node.status === 'planned') {
      assert.equal(node.id, 'learn', trail + ': only the planned knowledge-transfer universe may omit a Notion page');
      assert.ok(!node.url && !node.notionId, trail + ': planned placeholder must not invent a Notion destination');
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

  for (const domain of manifest.domains) visit(domain);
  console.log(language + ': ' + manifest.domains.length + ' public roots, ' + nodeCount + ' linked pages — valid');
}
