/* ─── MemphisPattern — Memphis-style scatter decoration ─────────
   Geometric playful shapes (circles, zigzags, triangles, dots,
   squiggles, crosses) scattered on the maroon header/sidebar.
   Keeps the maroon/gold/cream palette — only the shape vocabulary
   changes from organic blobs to bold geometric primitives.        */

interface MemphisPatternProps {
  /** "sidebar" = vertical column, "header" = wide top bar */
  variant: "sidebar" | "header";
  /** Unused — kept for backwards compat */
  idPrefix?: string;
}

const C = {
  gold: "#E8C87A",
  goldDeep: "#C9973A",
  cream: "#F5E6C8",
  maroonDeep: "#5C1212",
};

/* Shape primitives — each returns SVG <path>/<g> ready to render */

function Dot({
  cx,
  cy,
  r,
  fill,
  opacity = 0.45,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={opacity} />;
}

function Ring({
  cx,
  cy,
  r,
  stroke,
  opacity = 0.5,
  width = 1.2,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: string;
  opacity?: number;
  width?: number;
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeOpacity={opacity}
    />
  );
}

function Triangle({
  cx,
  cy,
  size,
  rotate = 0,
  fill,
  opacity = 0.4,
}: {
  cx: number;
  cy: number;
  size: number;
  rotate?: number;
  fill: string;
  opacity?: number;
}) {
  const h = size * 0.866;
  const points = `${cx},${cy - h * 0.6} ${cx - size / 2},${cy + h * 0.4} ${cx + size / 2},${cy + h * 0.4}`;
  return (
    <polygon
      points={points}
      fill={fill}
      fillOpacity={opacity}
      transform={`rotate(${rotate} ${cx} ${cy})`}
    />
  );
}

function Zigzag({
  x,
  y,
  step = 8,
  segments = 4,
  amp = 5,
  stroke,
  opacity = 0.5,
  width = 1.6,
  rotate = 0,
}: {
  x: number;
  y: number;
  step?: number;
  segments?: number;
  amp?: number;
  stroke: string;
  opacity?: number;
  width?: number;
  rotate?: number;
}) {
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const px = x + i * step;
    const py = y + (i % 2 === 0 ? 0 : amp);
    pts.push(`${px},${py}`);
  }
  const cx = x + (segments * step) / 2;
  const cy = y + amp / 2;
  return (
    <polyline
      points={pts.join(" ")}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinejoin="round"
      strokeLinecap="round"
      transform={`rotate(${rotate} ${cx} ${cy})`}
    />
  );
}

function Squiggle({
  x,
  y,
  width: w = 40,
  amp = 4,
  stroke,
  opacity = 0.5,
  thickness = 1.6,
  rotate = 0,
}: {
  x: number;
  y: number;
  width?: number;
  amp?: number;
  stroke: string;
  opacity?: number;
  thickness?: number;
  rotate?: number;
}) {
  const q = w / 4;
  const d = `M ${x} ${y} q ${q} ${-amp}, ${q * 2} 0 t ${q * 2} 0`;
  const cx = x + w / 2;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={thickness}
      strokeOpacity={opacity}
      strokeLinecap="round"
      transform={`rotate(${rotate} ${cx} ${y})`}
    />
  );
}

function Cross({
  cx,
  cy,
  size = 6,
  stroke,
  opacity = 0.55,
  width = 1.5,
  rotate = 0,
}: {
  cx: number;
  cy: number;
  size?: number;
  stroke: string;
  opacity?: number;
  width?: number;
  rotate?: number;
}) {
  const h = size / 2;
  return (
    <g
      transform={`rotate(${rotate} ${cx} ${cy})`}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    >
      <line x1={cx - h} y1={cy} x2={cx + h} y2={cy} />
      <line x1={cx} y1={cy - h} x2={cx} y2={cy + h} />
    </g>
  );
}

function DotCluster({
  x,
  y,
  fill,
  opacity = 0.5,
}: {
  x: number;
  y: number;
  fill: string;
  opacity?: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={1.3} fill={fill} fillOpacity={opacity} />
      <circle cx={x + 5} cy={y - 2} r={1.3} fill={fill} fillOpacity={opacity} />
      <circle cx={x + 3} cy={y + 4} r={1.3} fill={fill} fillOpacity={opacity} />
      <circle cx={x + 8} cy={y + 3} r={1.3} fill={fill} fillOpacity={opacity} />
    </g>
  );
}

/* ─── Sidebar variant — viewBox 0 0 260 900 (tall column) ────── */
function SidebarShapes() {
  return (
    <>
      {/* Top zone */}
      <Ring cx={40} cy={50} r={18} stroke={C.gold} opacity={0.45} width={1.4} />
      <Dot cx={210} cy={40} r={5} fill={C.cream} opacity={0.4} />
      <Triangle
        cx={220}
        cy={85}
        size={14}
        rotate={20}
        fill={C.gold}
        opacity={0.35}
      />
      <Zigzag
        x={150}
        y={55}
        segments={4}
        step={9}
        amp={5}
        stroke={C.cream}
        opacity={0.4}
      />
      <DotCluster x={70} y={120} fill={C.gold} opacity={0.55} />
      <Cross
        cx={215}
        cy={150}
        size={9}
        stroke={C.gold}
        opacity={0.55}
        rotate={20}
      />

      {/* Upper middle */}
      <Ring
        cx={185}
        cy={230}
        r={22}
        stroke={C.cream}
        opacity={0.32}
        width={1.3}
      />
      <Dot cx={55} cy={220} r={4} fill={C.gold} opacity={0.55} />
      <Squiggle
        x={120}
        y={260}
        width={60}
        amp={5}
        stroke={C.gold}
        opacity={0.45}
      />
      <Triangle
        cx={45}
        cy={300}
        size={16}
        rotate={-10}
        fill={C.cream}
        opacity={0.32}
      />

      {/* Center */}
      <DotCluster x={195} y={350} fill={C.cream} opacity={0.45} />
      <Zigzag
        x={30}
        y={400}
        segments={5}
        step={9}
        amp={5}
        stroke={C.gold}
        opacity={0.4}
        rotate={10}
      />
      <Ring
        cx={215}
        cy={420}
        r={15}
        stroke={C.gold}
        opacity={0.5}
        width={1.4}
      />
      <Cross cx={70} cy={470} size={10} stroke={C.cream} opacity={0.5} />

      {/* Lower middle */}
      <Triangle
        cx={195}
        cy={520}
        size={18}
        rotate={45}
        fill={C.gold}
        opacity={0.32}
      />
      <Dot cx={40} cy={540} r={5} fill={C.cream} opacity={0.35} />
      <Squiggle
        x={130}
        y={580}
        width={70}
        amp={6}
        stroke={C.cream}
        opacity={0.38}
        rotate={-5}
      />
      <DotCluster x={50} y={610} fill={C.gold} opacity={0.5} />

      {/* Bottom zone */}
      <Ring
        cx={210}
        cy={680}
        r={20}
        stroke={C.gold}
        opacity={0.42}
        width={1.4}
      />
      <Cross
        cx={50}
        cy={690}
        size={9}
        stroke={C.gold}
        opacity={0.5}
        rotate={45}
      />
      <Zigzag
        x={120}
        y={730}
        segments={5}
        step={10}
        amp={5}
        stroke={C.cream}
        opacity={0.4}
      />
      <Triangle
        cx={220}
        cy={790}
        size={14}
        rotate={-25}
        fill={C.cream}
        opacity={0.4}
      />
      <Dot cx={60} cy={810} r={4} fill={C.gold} opacity={0.55} />
      <Ring
        cx={170}
        cy={850}
        r={11}
        stroke={C.gold}
        opacity={0.45}
        width={1.3}
      />
      <DotCluster x={210} y={865} fill={C.cream} opacity={0.4} />
    </>
  );
}

/* ─── Header variant — viewBox 0 0 1200 80 (wide bar) ────────── */
function HeaderShapes() {
  return (
    <>
      {/* Far left — continues from sidebar */}
      <Ring cx={40} cy={40} r={20} stroke={C.gold} opacity={0.45} width={1.4} />
      <Dot cx={90} cy={20} r={4} fill={C.cream} opacity={0.5} />
      <Triangle
        cx={120}
        cy={55}
        size={12}
        rotate={25}
        fill={C.gold}
        opacity={0.4}
      />

      {/* Left zone */}
      <DotCluster x={180} y={25} fill={C.cream} opacity={0.45} />
      <Cross
        cx={250}
        cy={55}
        size={8}
        stroke={C.gold}
        opacity={0.55}
        rotate={20}
      />
      <Zigzag
        x={300}
        y={20}
        segments={4}
        step={9}
        amp={5}
        stroke={C.gold}
        opacity={0.45}
      />

      {/* Center-left */}
      <Ring
        cx={420}
        cy={40}
        r={16}
        stroke={C.cream}
        opacity={0.35}
        width={1.3}
      />
      <Squiggle
        x={480}
        y={45}
        width={55}
        amp={4}
        stroke={C.gold}
        opacity={0.45}
      />
      <Triangle
        cx={570}
        cy={25}
        size={13}
        rotate={-15}
        fill={C.cream}
        opacity={0.4}
      />

      {/* Center */}
      <DotCluster x={620} y={50} fill={C.gold} opacity={0.5} />
      <Cross cx={700} cy={30} size={9} stroke={C.cream} opacity={0.55} />
      <Ring
        cx={760}
        cy={50}
        r={14}
        stroke={C.gold}
        opacity={0.45}
        width={1.3}
      />

      {/* Center-right */}
      <Zigzag
        x={810}
        y={25}
        segments={5}
        step={9}
        amp={5}
        stroke={C.cream}
        opacity={0.4}
        rotate={5}
      />
      <Triangle
        cx={910}
        cy={55}
        size={14}
        rotate={30}
        fill={C.gold}
        opacity={0.35}
      />
      <Dot cx={960} cy={25} r={4} fill={C.cream} opacity={0.5} />

      {/* Right zone */}
      <DotCluster x={1000} y={45} fill={C.gold} opacity={0.5} />
      <Squiggle
        x={1070}
        y={30}
        width={60}
        amp={5}
        stroke={C.cream}
        opacity={0.42}
        rotate={-3}
      />
      <Ring
        cx={1160}
        cy={45}
        r={16}
        stroke={C.gold}
        opacity={0.45}
        width={1.4}
      />
      <Cross
        cx={1130}
        cy={60}
        size={9}
        stroke={C.gold}
        opacity={0.55}
        rotate={45}
      />
    </>
  );
}

/* ─── Card corner sticker — Light Memphis accent for content cards
   Use inside a `relative overflow-hidden` parent. Defaults to gold
   tones for use on white/cream surfaces.                            */
export function MemphisCornerSticker({
  position = "tr",
  tone = "gold",
}: {
  position?: "tr" | "tl" | "br" | "bl";
  tone?: "gold" | "maroon";
}) {
  const stroke = tone === "gold" ? C.goldDeep : C.maroonDeep;
  const fill = tone === "gold" ? C.gold : C.maroonDeep;
  const pos =
    position === "tr"
      ? "top-0 right-0"
      : position === "tl"
        ? "top-0 left-0 scale-x-[-1]"
        : position === "br"
          ? "bottom-0 right-0 scale-y-[-1]"
          : "bottom-0 left-0 scale-x-[-1] scale-y-[-1]";
  return (
    <svg
      className={`absolute ${pos} w-14 h-12 pointer-events-none`}
      viewBox="0 0 56 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Ring cx={42} cy={10} r={8} stroke={stroke} opacity={0.22} width={1.4} />
      <Zigzag
        x={6}
        y={14}
        segments={3}
        step={6}
        amp={4}
        stroke={stroke}
        opacity={0.28}
        width={1.4}
      />
      <Dot cx={18} cy={32} r={2} fill={fill} opacity={0.3} />
      <Dot cx={28} cy={38} r={1.5} fill={fill} opacity={0.25} />
      <Triangle
        cx={46}
        cy={34}
        size={6}
        rotate={20}
        fill={fill}
        opacity={0.22}
      />
    </svg>
  );
}

export default function MemphisPattern({ variant }: MemphisPatternProps) {
  if (variant === "sidebar") {
    return (
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox="0 0 260 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <SidebarShapes />
      </svg>
    );
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      viewBox="0 0 1200 80"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <HeaderShapes />
    </svg>
  );
}
