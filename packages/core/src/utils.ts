import type {
  Difficulty,
  Equipment,
  LegacyEquipment,
  LegacyMuscleGroup,
  MovementPattern,
  MuscleGroup,
} from "./models";

export const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const INCHES_PER_FOOT = 12;

/** Splits a total height in inches into whole feet and inches, rounding to the nearest inch. */
export const inchesToFeetAndInches = (totalInches: number) => {
  const rounded = Math.round(totalInches);

  return {
    feet: Math.floor(rounded / INCHES_PER_FOOT),
    inches: rounded % INCHES_PER_FOOT,
  };
};

export const feetAndInchesToInches = (feet: number, inches: number): number =>
  feet * INCHES_PER_FOOT + inches;

export const legacyMuscleGroupToName = (
  muscleGroup: LegacyMuscleGroup
): string => {
  switch (muscleGroup) {
    case "chest": {
      return "Chest";
    }

    case "back": {
      return "Back";
    }

    case "shoulders": {
      return "Shoulders";
    }

    case "biceps": {
      return "Biceps";
    }

    case "triceps": {
      return "Triceps";
    }

    case "forearms": {
      return "Forearms";
    }

    case "abs": {
      return "Abs";
    }

    case "obliques": {
      return "Obliques";
    }

    case "quadriceps": {
      return "Quadriceps";
    }

    case "hamstrings": {
      return "Hamstrings";
    }

    case "glutes": {
      return "Glutes";
    }

    case "calves": {
      return "Calves";
    }

    case "traps": {
      return "Traps";
    }

    case "lats": {
      return "Lats";
    }

    case "lower-back": {
      return "Lower Back";
    }

    case "cardio": {
      return "Cardio";
    }

    case "full-body": {
      return "Full Body";
    }

    default: {
      return muscleGroup;
    }
  }
};

/** The English name of a piece of Equipment, for the servers (MCP, Arnold). */
export const legacyEquipmentToName = (item: LegacyEquipment): string => {
  switch (item) {
    case "barbell": {
      return "Barbell";
    }

    case "dumbbell": {
      return "Dumbbell";
    }

    case "cable": {
      return "Cable";
    }

    case "machine": {
      return "Machine";
    }

    case "smith_machine": {
      return "Smith machine";
    }

    case "bench": {
      return "Bench";
    }

    case "pull_up_bar": {
      return "Pull-up bar";
    }

    case "landmine": {
      return "Landmine";
    }

    case "bodyweight": {
      return "Bodyweight";
    }

    default: {
      return item;
    }
  }
};

const MUSCLE_GROUP_NAMES: Record<MuscleGroup, string> = {
  adductors: "Adductors",
  back: "Back",
  biceps: "Biceps",
  calves: "Calves",
  chest: "Chest",
  core: "Core",
  forearms: "Forearms",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  "lower-back": "Lower back",
  neck: "Neck",
  quadriceps: "Quadriceps",
  shoulders: "Shoulders",
  tibialis: "Tibialis",
  traps: "Traps",
  triceps: "Triceps",
};

/** The English name of a Muscle group, for the servers (MCP, Arnold). */
export const muscleGroupToName = (muscleGroup: MuscleGroup): string =>
  MUSCLE_GROUP_NAMES[muscleGroup];

const EQUIPMENT_NAMES: Record<Equipment, string> = {
  backpack: "Backpack",
  band: "Band",
  barbell: "Barbell",
  battle_ropes: "Battle ropes",
  bench: "Bench",
  bicycle: "Bicycle",
  bodyweight: "Bodyweight",
  box: "Box",
  cable: "Cable",
  dowel: "Dowel",
  dumbbell: "Dumbbell",
  foam_roller: "Foam roller",
  kettlebell: "Kettlebell",
  machine: "Machine",
  medicine_ball: "Medicine ball",
  parallel_bars: "Parallel bars",
  pull_up_bar: "Pull-up bar",
  sled: "Sled",
  slider: "Slider",
  stability_ball: "Stability ball",
  towel: "Towel",
  trx: "TRX",
  weight_plate: "Weight plate",
  wrist_roller: "Wrist roller",
};

/** The English name of a piece of Equipment, for the servers (MCP, Arnold). */
export const equipmentToName = (item: Equipment): string =>
  EQUIPMENT_NAMES[item];

const MOVEMENT_PATTERN_NAMES: Record<MovementPattern, string> = {
  cardio: "Cardio",
  carry: "Carry",
  core: "Core",
  hinge: "Hinge",
  hip_abduction: "Hip abduction",
  isolation: "Isolation",
  lunge: "Lunge",
  mobility: "Mobility",
  plyometric: "Plyometric",
  pull: "Pull",
  push: "Push",
  rotation: "Rotation",
  squat: "Squat",
  stretch: "Stretch",
};

/** The English name of a movement pattern, for the servers (MCP, Arnold). */
export const movementPatternToName = (pattern: MovementPattern): string =>
  MOVEMENT_PATTERN_NAMES[pattern];

const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  advanced: "Advanced",
  beginner: "Beginner",
  intermediate: "Intermediate",
};

/** The English name of a Difficulty, for the servers (MCP, Arnold). */
export const difficultyToName = (difficulty: Difficulty): string =>
  DIFFICULTY_NAMES[difficulty];
