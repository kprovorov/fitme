import { AppStoreBadge } from "@/components/app-store-badge";
import { PhoneShot } from "@/components/phone-shot";
import { Container } from "@/components/ui/container";
import exerciseShot from "@/public/screens/exercise-detail.png";
import homeShot from "@/public/screens/home.png";
import plannerShot from "@/public/screens/planner.png";

function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="w-full">
      <Container className="flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-bold text-4xl" id="hero-heading">
            AI Workout Tracker & Fitness Coach for iPhone
          </h1>
          <p className="text-balance text-2xl">
            Generate personalized workout plans, track every rep, and crush your
            fitness goals with Fitme — the smart AI fitness app.
          </p>
        </div>
        <AppStoreBadge />

        <div className="relative flex w-full justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="aspect-square w-full max-w-100 rounded-full bg-primary opacity-10 blur-3xl sm:max-w-200" />
          </div>
          <div className="absolute inset-0 hidden items-center justify-evenly sm:flex">
            <div className="w-52 md:w-64 lg:w-75">
              <PhoneShot
                alt="Fitme planner: pick a goal, experience level, workout length and place"
                sizes="(min-width: 1024px) 300px, 256px"
                src={plannerShot}
              />
            </div>
            <div className="w-52 md:w-64 lg:w-75">
              <PhoneShot
                alt="Exercise detail for Bench Press: an illustration of the movement with the worked muscles highlighted, and step-by-step instructions"
                sizes="(min-width: 1024px) 300px, 256px"
                src={exerciseShot}
              />
            </div>
          </div>
          <div className="relative w-full max-w-100">
            <PhoneShot
              alt="Fitme home screen: the active Upper / Lower plan with the workout in progress and the next workouts"
              priority
              sizes="400px"
              src={homeShot}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

export { Hero };
