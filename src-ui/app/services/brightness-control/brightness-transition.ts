import { CancellableTask } from '../../utils/cancellable-task';
import { clamp } from '../../utils/number-utils';
import { info, warn } from 'tauri-plugin-log-api';
import { SetBrightnessOptions, SetBrightnessReason } from './brightness-control-models';

interface BrightnessTransitionTaskOptions {
  frequency: number;
  logReason: SetBrightnessReason | null;
}

const DEFAULT_BRIGHTNESS_TRANSITION_TASK_OPTIONS: BrightnessTransitionTaskOptions = {
  frequency: 60,
  logReason: null,
};

export class BrightnessTransitionTask extends CancellableTask {
  private options: BrightnessTransitionTaskOptions;

  constructor(
    public readonly type: 'DISPLAY' | 'IMAGE' | 'SIMPLE',
    private setBrightness: (
      percentage: number,
      options?: Partial<SetBrightnessOptions>
    ) => Promise<void>,
    private getBrightness: () => Promise<number | undefined>,
    private getBrightnessBounds: () => Promise<[number, number]>,
    public readonly targetBrightness: number,
    public readonly duration: number,
    options: Partial<BrightnessTransitionTaskOptions> = DEFAULT_BRIGHTNESS_TRANSITION_TASK_OPTIONS
  ) {
    super();
    this.work = this.task.bind(this);
    this.options = { ...DEFAULT_BRIGHTNESS_TRANSITION_TASK_OPTIONS, ...(options ?? {}) };
  }

  private async task(task: CancellableTask): Promise<void> {
    const label = this.type.toLowerCase();
    // Ensure the target brightness is within the bounds of the brightness control
    const [min, max] = await this.getBrightnessBounds();
    const clampedBrightness = clamp(this.targetBrightness, min, max);
    if (clampedBrightness != this.targetBrightness) {
      warn(
        `[BrightnessControl] Attempted to transition to out-of-bounds ${label} brightness (Target: ${
          this.targetBrightness
        }%, Duration: ${this.duration}ms, Reason: ${this.options.logReason ?? 'NONE'})`
      );
    }
    // Get the current brightness
    const currentBrightness = await this.getBrightness();
    if (currentBrightness === undefined) {
      warn(
        `[BrightnessControl] Could not start ${label} brightness transition as current ${label} brightness was unavailable. (Reason: ${
          this.options.logReason ?? 'NONE'
        })`
      );
      throw 'BRIGHTNESS_UNAVAILABLE';
    }
    // Start transitioning
    const startTime = Date.now();
    while (Date.now() <= startTime + this.duration) {
      // Sleep to match the frequency
      await new Promise((resolve) => setTimeout(resolve, 1000 / this.options.frequency!));
      // Stop if the transition was cancelled
      if (task.isCancelled() && this.options.logReason) {
        info(
          `[BrightnessControl] Cancelled running ${label} brightness transition (${currentBrightness}%=>${clampedBrightness}%, ${this.duration}ms, Reason: ${this.options.logReason})`
        );
        return;
      }
      // Calculate the required brightness
      const timeExpired = Date.now() - startTime;
      const progress = clamp(timeExpired / this.duration, 0, 1);
      const brightness = smoothLerp(currentBrightness, clampedBrightness, progress);
      // Set the intermediary brightness
      await this.setBrightness(brightness, {
        cancelActiveTransition: false,
        logReason: undefined,
      });
    }
    // Set the final target brightness
    await this.setBrightness(clampedBrightness, {
      cancelActiveTransition: false,
      logReason: undefined,
    });
    if (this.options.logReason) {
      await info(
        `[BrightnessControl] Finished ${label} brightness transition (${currentBrightness}%=>${clampedBrightness}%, ${this.duration}ms, Reason: ${this.options.logReason})`
      );
    }
  }
}

function smoothLerp(min: number, max: number, percent: number) {
  const t = percent * percent * (3 - 2 * percent); // cubic easing function
  return min + t * (max - min);
}
