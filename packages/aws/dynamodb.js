import { createWritableStream, timeout } from '@datastream/core'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

import { Agent } from 'node:https'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import AWSXRay from 'aws-xray-sdk-core'
const {
  BatchGetCommand,
  BatchWriteCommand,
  QueryCommand,
  ScanCommand,
  DynamoDBDocumentClient
} = require('@aws-sdk/lib-dynamodb')

const awsClientDefaults = {
  requestHandler: new NodeHttpHandler({
    httpsAgent: new Agent({
      keepAlive: true,
      secureProtocol: 'TLSv1_2_method'
    })
  }),
  useFipsEndpoint: [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ca-central-1'
  ].includes(process.env.AWS_REGION)
}

let dynamodb = AWSXRay.captureAWSv3Client(
  new DynamoDBClient(awsClientDefaults)
)
let dynamodbDocument = DynamoDBDocumentClient.from(dynamodb)
export const awsDynamoDBSetClient = (client) => {
  dynamodb = client
  dynamodbDocument = DynamoDBDocumentClient.from(dynamodb)
}

// Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html

// options = {TableName, ...}

export const awsDynamoDBQueryStream = (options, streamOptions) => {
  async function * command (options) {
    let count = 1
    while (count) {
      const response = await dynamodbDocument.send(new QueryCommand(options))
      options.ExclusiveStartKey = response.LastEvaluatedKey
      count = response.Count
      for (const item of response.Items) {
        yield item
      }
    }
  }
  return command(options)
}

export const awsDynamoDBScanStream = async (options, streamOptions) => {
  async function * command (options) {
    let count = 1
    while (count) {
      const response = await dynamodbDocument.send(new ScanCommand(options))
      options.ExclusiveStartKey = response.LastEvaluatedKey
      count = response.Count
      for (const item of response.Items) {
        yield item
      }
    }
  }
  return command(options)
}

// max Keys.length = 100
export const awsDynamoDBGetStream = async (options, streamOptions) => {
  options.retryCount ??= 0
  options.retryMaxCount ??= 10
  async function * command (options) {
    while (true) {
      const response = await dynamodbDocument.send(
        new BatchGetCommand({
          RequestItems: {
            [options.TableName]: options
          }
        })
      )
      for (const item of response.Responses[options.TableName]) {
        yield item
      }
      const UnprocessedKeys =
        response?.UnprocessedKeys?.[options.TableName]?.Keys ?? []

      if (!UnprocessedKeys.length) {
        break
      }
      if (options.retryCount >= options.retryMaxCount) {
        throw new Error('awsDynamoDBBatchGet has UnprocessedKeys', {
          cause: {
            ...options,
            UnprocessedKeysCount: UnprocessedKeys.length
          }
        })
      }

      await timeout(3 ** options.retryCount++) // 3^10 == 59sec

      options.Keys = UnprocessedKeys
    }
  }
  return command(options)
}

export const awsDynamoDBPutStream = (options, streamOptions) => {
  options.retryCount ??= 0
  options.retryMaxCount ??= 10
  let batch = []
  const write = async (chunk) => {
    if (batch.length === 10) {
      await dynamodbBatchWrite(options, batch, streamOptions)
      batch = []
    }
    batch.push({
      PutRequest: {
        Item: chunk
      }
    })
  }
  streamOptions.final = () => dynamodbBatchWrite(options, batch, streamOptions)
  return createWritableStream(write, streamOptions)
}

export const awsDynamoDBDeleteStream = (options, streamOptions) => {
  options.retryCount ??= 0
  options.retryMaxCount ??= 10
  let batch = []
  const write = async (chunk) => {
    if (batch.length === 10) {
      await dynamodbBatchWrite(options, batch, options)
      batch = []
    }
    batch.push({
      DeleteRequest: {
        Key: chunk
      }
    })
  }
  streamOptions.final = () => dynamodbBatchWrite(options, batch, options)
  return createWritableStream(write, streamOptions)
}

const dynamodbBatchWrite = async (options, batch, streamOptions) => {
  const { UnprocessedItems } = await dynamodbDocument.send(
    new BatchWriteCommand({
      RequestItems: {
        [options.TableName]: batch
      }
    })
  )
  if (UnprocessedItems.length) {
    if (options.retryCount >= options.retryMaxCount) {
      throw new Error('awsDynamoDBBatchWrite has UnprocessedItems', {
        cause: {
          ...options,
          UnprocessedItemsCount: UnprocessedItems.length
        }
      })
    }

    await timeout(3 ** options.retryCount++) // 3^10 == 59sec
    return dynamodbBatchWrite(
      options,
      UnprocessedItems[options.TableName],
      options
    )
  }
  options.retryCount = 0 // reset for next batch
}
