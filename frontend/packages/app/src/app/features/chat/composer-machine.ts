export type ComposerDelivery = "steer" | "queue";
export type ComposerMode = "prompt" | "shell";

export interface ComposerState {
  mode: ComposerMode;
  delivery: ComposerDelivery;
  submitting: boolean;
  attachment: {
    busy: boolean;
    error: string;
  };
}

export type ComposerEvent =
  | { type: "mode.set"; mode: ComposerMode }
  | { type: "delivery.set"; delivery: ComposerDelivery }
  | { type: "submit.start" }
  | { type: "submit.settle" }
  | { type: "attachment.start" }
  | { type: "attachment.finish" }
  | { type: "attachment.error"; message: string };

export function createComposerState(delivery: ComposerDelivery): ComposerState {
  return {
    mode: "prompt",
    delivery,
    submitting: false,
    attachment: { busy: false, error: "" },
  };
}

/**
 * The composer's own phases: prompt or shell mode, steer or queue delivery, the
 * one-tick submit gate, and the attachment picker's busy/error pair. Text,
 * menus and history stay in the component because they are draft content.
 */
export function transitionComposer(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case "mode.set":
      return state.mode === event.mode ? state : { ...state, mode: event.mode };
    case "delivery.set":
      return state.delivery === event.delivery ? state : { ...state, delivery: event.delivery };
    case "submit.start":
      return state.submitting ? state : { ...state, submitting: true };
    case "submit.settle":
      return state.submitting ? { ...state, submitting: false } : state;
    case "attachment.start":
      if (state.attachment.busy && !state.attachment.error) return state;
      return { ...state, attachment: { busy: true, error: "" } };
    case "attachment.finish":
      return state.attachment.busy ? { ...state, attachment: { ...state.attachment, busy: false } } : state;
    case "attachment.error":
      if (state.attachment.error === event.message) return state;
      return { ...state, attachment: { ...state.attachment, error: event.message } };
  }
}
