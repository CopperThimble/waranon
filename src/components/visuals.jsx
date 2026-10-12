import { blobUrl, vanillaEmblemUrl, vanillaFlagUrl, vanillaUnitUrl } from "../lib/images";
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
