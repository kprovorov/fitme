import Image from "next/image";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";

export default function Home() {
  return (
    <div className="z-10 w-full">
      <VStack className="w-full gap-12 p-6">
        <VStack>
          <h1 className="text-center font-bold text-4xl">
            AI Workout Tracker & Fitness Coach for iPhone
          </h1>
          <h2 className="text-balance text-center text-2xl">
            Generate personalized workout plans, track every rep, and crush your
            fitness goals with Fitme — the smart AI fitness app.
          </h2>
        </VStack>
        <a href={process.env.NEXT_PUBLIC_APPSTORE_URL || ""}>
          <Image alt="appstore" height={45} src="/appstore.svg" width={151} />
        </a>
        <div className="relative h-[800px] w-full">
          <HStack className="absolute inset-x-0 top-0 z-20 items-center justify-center">
            <Image
              alt="Home Screen"
              fill={false}
              height={800}
              src="/screens/home.png"
              width={400}
            />
          </HStack>
          <HStack className="absolute inset-x-0 top-0 z-10 hidden h-full w-full items-center justify-evenly sm:flex">
            <Image
              alt="Workout Planner app"
              fill={false}
              height={600}
              src="/screens/planner.png"
              width={300}
            />
            <Image
              alt="Exercise Screen"
              fill={false}
              height={600}
              src="/screens/exercise.png"
              width={300}
            />
          </HStack>
          <HStack className="absolute inset-0 top-0 z-0 w-full items-center justify-center">
            <div className="h-[400px] w-[400px] rounded-full bg-primary opacity-10 blur-3xl sm:h-[800px] sm:w-[800px]" />
          </HStack>
        </div>
        <section aria-labelledby="chatgpt-heading" className="space-y-4">
          <h2 className="font-bold text-2xl" id="chatgpt-heading">
            Fitme for ChatGPT
          </h2>
          <p>
            Connect your Fitme account to search exercises, manage training
            plans, log workout sets, and review your workout history in ChatGPT.
            Your changes are saved to the same Fitme account you use in the app.
            The Fitme connection is free and requires sign-in.
          </p>
          <p>
            Provided by Kyrylo Provorov. See our{" "}
            <a className="underline" href="/support">
              support page
            </a>{" "}
            for help, or read our{" "}
            <a className="underline" href="/privacy-policy">
              privacy policy
            </a>{" "}
            and{" "}
            <a className="underline" href="/terms">
              terms of service
            </a>
            .
          </p>
        </section>
      </VStack>
    </div>
  );
}
