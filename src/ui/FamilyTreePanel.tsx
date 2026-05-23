import { useMemo } from "react";
import type { World } from "../sim/World";
import type { NPC } from "../sim/types";

/**
 * Family Tree panel — visualises the kingdom's genealogy as a tree.
 *
 * - Married couples appear as connected boxes (a horizontal pair line).
 * - Their children are drawn beneath them with vertical lines descending.
 * - The current monarch is highlighted with a crown icon and gold border.
 * - The named heir apparent (if any) gets a small marker.
 * - Deceased NPCs would be drawn greyed out, but since deceased NPCs are
 *   removed from world.npcs entirely we only show the living tree.
 *
 * Clicking a node opens that NPC's profile panel.
 */

interface TreeNode {
  npc: NPC;
  partner?: NPC;
  children: TreeNode[];
  /** Computed during layout. */
  x: number;
  y: number;
  width: number;
}

const NODE_W = 84;
const NODE_H = 36;
const NODE_GAP_X = 14;
const NODE_GAP_Y = 24;

export function FamilyTreePanel({
  open,
  onClose,
  getWorld,
  onSelectNpc,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
  onSelectNpc?: (npcId: string) => void;
}) {
  const tree = useMemo(() => {
    if (!open) return null;
    const w = getWorld();
    if (!w) return null;
    return buildTree(w);
  }, [open, getWorld]);

  if (!open) return null;

  return (
    <aside
      className="family-tree-panel"
      role="dialog"
      aria-label="Family tree"
    >
      <div className="family-tree-header">
        <span>Family Tree</span>
        <div>
          <button onClick={onClose} title="Close" aria-label="Close family tree">×</button>
        </div>
      </div>
      <div className="family-tree-body">
        {!tree || tree.roots.length === 0 ? (
          <p className="family-tree-empty">
            The dynasty is too young — no living family lines have formed yet.
            As villagers marry and have children, the tree will grow here.
          </p>
        ) : (
          <svg
            width={tree.totalWidth}
            height={tree.totalHeight}
            viewBox={`0 0 ${tree.totalWidth} ${tree.totalHeight}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            {tree.connections.map((c, i) => (
              <path
                key={i}
                d={c}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth={1.5}
                fill="none"
              />
            ))}
            {tree.flatNodes.map((node) => {
              const isMonarch = node.npc.role === "monarch";
              const isHeir = tree.heirId === node.npc.id;
              return (
                <g
                  key={node.npc.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="family-tree-node"
                  style={{ cursor: onSelectNpc ? "pointer" : "default" }}
                  onClick={() => onSelectNpc?.(node.npc.id)}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={4}
                    fill={isMonarch ? "rgba(253, 224, 71, 0.18)" : "rgba(255, 255, 255, 0.04)"}
                    stroke={isMonarch ? "#fde047" : isHeir ? "#fb923c" : "rgba(255, 255, 255, 0.18)"}
                    strokeWidth={isMonarch || isHeir ? 1.5 : 1}
                  />
                  <text
                    x={NODE_W / 2}
                    y={14}
                    textAnchor="middle"
                    fill={isMonarch ? "#fde047" : "#e5e7eb"}
                    fontSize="11"
                    fontWeight={isMonarch ? "bold" : "normal"}
                  >
                    {isMonarch ? "♛ " : ""}
                    {(node.npc.name ?? "—").slice(0, 11)}
                    {isHeir ? " ▾" : ""}
                  </text>
                  <text
                    x={NODE_W / 2}
                    y={28}
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.5)"
                    fontSize="9"
                  >
                    {node.npc.role} · {Math.floor(node.npc.age ?? 0)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <footer className="family-tree-footer">
        <small>
          ♛ monarch · ▾ heir apparent · Click any node for details.
        </small>
      </footer>
    </aside>
  );
}

// ── Tree construction ────────────────────────────────────────────────────────

function buildTree(world: World): {
  roots: TreeNode[];
  flatNodes: TreeNode[];
  connections: string[];
  totalWidth: number;
  totalHeight: number;
  heirId: string | null;
} {
  const npcs = world.npcs;
  const heir = world.succession.currentHeir();
  const heirId = heir?.id ?? null;

  // Find roots — NPCs with no parents who have either a partner or children.
  const idsWithChildren = new Set<string>();
  for (const n of npcs) {
    if (n.parentIds) for (const pid of n.parentIds) idsWithChildren.add(pid);
  }

  const rootCandidates = npcs.filter((n) => {
    const hasParent = !!n.parentIds?.length;
    const hasFamily = !!n.partnerId || idsWithChildren.has(n.id);
    return !hasParent && hasFamily;
  });

  // Deduplicate by couple (skip the partner if their spouse is already a root).
  const seen = new Set<string>();
  const roots: TreeNode[] = [];
  for (const r of rootCandidates) {
    if (seen.has(r.id)) continue;
    const partner = r.partnerId ? npcs.find((n) => n.id === r.partnerId) : undefined;
    if (partner) seen.add(partner.id);
    seen.add(r.id);
    roots.push({
      npc: r,
      partner,
      children: collectChildren(r, partner, npcs, new Set()),
      x: 0, y: 0, width: 0,
    });
  }

  // Layout each tree side-by-side.
  const flatNodes: TreeNode[] = [];
  const connections: string[] = [];
  let xCursor = 16;
  let maxHeight = 0;
  for (const root of roots) {
    layoutTree(root, xCursor, 16);
    xCursor += root.width + 24;
    collectFlat(root, flatNodes);
    drawConnections(root, connections);
    const h = treeHeight(root);
    if (h > maxHeight) maxHeight = h;
  }

  return {
    roots,
    flatNodes,
    connections,
    totalWidth: Math.max(400, xCursor),
    totalHeight: Math.max(120, maxHeight + 16),
    heirId,
  };
}

function collectChildren(
  a: NPC, b: NPC | undefined, all: NPC[], visited: Set<string>,
): TreeNode[] {
  const children = all.filter((n) => {
    if (!n.parentIds) return false;
    if (visited.has(n.id)) return false;
    return n.parentIds.includes(a.id) || (b && n.parentIds.includes(b.id));
  });
  return children.map((c) => {
    visited.add(c.id);
    const cPartner = c.partnerId ? all.find((x) => x.id === c.partnerId) : undefined;
    if (cPartner) visited.add(cPartner.id);
    return {
      npc: c,
      partner: cPartner,
      children: collectChildren(c, cPartner, all, visited),
      x: 0, y: 0, width: 0,
    };
  });
}

function layoutTree(node: TreeNode, x: number, y: number): void {
  const ownWidth = node.partner ? NODE_W * 2 + NODE_GAP_X : NODE_W;

  if (node.children.length === 0) {
    node.x = x;
    node.y = y;
    node.width = ownWidth;
    return;
  }

  // Layout children below.
  let cx = x;
  const childY = y + NODE_H + NODE_GAP_Y;
  let childrenWidth = 0;
  for (const child of node.children) {
    layoutTree(child, cx, childY);
    cx += child.width + NODE_GAP_X;
    childrenWidth += child.width;
  }
  childrenWidth += NODE_GAP_X * (node.children.length - 1);

  // Center this couple over the children block.
  const containerWidth = Math.max(ownWidth, childrenWidth);
  node.x = x + (containerWidth - ownWidth) / 2;
  node.y = y;
  node.width = containerWidth;

  // If the couple is wider than children, push children to center too.
  if (ownWidth > childrenWidth && node.children.length > 0) {
    const shift = (ownWidth - childrenWidth) / 2;
    for (const child of node.children) {
      shiftSubtree(child, shift, 0);
    }
  }
}

function shiftSubtree(node: TreeNode, dx: number, dy: number): void {
  node.x += dx;
  node.y += dy;
  for (const c of node.children) shiftSubtree(c, dx, dy);
}

function collectFlat(node: TreeNode, out: TreeNode[]): void {
  out.push(node);
  if (node.partner) {
    // Render the partner as a sibling node positioned to the right of the main.
    out.push({
      npc: node.partner,
      children: [],
      x: node.x + NODE_W + NODE_GAP_X,
      y: node.y,
      width: NODE_W,
    });
  }
  for (const c of node.children) collectFlat(c, out);
}

function drawConnections(node: TreeNode, connections: string[]): void {
  // Couple line (horizontal between the two boxes).
  if (node.partner) {
    const y = node.y + NODE_H / 2;
    connections.push(
      `M ${node.x + NODE_W} ${y} L ${node.x + NODE_W + NODE_GAP_X} ${y}`,
    );
  }
  // Lines to children.
  if (node.children.length > 0) {
    const parentCenterX = node.partner
      ? node.x + NODE_W + NODE_GAP_X / 2
      : node.x + NODE_W / 2;
    const parentBottomY = node.y + NODE_H;
    const childTopY = node.children[0].y;
    const midY = (parentBottomY + childTopY) / 2;
    // Vertical stem from parents down.
    connections.push(`M ${parentCenterX} ${parentBottomY} L ${parentCenterX} ${midY}`);
    // Horizontal bar connecting all children.
    const firstX = node.children[0].x + NODE_W / 2;
    const lastX = node.children[node.children.length - 1].x + NODE_W / 2;
    connections.push(`M ${firstX} ${midY} L ${lastX} ${midY}`);
    // Drop into each child.
    for (const c of node.children) {
      const cx = c.x + NODE_W / 2;
      connections.push(`M ${cx} ${midY} L ${cx} ${childTopY}`);
      drawConnections(c, connections);
    }
  }
}

function treeHeight(node: TreeNode): number {
  if (node.children.length === 0) return node.y + NODE_H;
  return Math.max(...node.children.map(treeHeight));
}
