import type { HarryMood } from "./harry-moods";

/*
 * Sculpted Harry model. When `url` is set, Harry3D loads this rigged .glb
 * (made from the mascot sticker, animations from Meshy or Mixamo) and only
 * falls back to the code-built rig if it cannot load.
 *
 * Put the file in public/models/ and set url: "/models/harry.glb".
 * Animation clips are matched to moods by name ("Waving" → wave, "Idle" →
 * happy…); use `clips` to pin a mood to an exact clip name when a guess is off.
 */
export type HarryModelConfig = {
  url: string;
  clips?: Partial<Record<HarryMood, string>>;
  /** Extra turn (radians) if the model does not face the camera (+z). */
  yawOffset?: number;
};

export const harryModel: HarryModelConfig | null = null;
