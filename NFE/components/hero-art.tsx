/**
 * Hero artwork: the Neuravic mark drawn as vector shapes, so its edges stay razor sharp on any screen size
 * and pixel density. A beam of light travels through the glass pieces every few seconds (see `.hero-art__sweep`
 * in globals.css). The soft blue glow behind it is a plain CSS gradient, so the background has no grain.
 */

/** The five pieces of the mark on a 256 x 256 grid, as in `public/assets/neuravic-mark.png`. */
const PIECES = [
  "128,0 64,64 128,128",
  "256,0 192,64 256,128",
  "128,128 192,128 192,192",
  "64,128 128,128 128,192 64,256 64,192 0,192",
  "256,128 192,192 256,256",
];

function Pieces(props: React.SVGProps<SVGPolygonElement>) {
  return (
    <>
      {PIECES.map((points) => (
        <polygon key={points} points={points} {...props} />
      ))}
    </>
  );
}

/** The light band runs along "/" and moves across the mark; it is rotated once and slid by CSS. */
function Beam({ children }: { children: React.ReactNode }) {
  return (
    <g transform="rotate(-45 128 128)">
      <g className="hero-art__sweep">{children}</g>
    </g>
  );
}

export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-art__halo" />
      <svg className="hero-art__logo" viewBox="0 0 256 256" focusable="false">
        <defs>
          <linearGradient id="hero-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#172033" />
            <stop offset="1" stopColor="#0d1320" />
          </linearGradient>
          <linearGradient id="hero-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.38" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.62" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hero-core" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id="hero-blur-near" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <filter id="hero-blur-wide" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <clipPath id="hero-logo-clip">
            <Pieces />
          </clipPath>
          <mask id="hero-beam-wide" maskUnits="userSpaceOnUse" x="-300" y="-300" width="900" height="900">
            <Beam>
              <rect x="-120" y="64" width="500" height="120" fill="url(#hero-band)" />
            </Beam>
          </mask>
          <mask id="hero-beam-tight" maskUnits="userSpaceOnUse" x="-300" y="-300" width="900" height="900">
            <Beam>
              <rect x="-120" y="86" width="500" height="76" fill="url(#hero-band)" />
            </Beam>
          </mask>
        </defs>

        {/* Resting glow: blue neon edges */}
        <g filter="url(#hero-blur-wide)" opacity="0.75" fill="none" stroke="#365bff" strokeWidth="7">
          <Pieces />
        </g>
        <g filter="url(#hero-blur-near)" opacity="0.85" fill="none" stroke="#6f93ff" strokeWidth="2.4">
          <Pieces />
        </g>

        {/* Dark glass with a sharp edge */}
        <g fill="url(#hero-glass)" stroke="#a9bcff" strokeOpacity="0.8" strokeWidth="1.1" strokeLinejoin="miter">
          <Pieces />
        </g>

        {/* Light passing through the glass: a soft streak and a thin bright core inside every piece */}
        <g clipPath="url(#hero-logo-clip)">
          <g mask="url(#hero-beam-wide)">
            <g fill="#cfe0ff" opacity="0.42">
              <Pieces />
            </g>
          </g>
          <Beam>
            <rect x="-120" y="108" width="500" height="5" fill="url(#hero-core)" opacity="0.9" />
          </Beam>
        </g>

        {/* The edges ignite as the light reaches them */}
        <g mask="url(#hero-beam-tight)">
          <g filter="url(#hero-blur-wide)" opacity="0.95" fill="none" stroke="#9db8ff" strokeWidth="6">
            <Pieces />
          </g>
          <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="miter">
            <Pieces />
          </g>
        </g>
      </svg>
    </div>
  );
}
