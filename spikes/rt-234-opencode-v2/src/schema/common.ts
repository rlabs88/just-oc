import { z } from "zod"

import { isPortableText } from "./content-safety.ts"

export const identifier = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

export const nonEmpty = z.string().trim().min(1).refine((value) => {
  return isPortableText(value)
}, { message: "Text contains a machine path, timestamp, or credential signature" })
export const preservedText = z.string().min(1).refine((value) => {
  return isPortableText(value)
}, { message: "Text contains a machine path, timestamp, or credential signature" })
export const scalar = nonEmpty.refine((value) => !value.includes("\n"), {
  message: "Scalar text cannot contain a newline",
})
export const uniqueScalars = z.array(scalar).superRefine((values, context) => {
  if (new Set(values).size === values.length) return
  context.addIssue({ code: "custom", message: "Values must be unique" })
})

export const uniqueIdentifiers = z.array(identifier).superRefine((values, context) => {
  if (new Set(values).size === values.length) return
  context.addIssue({ code: "custom", message: "Identifiers must be unique" })
})

export const semanticVersion = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/)

export const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const relativeLocator = scalar.refine((value) => {
  if (value.startsWith("/") || value.startsWith("~") || value.includes("\\")) return false
  if (value.split("/").includes("..")) return false
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
}, { message: "Source locator must be repository-relative" })

export const decisionReference = scalar.refine((value) => {
  return /^RT-\d+$/.test(value) || /^https:\/\/[^\s]+$/.test(value)
}, { message: "Decision reference must be a tracker ID or HTTPS URL" })
