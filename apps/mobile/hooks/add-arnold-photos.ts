import { captureException } from "@sentry/react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import {
  addArnoldAttachments,
  arnoldAttachmentsOwner,
  MAX_ATTACHMENTS_PER_CONVERSATION,
  MAX_ATTACHMENTS_PER_MESSAGE,
  useIsConversationFull,
  useRemainingAttachmentSlots,
} from "~/hooks/arnold-attachments";
import { pickLibraryPhotos, takePhoto } from "~/lib/arnold-attachment-picker";
import { openAppSettings } from "~/lib/external-links";

/**
 * Adding a photo to Arnold's next message (ADR 0018), from the camera or the
 * library: the one place both are run, shared by the Attachments sheet and
 * the redesign's "+" menu, so the two ask for the same slots, add the same
 * thumbnails and fail the same way.
 *
 * `onAdded` runs once something was added (the sheet closes itself), and
 * `onFailed` once nothing the User picked or took could be read (the sheet
 * says so inside itself, the menu in a toast). A cancelled picker or camera
 * calls neither.
 */
/**
 * Whether the User a pick started for is still the one signed in: what comes
 * back for someone who has since signed out is dropped by the store, and
 * nothing is said about it to whoever is signed in now.
 */
const isStillFor = (startedFor: string | null) =>
  arnoldAttachmentsOwner() === startedFor;

export const useAddArnoldPhotos = ({
  onAdded,
  onFailed,
}: {
  onAdded?: () => void;
  onFailed: () => void;
}) => {
  const { t } = useTranslation();
  const remaining = useRemainingAttachmentSlots();
  // Nothing more fits: both ways in are disabled and say why, so the cap is
  // met before anything opens rather than when the send fails.
  const isFull = remaining <= 0;
  const isConversationFull = useIsConversationFull();
  // While the camera or the system picker is up and what came back is being
  // re-encoded: a second tap landing beside it would open another one.
  const [isPicking, setIsPicking] = useState(false);

  // Which cap is full: the Conversation's is the one to say, since it holds
  // whatever the User does next with this message (ADR 0018).
  const fullMessage = isConversationFull
    ? t("arnold.attachments.conversationFull", {
        count: MAX_ATTACHMENTS_PER_CONVERSATION,
      })
    : t("arnold.attachments.perMessageLimit", {
        count: MAX_ATTACHMENTS_PER_MESSAGE,
      });

  const pickPhotos = useCallback(async () => {
    // The picker reads 0 as "no limit", so it is never opened without room.
    if (remaining <= 0) {
      return;
    }

    setIsPicking(true);
    // Read before the await: the picker and the re-encoding take a while,
    // and the store drops what comes back for a User who has signed out.
    const startedFor = arnoldAttachmentsOwner();

    try {
      const picked = await pickLibraryPhotos(remaining);

      // Cancelled: nothing picked, nothing to say.
      if (picked) {
        if (picked.images.length > 0) {
          addArnoldAttachments(picked.images, startedFor);
          onAdded?.();
        } else if (picked.failed > 0 && isStillFor(startedFor)) {
          onFailed();
        }
      }
    } catch (error) {
      // The picker itself failed, which is rarer than a photo failing.
      captureException(error);

      if (isStillFor(startedFor)) {
        onFailed();
      }
    }

    setIsPicking(false);
  }, [onAdded, onFailed, remaining]);

  const openCamera = useCallback(async () => {
    // Never opened without room, so a photo is never taken for nothing.
    if (remaining <= 0) {
      return;
    }

    setIsPicking(true);
    // Read before the await, as the picker does: taking a photo takes a
    // while, and the store drops what comes back for a User who has since
    // signed out.
    const startedFor = arnoldAttachmentsOwner();

    try {
      const photo = await takePhoto();

      if (photo.status === "denied" && isStillFor(startedFor)) {
        // iOS only asks once, so there is nothing left to tap in the app:
        // the alert takes the User where they can turn it back on.
        Alert.alert(
          t("arnold.attachments.cameraDenied.title"),
          t("arnold.attachments.cameraDenied.message"),
          [
            { style: "cancel", text: t("common.cancel") },
            {
              onPress: () => {
                void openAppSettings();
              },
              text: t("arnold.attachments.cameraDenied.openSettings"),
            },
          ]
        );
      } else if (photo.status === "taken") {
        addArnoldAttachments([photo.image], startedFor);
        onAdded?.();
      }
      // Cancelled: nothing taken, nothing to say.
    } catch (error) {
      // No camera (the simulator), or a photo the re-encoder can't read.
      captureException(error);

      if (isStillFor(startedFor)) {
        onFailed();
      }
    }

    setIsPicking(false);
  }, [onAdded, onFailed, remaining, t]);

  return { fullMessage, isFull, isPicking, openCamera, pickPhotos };
};
