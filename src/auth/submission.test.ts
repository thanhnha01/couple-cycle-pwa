import { describe, expect, it, vi } from "vitest";
import { SubmissionController } from "./submission";

describe("SubmissionController", () => {
  it("exposes loading then success", async () => {
    const states: string[] = [];
    const controller = new SubmissionController();
    await controller.run(async () => undefined, (state) => states.push(state));
    expect(states).toEqual(["loading", "success"]);
    expect(controller.state).toBe("success");
  });

  it("prevents duplicate submission while an action is pending", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const action = vi.fn(() => pending);
    const controller = new SubmissionController();
    const first = controller.run(action);
    await expect(controller.run(action)).resolves.toBe(false);
    expect(action).toHaveBeenCalledOnce();
    release?.();
    await expect(first).resolves.toBe(true);
  });

  it("exposes an error state when the action fails", async () => {
    const controller = new SubmissionController();
    await expect(controller.run(async () => { throw new Error("failure"); })).rejects.toThrow("failure");
    expect(controller.state).toBe("error");
  });
});
