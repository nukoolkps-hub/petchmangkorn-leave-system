/* ─── Avatar renderer ──────────────────────────────────────────── */
export default function AvatarCircle({
  avatar,
  avatarType,
  avatarImageUrl,
  size = 56,
  fontSize = 18,
  border,
  style = {},
  className = "",
}) {
  const base = {
    width: size,
    height: size,
    border: border || undefined,
    fontSize: avatarType === "emoji" ? size * 0.5 : fontSize,
    ...style,
  };
  if (avatarType === "image" && avatarImageUrl) {
    return (
      <div
        className={`rounded-full shrink-0 flex items-center justify-center overflow-hidden border-2 border-gold-lt/30 ${className}`}
        style={base}
      >
        <img
          src={avatarImageUrl}
          alt="avatar"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover animate-[fadeIn_0.3s_ease-out]"
        />
      </div>
    );
  }
  if (avatarType === "emoji") {
    return (
      <div
        className={`rounded-full shrink-0 flex items-center justify-center overflow-hidden bg-gold-pale border-2 border-gold-lt/30 ${className}`}
        style={base}
      >
        {avatar}
      </div>
    );
  }
  // text (initials)
  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center overflow-hidden bg-linear-135 from-gold to-gold-lt border-2 border-gold-lt/30 ${className}`}
      style={base}
    >
      <span
        className="text-white font-bold font-[inherit]"
        style={{ fontSize }}
      >
        {avatar}
      </span>
    </div>
  );
}
