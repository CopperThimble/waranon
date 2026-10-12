import { blobUrl, specialtyIconUrl, vanillaEmblemUrl, vanillaFlagUrl, vanillaUnitUrl } from "../lib/images";
import { ROLE_LABELS, SPECIALTY_LABELS } from "../lib/labels";
import { useProject } from "../state/useProject";

function useFlagUrl(tag) {
  const { game, project } = useProject();
  const nation = project.nations.find((n) => n.tag === tag);
  if (nation) {
    if (nation.flagAssetId) return blobUrl(project.assets[nation.flagAssetId]?.blob);
    return vanillaFlagUrl(game.countriesByTag.get(nation.baseFlagCountry));
  }
  return vanillaFlagUrl(game.countriesByTag.get(tag));
}

export function NationFlag({ tag, size = 22 }) {
  const url = useFlagUrl(tag);
  const style = { width: size, height: Math.round(size * 0.6) };
  return url ? <img className="flag" src={url} alt={tag} style={style} /> : <span className="flag flag-empty" style={style} />;
}

/** Thumbnail for a resolved unit (see resolveUnitRef). */
export function UnitThumb({ info, className = "" }) {
  const { project } = useProject();
  const custom = info?.custom && info.unit.iconAssetId ? blobUrl(project.assets[info.unit.iconAssetId]?.blob) : null;
  const url = custom || vanillaUnitUrl(info?.base);
  return (
    <div className={`unit-thumb ${className}`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span>{info?.name?.slice(0, 2) || "?"}</span>}
    </div>
  );
}

export function DivisionEmblem({ division, size = 48 }) {
  const { project } = useProject();
  const url = division.emblemAssetId
    ? blobUrl(project.assets[division.emblemAssetId]?.blob)
    : vanillaEmblemUrl(division.baseDivisionId);
  return (
    <div className="emblem" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>◆</span>}
    </div>
  );
}

/** Game icon for a role or specialty key ("hq_inf", "_para", "AT"…). Renders nothing without art. */
export function SpecIcon({ spec, title, size = 18, className = "" }) {
  const { game } = useProject();
  const url = specialtyIconUrl(game, spec);
  if (!url) return null;
  return <img className={`spec-icon ${className}`} src={url} alt={title || ""} title={title} style={{ height: size }} />;
}

/** "DLC" chip naming the Nemesis pack(s) a vanilla unit or division needs. */
export function DlcBadge({ packs }) {
  const list = Array.isArray(packs) ? packs : packs ? [packs] : [];
  if (!list.length) return null;
  return (
    <span className="dlc-badge" title={`Needs DLC: ${list.map((p) => p.name).join(" or ")}`}>
      DLC
    </span>
  );
}

/** Role icon + trait icons for a vanilla unit, as on the in-game card. */
export function UnitSpecIcons({ unit, specialties = unit?.specialties || [], size = 16 }) {
  if (!unit) return null;
  return (
    <span className="spec-icons">
      <SpecIcon spec={unit.role} title={ROLE_LABELS[unit.role] || unit.role} size={size} />
      {specialties.map((s) => (
        <SpecIcon key={s} spec={s} title={SPECIALTY_LABELS[s] || s.replace(/^_/, "").replace(/_/g, " ")} size={size} />
      ))}
    </span>
  );
}
