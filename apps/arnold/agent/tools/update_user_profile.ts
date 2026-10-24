import { genders, measurementSystems } from "@fitme/core/models";
import { asUser } from "@fitme/db";
import { updateProfile } from "@fitme/services/profile";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Update the user's profile. All fields are optional — only provide the fields that need to change. Changing measurement_system converts every stored height and weight (profile, plans, workout history) to the new units; give height and weight in the new system's units.",
  async execute(changes, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const profile = await asUser(userId, (tx) =>
      updateProfile(tx, userId, changes)
    );
    return profile
      ? { profile, success: true }
      : { error: "Profile not found" };
  },
  inputSchema: z.object({
    age: z.number().int().min(10).max(120).optional(),
    gender: z.enum(genders).optional(),
    height: z.number().positive().optional(),
    measurement_system: z.enum(measurementSystems).optional(),
    weight: z.number().positive().optional(),
  }),
});
