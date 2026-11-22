/**
 * BA Labs Fractal Growth Model — experimental geometry, renderer-independent.
 * Reserves a parent's complete angular fan using descendant-leaf weights
 * before placing any child. Outputs curved branch Beziers and natural leaves.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = value => {
  let h = 2166136261;
  for (const ch of String(value ?? "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const noise = value => hash(value) / 0xffffffff;
const childrenOf = node => Array.isArray(node?.children) ? node.children : [];
const pt = (x, y) => ({ x: +x.toFixed(3), y: +y.toFixed(3) });

/**
 * @param {{id:string,title?:string,children?:Array}} root
 * @param {{originX?:number,originY?:number,heading?:number,fanAngle?:number,
 * childFanAngle?:number,baseLength?:number,lengthDecay?:number,curvature?:number}} options
 */
export function createFractalGrowthModel(root, options = {}) {
  if (!root?.id) throw new TypeError("Root node must have a stable id.");
  const cfg = {
    originX: 0, originY: 0, heading: -Math.PI / 2,
    fanAngle: Math.PI * 0.92, childFanAngle: Math.PI * 0.78,
    baseLength: 148, lengthDecay: 0.76, curvature: 0.19,
    minimumLength: 18, ...options
  };
  const leafCounts = new Map();
  const leafCount = node => {
    if (leafCounts.has(node)) return leafCounts.get(node);
    const kids = childrenOf(node);
    const value = kids.length ? kids.reduce((sum, child) => sum + leafCount(child), 0) : 1;
    leafCounts.set(node, value);
    return value;
  };
  const branches = [], junctions = [], terminals = [], coords = [];
  const origin = {
    id: root.id, title: root.title || "", x: cfg.originX, y: cfg.originY,
    depth: 0, descendantCount: leafCount(root), kind: "origin"
  };
  junctions.push(origin); coords.push(origin);

  function grow(node, start, depth, heading, sectorStart, sectorEnd) {
    const kids = childrenOf(node);
    if (!kids.length) {
      terminals.push({ id: node.id, title: node.title || "", ...start, depth, kind: "terminal" });
      return;
    }
    const weights = kids.map(leafCount);
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = sectorStart;

    kids.forEach((child, index) => {
      const weight = weights[index];
      const share = (sectorEnd - sectorStart) * weight / total;
      const slotStart = cursor, slotEnd = cursor + share;
      cursor = slotEnd;
      const slotCenter = (slotStart + slotEnd) / 2;
      const angle = slotCenter + (noise(child.id) - 0.5) * Math.min(0.12, share * 0.1);
      const turn = clamp(angle - heading, -Math.PI * 0.82, Math.PI * 0.82);
      const length = Math.max(cfg.minimumLength,
        cfg.baseLength * Math.pow(cfg.lengthDecay, depth) * clamp(Math.sqrt(weight), 0.82, 1.48));
      const end = pt(start.x + Math.cos(angle) * length, start.y + Math.sin(angle) * length);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const sign = noise(child.id + ":curve") > 0.5 ? 1 : -1;
      const bend = length * cfg.curvature * clamp(turn / 0.9, -1.2, 1.2) + sign * length * 0.035;
      const dx = end.x - start.x, dy = end.y - start.y;
      const control1 = pt(start.x + dx * 0.34 + nx * bend * 0.25,
        start.y + dy * 0.34 + ny * bend * 0.25);
      const control2 = pt(end.x - dx * 0.32 + nx * bend,
        end.y - dy * 0.32 + ny * bend);
      const childKids = childrenOf(child);
      const junction = {
        id: child.id, title: child.title || "", ...end, depth: depth + 1,
        descendantCount: weight, parentId: node.id,
        kind: childKids.length ? "junction" : "terminal",
        reservedSector: [slotStart, slotEnd]
      };
      branches.push({
        id: child.id, parentId: node.id, title: child.title || "",
        depth: depth + 1, start: pt(start.x, start.y), control1, control2, end,
        angle, angleDelta: turn, curvature: bend, descendantCount: weight,
        reservedSector: [slotStart, slotEnd], childCount: childKids.length
      });
      junctions.push(junction); coords.push(junction);
      if (childKids.length) {
        const fan = Math.min(cfg.childFanAngle, Math.max(0.12, slotEnd - slotStart));
        grow(child, end, depth + 1, angle, angle - fan / 2, angle + fan / 2);
      } else {
        terminals.push({
          id: child.id, title: child.title || "", ...end,
          depth: depth + 1, kind: "terminal", parentId: node.id
        });
      }
    });
  }

  const halfFan = cfg.fanAngle / 2;
  grow(root, pt(origin.x, origin.y), 0, cfg.heading,
    cfg.heading - halfFan, cfg.heading + halfFan);
  const xs = coords.map(p => p.x), ys = coords.map(p => p.y);
  return {
    origin, branches, junctions, terminals,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    stats: {
      branchCount: branches.length,
      junctionCount: junctions.filter(n => n.kind === "junction").length,
      terminalCount: terminals.length,
      maxDepth: Math.max(0, ...branches.map(b => b.depth)),
      reservedBeforeDrawing: true
    }
  };
}
