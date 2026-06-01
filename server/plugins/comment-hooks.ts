import { commentService } from '../database/comments'

export default defineNitroPlugin(() => {
  addAction('record.delete', async (recordType: string, recordId: number) => {
    await commentService.deleteForRecord(recordType, recordId)
  })
})
