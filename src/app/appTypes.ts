export type CommunicationSurface = 'conversation' | 'star-inbox';

export type ToastPlacement = 'top' | 'bottom';

export type ToastOptions = {
  placement?: ToastPlacement;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export type ToastNotice = {
  id: number;
  message: string;
  placement: ToastPlacement;
  durationMs: number;
  actionLabel?: string;
  onAction?: () => void;
};

export type ToastHandler = (message: string, options?: ToastOptions) => void;

export type PhotoAssistResult = {
  titleSuggestion: string | null;
  optionalQuestions: string[];
};

export type PhotoAssistDelivery = {
  requestId: string;
  result: PhotoAssistResult;
};
