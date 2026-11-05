import type { WorkVisualKind } from "@/lib/site-content";

function Network() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
      <g className="work-lines">
        <path d="M60 150L140 70L220 115L310 50L350 125" />
        <path d="M60 150L220 115L350 125M140 70L310 50" opacity="0.4" />
      </g>
      <circle cx="60" cy="150" r="5" />
      <circle cx="140" cy="70" r="7" />
      <circle className="work-hub" cx="220" cy="115" r="10" />
      <circle cx="310" cy="50" r="6" />
      <circle cx="350" cy="125" r="5" />
    </svg>
  );
}

function Document() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
      <g className="work-lines">
        <rect x="130" y="25" width="140" height="150" rx="8" />
        <path d="M155 60h90M155 85h90M155 110h60M155 135h75" opacity="0.5" />
      </g>
      <circle className="work-hub" cx="245" cy="135" r="10" />
      <circle cx="155" cy="60" r="4" />
      <circle cx="155" cy="85" r="4" />
    </svg>
  );
}

function Tiles() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
      <g className="work-lines">
        <rect x="60" y="40" width="120" height="55" rx="8" />
        <rect x="200" y="40" width="140" height="55" rx="8" />
        <rect x="60" y="112" width="180" height="55" rx="8" />
        <rect x="260" y="112" width="80" height="55" rx="8" />
        <path d="M95 67h60M235 67h80M95 139h120M295 139h30" opacity="0.5" />
      </g>
      <circle className="work-hub" cx="80" cy="67" r="5" />
      <circle className="work-hub" cx="220" cy="67" r="5" />
      <circle className="work-hub" cx="80" cy="139" r="5" />
      <circle className="work-hub" cx="280" cy="139" r="5" />
    </svg>
  );
}

const VISUALS: Record<WorkVisualKind, () => React.JSX.Element> = { network: Network, document: Document, tiles: Tiles };

export function WorkVisual({ kind }: { kind: WorkVisualKind }) {
  const Visual = VISUALS[kind];
  return (
    <div className="work-card__visual" aria-hidden="true">
      <Visual />
    </div>
  );
}
