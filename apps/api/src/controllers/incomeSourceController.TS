import { Request, Response } from 'express'
import {
  createIncomeSource,
  getIncomeSources,
  getIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
} from '../services/incomeSourceService'

import {
  createIncomeSourceSchema,
  updateIncomeSourceSchema,
} from '../utils/validation'

export async function createIncomeSourceController(
  req: Request,
  res: Response
) {
  try {
    const parsed = createIncomeSourceSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid income source data',
        details: parsed.error.flatten(),
      })
    }

    const userId = req.userId

    const incomeSource = await createIncomeSource(
      userId,
      parsed.data
    )

    return res.status(201).json(incomeSource)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Failed to create income source',
    })
  }
}

export async function listIncomeSourcesController(
  req: Request,
  res: Response
) {
  try {
    const userId = req.userId

    const incomeSources = await getIncomeSources(userId)

    return res.json(incomeSources)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Failed to fetch income sources',
    })
  }
}

export async function getIncomeSourceController(
  req: Request,
  res: Response
) {
  try {
    const userId = req.userId
const id = req.params.id

if (typeof id !== "string") {
  return res.status(400).json({
    error: "Invalid income source ID",
  })
}
    const incomeSource = await getIncomeSource(
      userId,
      id
    )

    if (!incomeSource) {
      return res.status(404).json({
        error: 'Income source not found',
      })
    }

    return res.json(incomeSource)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Failed to fetch income source',
    })
  }
}

export async function updateIncomeSourceController(
  req: Request,
  res: Response
) {
  try {
    const parsed = updateIncomeSourceSchema.safeParse(
      req.body
    )

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid income source data',
        details: parsed.error.flatten(),
      })
    }
    const userId = req.userId
    const id = req.params.id

if (typeof id !== "string") {
  return res.status(400).json({
    error: "Invalid income source ID",
  })
}

    const incomeSource = await updateIncomeSource(
      userId,
      id,
      parsed.data
    )

    if (!incomeSource) {
      return res.status(404).json({
        error: 'Income source not found',
      })
    }

    return res.json(incomeSource)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Failed to update income source',
    })
  }
}

export async function deleteIncomeSourceController(
  req: Request,
  res: Response
) {
  try {
    const userId = req.userId
    const id = req.params.id

if (typeof id !== "string") {
  return res.status(400).json({
    error: "Invalid income source ID",
  })
}

    const deleted = await deleteIncomeSource(
      userId,
      id
    )

    if (!deleted) {
      return res.status(404).json({
        error: 'Income source not found',
      })
    }

    return res.status(204).send()
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Failed to delete income source',
    })
  }
}