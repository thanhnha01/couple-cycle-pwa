export type SubmissionState = "idle" | "loading" | "success" | "error";

export class SubmissionController {
  private currentState: SubmissionState = "idle";

  get state(): SubmissionState {
    return this.currentState;
  }

  async run(action: () => Promise<void>, onStateChange: (state: SubmissionState) => void = () => undefined): Promise<boolean> {
    if (this.currentState === "loading") return false;
    this.setState("loading", onStateChange);
    try {
      await action();
      this.setState("success", onStateChange);
      return true;
    } catch (error) {
      this.setState("error", onStateChange);
      throw error;
    }
  }

  private setState(state: SubmissionState, listener: (state: SubmissionState) => void): void {
    this.currentState = state;
    listener(state);
  }
}
