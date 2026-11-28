import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { useAddArnoldPhotos } from "~/hooks/add-arnold-photos";
import { showToast } from "~/lib/toast";

/**
 * The composer's "+" with the Arnold redesign on (Figma, the Arnold page's
 * composer frames): a native pull-down menu with Take Photo and Choose from
 * Library, one step shorter than the Attachments sheet it replaces. Each item
 * runs exactly what the sheet's Camera and Photos buttons run
 * (`useAddArnoldPhotos`).
 *
 * At a cap (ADR 0018) the menu still opens, with both items disabled and the
 * full one named under each, so the User learns why rather than meeting a
 * dead button. A photo that can't be read is said in a toast, since there is
 * no sheet left to say it in.
 */
export const AddPhotoMenu = () => {
  const { t } = useTranslation();

  const fail = useCallback(
    () => showToast(t("arnold.attachments.pickFailed")),
    [t]
  );

  const { fullMessage, isFull, isPicking, openCamera, pickPhotos } =
    useAddArnoldPhotos({ onFailed: fail });

  const disabled = isFull || isPicking;
  const subtitle = isFull ? fullMessage : undefined;

  return (
    <DropdownMenu
      accessibilityLabel={t("arnold.composer.addToChat")}
      // Take Photo on top, as Figma has it, though the menu opens upward.
      fixedOrder
      iconColorClassName="text-foreground"
      items={[
        {
          disabled,
          id: "take-photo",
          label: t("arnold.composer.takePhoto"),
          onPress: () => {
            void openCamera();
          },
          subtitle,
          systemImage: "camera",
        },
        {
          disabled,
          id: "choose-from-library",
          label: t("arnold.composer.chooseFromLibrary"),
          onPress: () => {
            void pickPhotos();
          },
          subtitle,
          systemImage: "photo.on.rectangle",
        },
      ]}
      systemImage="plus"
      testID="composer-add-photo"
    />
  );
};
