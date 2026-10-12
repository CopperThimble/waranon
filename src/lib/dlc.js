// Which divisions are paid DLC. The game files have no such flag (Steam ownership is checked by the
// engine; the UI only draws a "DLC" badge), so this list is maintained by hand from the Steam store
// pages. Add new Nemesis packs here: the key is the division's CfgName.

export const DLC_PACKS = [
  { id: "nemesis1", name: "Nemesis #1 - Air Assault", divisions: ["US_101st_Airmobile_multi", "SOV_56_AirAslt_Brig_multi"] },
  { id: "nemesis2", name: "Nemesis #2 - Plateau d'Albion", divisions: ["FR_152e_Infanterie_multi", "SOV_76_VDV_multi"] },
  { id: "nemesis3", name: "Nemesis #3 - Homefront", divisions: ["US_6th_Light_multi", "SOV_157_Rifle_multi"] },
  { id: "nemesis4", name: "Nemesis #4 - Capital Defence", divisions: ["UK_London_HDR_multi", "SOV_2_Gds_Rifle_multi"] },
  { id: "nemesis5", name: "Nemesis #5 - Southern Flank", divisions: ["ESP_Division_Guzman_multi", "TCH_2_MSD_multi"] },
  { id: "nemesis6", name: "Nemesis #6 - The Magdeburg Counterstrike", divisions: ["US_1st_Cavalry_multi", "SOV_1_Gds_Rifle_multi"] },
  { id: "nemesis7", name: "Nemesis #7 - State of Emergency", divisions: ["FR_ZdD_Paris_multi", "SOV_DON_100_multi"] },
  { id: "nemesis8", name: "Nemesis #8 - School's Out", divisions: ["RFA_VTK_42_multi", "SOV_71_Tank_multi"] },
];

const packByCfg = new Map(DLC_PACKS.flatMap((p) => p.divisions.map((d) => [d, p])));

/**
 * Marks DLC content on the indexed catalog:
 *  - division.dlc = pack, for DLC divisions
 *  - unit.dlc = [packs] when every division that fields the unit (as a card or a transport) is DLC,
 *    i.e. you need one of those packs to use it. Units in no division at all are left unmarked.
 *  - unit.divisions = [division ids] that field it
 */
export function markDlc(game) {
  const fieldedIn = new Map();
  for (const d of game.divisions) {
    d.dlc = packByCfg.get(d.cfgName) || null;
    for (const entry of game.rules[d.rule] || []) {
      for (const id of [entry.unit, ...(entry.transports || [])]) {
        if (!fieldedIn.has(id)) fieldedIn.set(id, new Set());
        fieldedIn.get(id).add(d);
      }
    }
  }
  for (const u of game.units) {
    const divs = [...(fieldedIn.get(u.id) || [])];
    u.divisions = divs.map((d) => d.id);
    u.dlc = divs.length && divs.every((d) => d.dlc) ? [...new Set(divs.map((d) => d.dlc))] : null;
  }
  return game;
}
