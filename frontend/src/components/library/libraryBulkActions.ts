import type { Paper } from '../../types'

export async function runBulkPaperAction(
  papers: Paper[],
  action: (paper: Paper) => Promise<unknown>,
): Promise<{ succeeded: Paper[]; failed: Paper[] }> {
  const results = await Promise.allSettled(papers.map((paper) => action(paper)))
  return results.reduce<{ succeeded: Paper[]; failed: Paper[] }>((acc, result, index) => {
    acc[result.status === 'fulfilled' ? 'succeeded' : 'failed'].push(papers[index])
    return acc
  }, { succeeded: [], failed: [] })
}
