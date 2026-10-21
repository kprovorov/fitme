import { ArrowRight } from "lucide-react";
import { Button } from "./button";

// Compiled by the app's normal tsc/Next build, never imported at runtime.
export function buttonTypecheckCases() {
  const valid = [
    <Button key="pill">Continue</Button>,
    <Button
      icon={ArrowRight}
      iconPosition="trailing"
      key="trailing"
      size="lg"
      variant="secondary"
    >
      Continue
    </Button>,
    <Button
      aria-label="Next"
      icon={<ArrowRight />}
      key="circle"
      shape="circle"
      size="sm"
      variant="ghost"
    />,
    <Button asChild icon={ArrowRight} key="link">
      <a href="/support">Support</a>
    </Button>,
  ];

  const invalid = [
    // @ts-expect-error FIT-209 removes outline.
    <Button key="invalid-1" variant="outline">
      Continue
    </Button>,
    // @ts-expect-error FIT-209 removes link.
    <Button key="invalid-2" variant="link">
      Continue
    </Button>,
    // @ts-expect-error Icons use shape="circle", never an icon size.
    <Button key="invalid-3" size="icon">
      Continue
    </Button>,
    // @ts-expect-error Removed shadcn size.
    <Button key="invalid-4" size="icon-sm">
      Continue
    </Button>,
    // @ts-expect-error Removed shadcn size.
    <Button key="invalid-5" size="icon-xs">
      Continue
    </Button>,
    // @ts-expect-error Only pill and circle are supported.
    <Button key="invalid-6" shape="square">
      Continue
    </Button>,
    // @ts-expect-error Only leading and trailing are supported.
    <Button iconPosition="left" key="invalid-7">
      Continue
    </Button>,
    // @ts-expect-error A circle requires an icon.
    <Button aria-label="Next" key="invalid-8" shape="circle" />,
    // @ts-expect-error A circle requires aria-label.
    <Button icon={ArrowRight} key="invalid-9" shape="circle" />,
    // @ts-expect-error A null icon cannot satisfy a circle's icon requirement.
    <Button aria-label="Next" icon={null} key="invalid-10" shape="circle" />,
    // @ts-expect-error A circle has no visible label.
    <Button aria-label="Next" icon={ArrowRight} key="invalid-11" shape="circle">
      Next
    </Button>,
    // @ts-expect-error A circle has no label to position an icon around.
    <Button
      aria-label="Next"
      icon={ArrowRight}
      iconPosition="trailing"
      key="invalid-12"
      shape="circle"
    />,
    // @ts-expect-error An icon-only pill must be a circle.
    <Button icon={ArrowRight} key="invalid-13" />,
  ];
  return { invalid, valid };
}
