import vine from '@vinejs/vine'
import { COURSE_STATUSES } from '#models/course'

const title = () => vine.string().trim().minLength(2).maxLength(160)
const description = () => vine.string().trim().maxLength(2000).nullable().optional()

export const createCourseValidator = vine.create({
  title: title(),
  description: description(),
})

export const updateCourseValidator = vine.create({
  title: title().optional(),
  description: description(),
  status: vine.enum(COURSE_STATUSES).optional(),
})

export const createModuleValidator = vine.create({
  title: title(),
  description: description(),
})

export const updateModuleValidator = vine.create({
  title: title().optional(),
  description: description(),
})

export const reorderModulesValidator = vine.create({
  moduleIds: vine.array(vine.number({ strict: true }).positive().withoutDecimals()).distinct(),
})
