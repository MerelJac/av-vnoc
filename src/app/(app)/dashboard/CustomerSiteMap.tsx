interface Site {
  id: string;
  lat: number | null;
  lng: number | null;
  _count: { rooms: number };
}

interface Customer {
  id: string;
  name: string;
  sites: Site[];
}

const US_LAT = { min: 25, max: 50 };
const US_LNG = { min: -125, max: -65 };
const SVG_W = 400;
const SVG_H = 160;

function latLngToSvg(lat: number, lng: number) {
  const x = ((lng - US_LNG.min) / (US_LNG.max - US_LNG.min)) * SVG_W;
  const y = SVG_H - ((lat - US_LAT.min) / (US_LAT.max - US_LAT.min)) * SVG_H;
  return { x, y };
}

function hashColor(id: string) {
  const colors = ["#4299e1", "#9f7aea", "#48bb78", "#ed8936", "#fc8181", "#38b2ac", "#667eea"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function fallbackPos(id: string, index: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  const x = 30 + ((h * 137 + index * 73) % (SVG_W - 60));
  const y = 20 + ((h * 97 + index * 53) % (SVG_H - 40));
  return { x, y };
}

export function CustomerSiteMap({ customers }: { customers: Customer[] }) {
  const totalSites = customers.reduce((s, c) => s + c.sites.length, 0);
  const totalRooms = customers.reduce(
    (s, c) => s + c.sites.reduce((r, site) => r + site._count.rooms, 0),
    0
  );

  type Bubble = { x: number; y: number; r: number; color: string; label: string };
  const bubbles: Bubble[] = customers
    .map((c, i) => {
      const sitesWithCoords = c.sites.filter((s) => s.lat != null && s.lng != null);
      let pos: { x: number; y: number };
      if (sitesWithCoords.length > 0) {
        const avgLat = sitesWithCoords.reduce((s, site) => s + site.lat!, 0) / sitesWithCoords.length;
        const avgLng = sitesWithCoords.reduce((s, site) => s + site.lng!, 0) / sitesWithCoords.length;
        pos = latLngToSvg(avgLat, avgLng);
      } else {
        pos = fallbackPos(c.id, i);
      }
      const rooms = c.sites.reduce((s, site) => s + site._count.rooms, 0);
      const r = Math.max(8, Math.min(18, 8 + Math.sqrt(rooms) * 1.5));
      return { x: pos.x, y: pos.y, r, color: hashColor(c.id), label: c.name.split(" ")[0] };
    })
    .filter((b) => b.x >= 0 && b.x <= SVG_W && b.y >= 0 && b.y <= SVG_H);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-bold text-gray-700">Customer Site Map</h2>
        <span className="text-[11px] text-gray-400">{totalSites} sites · {totalRooms} rooms</span>
      </div>
      <div className="bg-[#dce4f0]">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: "block" }}>
          <rect width={SVG_W} height={SVG_H} fill="#dce4f0" />
          <path
            d="M 20 45 Q 200 22 380 48 Q 392 105 358 132 Q 200 148 38 122 Z"
            fill="#c8d6ea"
            opacity="0.45"
          />
          {bubbles.map((b, i) => (
            <g key={i}>
              <circle cx={b.x} cy={b.y} r={b.r} fill={b.color} opacity={0.78} />
              <text
                x={b.x}
                y={b.y + 4}
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                fill="#fff"
              >
                {b.label.slice(0, 3)}
              </text>
            </g>
          ))}
          {bubbles.length === 0 && (
            <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fontSize="12" fill="#94a3b8">
              No customer sites
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
