import test from 'node:test'
import { deepEqual } from 'node:assert'
// import sinon from 'sinon'
import { mockClient } from 'aws-sdk-client-mock'
import { SNSClient, PublishBatchCommand } from '@aws-sdk/client-sns'

import { pipeline, createReadableStream } from '@datastream/core'

import { awsSNSSetClient, awsSNSPublishMessageStream } from '@datastream/aws'

let variant = 'unknown'
for (const execArgv of process.execArgv) {
  const flag = '--conditions='
  if (execArgv.includes(flag)) {
    variant = execArgv.replace(flag, '')
  }
}

test(`${variant}: awsSNSPublishMessageStream should put chunk`, async (t) => {
  const client = mockClient(SNSClient)
  awsSNSSetClient(client)

  const input = [{ id: 'x' }]
  const options = {
    // TODO
  }

  client.on(PublishBatchCommand).resolves({}) // TODO

  const stream = [
    createReadableStream(input),
    awsSNSPublishMessageStream(options)
  ]
  const result = await pipeline(stream)

  deepEqual(result, {})
})
