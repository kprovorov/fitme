import {
  verifyWebhook,
  type WebhookEvent,
} from "npm:@clerk/backend@^3/webhooks";

export interface ClerkWebhookDeps {
  deleteUserData: (userId: string) => Promise<void>;
  reportError: (error: unknown) => Promise<void>;
  signingSecret: string;
}

export function createClerkWebhookHandler({
  deleteUserData,
  reportError,
  signingSecret,
}: ClerkWebhookDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    let event: WebhookEvent;
    try {
      event = await verifyWebhook(req, { signingSecret });
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (event.type === "user.deleted" && event.data.id) {
      try {
        await deleteUserData(event.data.id);
      } catch (error) {
        await reportError(error);
        return Response.json({ error: "Cleanup failed" }, { status: 500 });
      }
    }

    return Response.json({ received: true });
  };
}
