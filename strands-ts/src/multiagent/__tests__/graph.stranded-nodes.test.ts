import { describe, expect, it } from 'vitest'
import { Agent } from '../../agent/agent.js'
import { MockMessageModel } from '../../__fixtures__/mock-message-model.js'
import { TextBlock } from '../../types/messages.js'
import { Status } from '../state.js'
import { Graph } from '../graph.js'

function makeAgent(id: string): Agent {
  const model = new MockMessageModel().addTurn(new TextBlock('reply')).addTurn(new TextBlock('reply'))
  return new Agent({ model, printer: false, id })
}

const ranIds = (result: { results: { nodeId: string }[] }): string[] =>
  result.results.map((nodeResult) => nodeResult.nodeId)

// https://github.com/strands-agents/harness-sdk/issues/5670
describe('Graph join and loop dependencies', () => {
  it('runs a merge node when both branches are taken', async () => {
    const graph = new Graph({
      nodes: ['r', 'a', 'b', 'm'].map(makeAgent),
      edges: [
        ['r', 'a'],
        ['r', 'b'],
        ['a', 'm'],
        ['b', 'm'],
      ],
    })

    const result = await graph.invoke('go')

    expect(ranIds(result)).toStrictEqual(['r', 'a', 'b', 'm'])
  })

  it('runs a merge node when one branch of an either/or is not taken', async () => {
    const graph = new Graph({
      nodes: ['r', 'a', 'b', 'm'].map(makeAgent),
      edges: [
        { source: 'r', target: 'a', handler: () => true },
        { source: 'r', target: 'b', handler: () => false },
        ['a', 'm'],
        ['b', 'm'],
      ],
    })

    const result = await graph.invoke('go')

    expect(ranIds(result)).toStrictEqual(['r', 'a', 'm'])
    expect(result.status).toBe(Status.COMPLETED)
  })

  it('runs a merge node when an entire chain behind the untaken branch is skipped', async () => {
    const graph = new Graph({
      nodes: ['r', 'a', 'b', 'c', 'm'].map(makeAgent),
      edges: [
        { source: 'r', target: 'a', handler: () => true },
        { source: 'r', target: 'b', handler: () => false },
        ['b', 'c'],
        ['a', 'm'],
        ['c', 'm'],
      ],
    })

    const result = await graph.invoke('go')

    expect(ranIds(result)).toStrictEqual(['r', 'a', 'm'])
  })

  it('does not run a merge node when no incoming edge fires', async () => {
    const graph = new Graph({
      nodes: ['r', 'a', 'b', 'm'].map(makeAgent),
      edges: [
        { source: 'r', target: 'a', handler: () => false },
        { source: 'r', target: 'b', handler: () => false },
        ['a', 'm'],
        ['b', 'm'],
      ],
    })

    const result = await graph.invoke('go')

    expect(ranIds(result)).toStrictEqual(['r'])
  })

  it('runs a loop node that has a forward edge and a back edge, revisiting it until the back edge stops', async () => {
    let visits = 0
    const graph = new Graph({
      nodes: ['s', 'd', 'rv'].map(makeAgent),
      edges: [['s', 'd'], ['d', 'rv'], { source: 'rv', target: 'd', handler: () => ++visits < 2 }],
      sources: ['s'],
    })

    const result = await graph.invoke('go')

    expect(ranIds(result)).toStrictEqual(['s', 'd', 'rv', 'd', 'rv'])
    expect(result.status).toBe(Status.COMPLETED)
  })
})
