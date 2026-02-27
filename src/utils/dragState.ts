/** Module-level drag state — readable during dragover (unlike dataTransfer.getData) */
export const activeDrag: {
  type: 'task' | 'block' | 'event' | null;
  duration: number;
  color: string;
} = {
  type: null,
  duration: 15,
  color: '#8DA286',
};
