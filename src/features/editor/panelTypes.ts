export interface PanelActions {
  /** Opens the file picker to add an image layer. */
  addImage: () => void;
}

export interface PanelProps {
  actions: PanelActions;
}
