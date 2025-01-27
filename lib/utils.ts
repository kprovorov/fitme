import { AxiosError, HttpStatusCode } from "axios";
import { FieldErrors, FieldValues } from "react-hook-form";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ServerError } from "./api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleAxiosError<T extends FieldValues>(
  error: AxiosError<ServerError<T>>,
  setMessage: (message: string) => void = () => {},
  setErrors: (errors: FieldErrors<T>) => void = () => {}
) {
  if (
    error.response?.status === HttpStatusCode.UnprocessableEntity &&
    error.response?.data.errors
  ) {
    setErrors(mapErrors(error.response.data.errors));
  } else {
    setMessage(
      error.response?.data.message ??
        "Something went wrong. Please try again later."
    );
  }
}

export function mapErrors<T extends FieldValues>(
  errors: Record<keyof T, string[]>
): FieldErrors<T> {
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [
      key,
      {
        type: "validate",
        message: value[0],
      },
    ])
  ) as FieldErrors<T>;
}
