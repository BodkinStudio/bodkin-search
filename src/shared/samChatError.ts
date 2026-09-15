import { z } from "zod";

const errorShape = z.object({ message: z.string() });

export function samChatErrorMessage(error: unknown): string {
  const parsed = errorShape.safeParse(error);
  const message =
    typeof error === "string"
      ? error
      : parsed.success
        ? parsed.data.message
        : "";
  if (/in.flight.*(budget|requests)|budget.*in.flight/i.test(message)) {
    return "OpenRouter temporarily blocked this request because other running requests have reserved the available credit allowance. Wait two minutes for them to finish, then continue this task. If it keeps happening, check your OpenRouter credits and other active chats.";
  }
  if (
    /insufficient credits|not enough credits|requires more credits/i.test(
      message,
    )
  ) {
    return "OpenRouter could not fund this request. Check the available credits and spending limit for your OpenRouter key, then continue this task.";
  }
  if (/rate.limit|too many requests/i.test(message)) {
    return "The AI provider is limiting requests. Wait a little, then continue this task.";
  }
  return "SAM couldn’t finish this response. You can continue the task below. Check any completed tool results before requesting the same work again.";
}
