import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from "react-native";

import { SymbolImage } from "@/components/symbol-image";
import { Image } from "@/components/tw";

/**
 * The pager, so a test can swipe it: paging is a native scroll, which no tap
 * stands in for.
 */
export const SENT_PHOTOS_PAGER = "sent-photos-pager";

/**
 * How far a photo zooms in. A plan screenshot is read at the top of that
 * range, so it goes past the point where the JPEG the app sent (1600 px on
 * its longest side) still has pixels of its own to show.
 */
const MAX_ZOOM = 4;

/** One Attachment of the message, as the viewer has it. */
export interface ShownPhoto {
  /** Its identity within the message, for the page's key. */
  id: string;
  /** Its device copy's name, which is what finds the photo on this device. */
  name: string;
}

/**
 * What stands for a photo there is nothing to draw: a copy this device never
 * had, or one it has but can't decode. It is the bubble's Photo tile, in the
 * page the photo would have filled, so the message's photos keep their
 * places and their numbers whichever of them this device is missing.
 */
const MissingPhoto = ({ label }: { label: string }) => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={label}
      accessible
      className="flex-1 items-center justify-center gap-2"
    >
      <SymbolImage
        className="text-muted-foreground text-large-title"
        name="photo"
      />
      <Text className="text-muted-foreground text-body dark:text-muted-foreground">
        {t("arnold.attachments.photo")}
      </Text>
    </View>
  );
};

/**
 * One page: the photo, as large as it fits, zoomable by pinch. The zoom is
 * the scroll view's own (`maximumZoomScale`), so pinching, panning a zoomed
 * photo and springing back are UIKit's rather than a gesture of ours. That is
 * iOS-only: an Android build shows the photos and pages between them but
 * doesn't zoom (the platform order `docs/agents/ui.md` sets out).
 *
 * The content is exactly the page, so nothing scrolls until it's zoomed.
 */
const Photo = ({
  height,
  label,
  photo,
  uriFor,
  width,
}: {
  height: number;
  label: string;
  photo: ShownPhoto;
  uriFor: (name: string) => string | undefined;
  width: number;
}) => {
  const [uri, setUri] = useState(() => uriFor(photo.name));
  // A copy nothing can be drawn from: one this device never had, or one it
  // has but can't decode (a copy the disk cut short), which only loading it
  // finds out. The tile stands for it then, rather than a blank page with a
  // title over it.
  const [unreadable, setUnreadable] = useState(false);

  // A copy that moved while this page was on screen is not a copy that's
  // gone: a first message's go from `pending` to the session's directory as
  // soon as eve names it. So a photo that fails to load is looked for once
  // more before the tile stands in for it.
  const onError = useCallback(() => {
    const moved = uriFor(photo.name);

    if (moved !== undefined && moved !== uri) {
      setUri(moved);

      return;
    }

    setUnreadable(true);
  }, [photo.name, uri, uriFor]);

  const page = { height, width };

  if (uri === undefined || unreadable) {
    return (
      <View style={page}>
        <MissingPhoto label={label} />
      </View>
    );
  }

  return (
    <ScrollView
      centerContent
      contentContainerStyle={page}
      maximumZoomScale={MAX_ZOOM}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={page}
    >
      <Image
        accessibilityLabel={label}
        // `accessible`, or the label sits on a view VoiceOver never stops at:
        // expo-image's `isAccessibilityElement` is `accessible ?? false`.
        accessible
        contentFit="contain"
        onError={onError}
        source={{ uri }}
        style={page}
      />
    </ScrollView>
  );
};

/**
 * The Attachments one message of the User's carried, as large as the Screen
 * holds: one page per Attachment in the order they were sent, swiped between
 * and pinch-zoomable (ADR 0018). Each page is drawn from the device copy the
 * Conversation keeps, which is the only place an Attachment's bytes are once
 * it has been sent.
 *
 * Every Attachment of the message gets its page, the ones this device has no
 * copy for included, so a photo is always the number its bubble gave it and
 * the one that was tapped is always the one that opens.
 *
 * The pages are the size this View is given rather than the window's, so the
 * header never covers the top of a photo: a screenshot of a phone is the
 * shape of the screen, so fitted to the window it would fill it and lose its
 * first lines under the header, which is the one thing a plan screenshot is
 * opened to read. The window is only the size to start from, for the render
 * before the first layout.
 *
 * The page the viewer is on is reported back, so the Screen names the photo
 * being looked at in its header.
 */
export const SentPhotosView = ({
  initialIndex,
  labelFor,
  onPageChange,
  photos,
  uriFor,
}: {
  /** Which photo to open on, its place among `photos`. */
  initialIndex: number;
  /** How the photo at a place is named, for VoiceOver. */
  labelFor: (index: number) => string;
  onPageChange: (index: number) => void;
  photos: readonly ShownPhoto[];
  /** Where a photo's copy is on this device now, asked for by its name. */
  uriFor: (name: string) => string | undefined;
}) => {
  const window = useWindowDimensions();

  const [measured, setMeasured] = useState<{
    height: number;
    width: number;
  } | null>(null);

  const pager = useRef<ScrollViewInstance>(null);

  // Android ignores `contentOffset`, so the opening page is scrolled to on
  // the first layout, where the pager has a width to scroll by. Once: a later
  // run would pull the User back off the photo they swiped to.
  const opened = useRef(false);

  const { height, width } = measured ?? window;

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const size = event.nativeEvent.layout;

      setMeasured((current) =>
        current?.height === size.height && current?.width === size.width
          ? current
          : { height: size.height, width: size.width }
      );

      if (!(opened.current || initialIndex === 0) && size.width > 0) {
        opened.current = true;
        pager.current?.scrollTo({
          animated: false,
          x: initialIndex * size.width,
          y: 0,
        });
      }
    },
    [initialIndex]
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onPageChange(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    [onPageChange, width]
  );

  return (
    <ScrollView
      contentOffset={{ x: initialIndex * width, y: 0 }}
      horizontal
      onLayout={onLayout}
      onMomentumScrollEnd={onMomentumScrollEnd}
      pagingEnabled
      ref={pager}
      showsHorizontalScrollIndicator={false}
      testID={SENT_PHOTOS_PAGER}
    >
      {photos.map((photo, index) => (
        <Photo
          height={height}
          key={photo.id}
          label={labelFor(index)}
          photo={photo}
          uriFor={uriFor}
          width={width}
        />
      ))}
    </ScrollView>
  );
};
