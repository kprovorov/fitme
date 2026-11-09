import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import type {
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

/** How far a photo zooms in, as iOS's own pinch takes it. */
const MAX_ZOOM = 4;

/**
 * One photo, filling the screen and zoomable by pinch. The zoom is the
 * scroll view's own (`maximumZoomScale`), so pinching, panning a zoomed
 * photo and springing back are UIKit's, as they are in Photos, rather than a
 * gesture of ours: it is iOS-only, so an Android build shows the photo and
 * pages between them but doesn't zoom (ADR 0018's platform order).
 *
 * The content is exactly the viewport, so nothing scrolls until it's zoomed.
 */
const Photo = ({
  height,
  label,
  uri,
  width,
}: {
  height: number;
  label: string;
  uri: string;
  width: number;
}) => (
  <ScrollView
    centerContent
    contentContainerStyle={{ height, width }}
    maximumZoomScale={MAX_ZOOM}
    minimumZoomScale={1}
    showsHorizontalScrollIndicator={false}
    showsVerticalScrollIndicator={false}
    style={{ height, width }}
  >
    <Image
      accessibilityLabel={label}
      // `accessible`, or the label sits on a view VoiceOver never stops at:
      // expo-image's `isAccessibilityElement` is `accessible ?? false`.
      accessible
      className="bg-background"
      contentFit="contain"
      source={{ uri }}
      style={{ height, width }}
    />
  </ScrollView>
);

/**
 * What stands for a photo the viewer was opened on and then couldn't find:
 * its copy went off the device while the Conversation was on screen (a purge,
 * an account change). A bubble's own tile isn't tappable, so this is the race
 * rather than the usual missing copy, and it reads as the same thing.
 */
const MissingPhoto = () => {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-2">
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
 * The Attachments one message of the User's carried, full-screen: one page
 * per photo in the order they were sent, swiped between and pinch-zoomable
 * (ADR 0018). Each page is drawn from the device copy the Conversation keeps,
 * which is the only place an Attachment's bytes are after it was sent.
 *
 * The page the viewer opens on is reported back, so the Screen names the
 * photo being looked at in its header.
 */
export const SentPhotosView = ({
  initialIndex,
  labelFor,
  onPageChange,
  uris,
}: {
  /** Which photo to open on, already within `uris`. */
  initialIndex: number;
  /** How the photo at a position is named, for VoiceOver. */
  labelFor: (index: number) => string;
  onPageChange: (index: number) => void;
  uris: readonly string[];
}) => {
  const { height, width } = useWindowDimensions();
  const pager = useRef<ScrollViewInstance>(null);
  // Android ignores `contentOffset`, so the opening page is scrolled to once.
  // Once: a later run would pull the User back off the photo they swiped to.
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current || initialIndex === 0) {
      return;
    }

    opened.current = true;
    pager.current?.scrollTo({ animated: false, x: initialIndex * width, y: 0 });
  }, [initialIndex, width]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onPageChange(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    [onPageChange, width]
  );

  if (uris.length === 0) {
    return <MissingPhoto />;
  }

  return (
    <ScrollView
      contentOffset={{ x: initialIndex * width, y: 0 }}
      horizontal
      onMomentumScrollEnd={onMomentumScrollEnd}
      pagingEnabled
      ref={pager}
      showsHorizontalScrollIndicator={false}
      testID={SENT_PHOTOS_PAGER}
    >
      {uris.map((uri, index) => (
        <Photo
          height={height}
          key={uri}
          label={labelFor(index)}
          uri={uri}
          width={width}
        />
      ))}
    </ScrollView>
  );
};
