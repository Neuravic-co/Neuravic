/**
 * Hero artwork: the Neuravic mark drawn as vector shapes, so its edges stay razor sharp on any screen size
 * and pixel density. A beam of light travels through the glass pieces every few seconds (see `.hero-art__beam`
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

/**
 * The beam of light, built so that only pre-drawn layers move (a cheap job for the graphics chip):
 *  - `.hero-art__beam` is a soft-edged strip that slides diagonally across the logo;
 *  - inside it, `.hero-art__lit` (a "lit" copy of the logo) slides the opposite way, so the copy stays exactly
 *    over the real logo and is revealed only where the strip passes: light through the glass, edges igniting;
 *  - `.hero-art__core` is a thin bright line that travels with the strip, kept inside the pieces by a fixed clip.
 * Animating an SVG mask instead would be redrawn by the processor on every frame and made scrolling stutter.
 */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-art__halo" />

      <div className="hero-art__logo">
        {/* The still logo: glow, dark glass and resting edges. Drawn once, never changes. */}
        <svg className="hero-art__base" viewBox="0 0 256 256" focusable="false">
          <defs>
            <linearGradient id="hero-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#172033" />
              <stop offset="1" stopColor="#0d1320" />
            </linearGradient>
            <filter id="hero-blur-near" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <filter id="hero-blur-wide" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>
          <g filter="url(#hero-blur-wide)" opacity="0.75" fill="none" stroke="#365bff" strokeWidth="7">
            <Pieces />
          </g>
          <g filter="url(#hero-blur-near)" opacity="0.85" fill="none" stroke="#6f93ff" strokeWidth="2.4">
            <Pieces />
          </g>
          <g fill="url(#hero-glass)" stroke="#a9bcff" strokeOpacity="0.8" strokeWidth="1.1" strokeLinejoin="miter">
            <Pieces />
          </g>
        </svg>

        <div className="hero-art__beam">
          <svg className="hero-art__lit" viewBox="0 0 256 256" focusable="false">
            <g fill="#cfe0ff" opacity="0.42">
              <Pieces />
            </g>
            <g fill="none" strokeLinejoin="miter">
              <g stroke="#7fa0ff" strokeWidth="6" opacity="0.55">
                <Pieces />
              </g>
              <g stroke="#fff" strokeWidth="1.8">
                <Pieces />
              </g>
            </g>
          </svg>
        </div>

        <div className="hero-art__core-clip">
          <div className="hero-art__core" />
        </div>
      </div>

      {/* Fixed clip shape (the five pieces, as fractions of the logo box) for the bright core line. */}
      <svg className="hero-art__defs" width="0" height="0" focusable="false">
        <defs>
          <clipPath id="hero-pieces" clipPathUnits="objectBoundingBox">
            <g transform="scale(0.00390625)">
              <Pieces />
            </g>
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
