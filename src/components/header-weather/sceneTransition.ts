import type { DayPhase } from './types';

export type SceneState = { current: DayPhase | null; incoming: DayPhase | null; fading: boolean };
export type SceneAction =
  | { type: 'reset' }
  | { type: 'loaded'; phase: DayPhase }
  | { type: 'failed'; phase: DayPhase }
  | { type: 'show'; phase: DayPhase }
  | { type: 'finish'; phase: DayPhase };

export const initialScene: SceneState = { current: null, incoming: null, fading: false };

export function sceneReducer(state: SceneState, action: SceneAction): SceneState {
  if (action.type === 'reset') return initialScene;
  if (action.type === 'failed') return state.current === action.phase ? state : initialScene;
  if (action.type === 'loaded') {
    if (!state.current) return { current: action.phase, incoming: null, fading: false };
    if (state.current === action.phase) return { current: action.phase, incoming: null, fading: false };
    if (state.incoming === action.phase) return state;
    return { current: state.current, incoming: action.phase, fading: false };
  }
  if (state.incoming !== action.phase) return state;
  if (action.type === 'show') return { ...state, fading: true };
  return { current: action.phase, incoming: null, fading: false };
}
