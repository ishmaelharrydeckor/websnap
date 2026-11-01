export interface PanelActions {
  /** Opens the file picker to add an image layer. */
  addImage: () => void;
  /** Opens the file picker to put an image on a specific screen. */
  pickScreenImage: (slot: number) => void;
}

export interface PanelProps {
  actions: PanelActions;
}
