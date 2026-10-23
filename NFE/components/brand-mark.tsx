/** The Neuravic mark as five pieces on a 256 grid, drawn as glowing glass like the main page. */
const PIECES = [
  "128,0 64,64 128,128",
  "256,0 192,64 256,128",
  "128,128 192,128 192,192",
  "64,128 128,128 128,192 64,256 64,192 0,192",
  "256,128 192,192 256,256",
];

export function BrandMark({ className, id }: { className?: string; id: string }) {
  return (
    <svg className={className} viewBox="-24 -24 304 304" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2540" />
          <stop offset="1" stopColor="#0b1020" />
        </linearGradient>
      </defs>
      {PIECES.map((points) => (
        <polygon key={points} points={points} fill={`url(#${id})`} stroke="#6f8bff" strokeWidth="2" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
