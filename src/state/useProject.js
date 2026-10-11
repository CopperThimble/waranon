import { createContext, useContext } from "react";

export const ProjectContext = createContext(null);

/** { game, project, projects, saveState, update, patchItem, addItem, removeItem, addAsset, ... } */
export function useProject() {
  return useContext(ProjectContext);
}
