import { BaseCommand } from '@adonisjs/core/ace'
import MaterialProcessingService from '#services/material_processing_service'
import MinioStorageProvider from '#services/minio_storage_provider'
import ProcessingJobService from '#services/processing_job_service'
import ProcessingWorker from '#services/processing_worker'

export default class ProcessMaterialJobs extends BaseCommand {
  static commandName = 'process:material-jobs'
  static description = 'Process private material derivative jobs'
  static options = { startApp: true }

  async run() {
    const storage = new MinioStorageProvider()
    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor: new MaterialProcessingService({ storage }),
      storage,
    })
    let stopping = false
    const stop = () => {
      stopping = true
    }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)

    try {
      while (!stopping) {
        if (!(await worker.runOnce())) {
          await wait(1_000)
        }
      }
    } finally {
      process.off('SIGTERM', stop)
      process.off('SIGINT', stop)
    }
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
